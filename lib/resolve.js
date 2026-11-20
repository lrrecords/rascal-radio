// Resolve a Bandcamp or YouTube link into track metadata.
// Bandcamp: reads the public page's meta tags + JSON-LD and builds an official
// EmbeddedPlayer reference. Audio files are never extracted or proxied.

const UA = 'RascalRadio/1.0 (+https://rascalradio.lrrecords.com.au)';

export class ResolveError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

export function detectSource(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    throw new ResolveError('That is not a valid URL.', 400);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ResolveError('Only http(s) links are supported.', 400);
  const host = u.hostname.toLowerCase();
  if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) return { source: 'bandcamp', url: u };
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(host)) {
    return { source: 'youtube', url: u };
  }
  throw new ResolveError('Only Bandcamp (artist.bandcamp.com) and YouTube links are supported.', 400);
}

export async function resolveUrl(rawUrl, opts = {}) {
  const { source, url } = detectSource(rawUrl);
  return source === 'bandcamp' ? resolveBandcamp(url, opts) : resolveYouTube(url);
}

// ---------- Bandcamp ----------

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Find <meta property|name="key" content="..."> regardless of attribute order. */
export function metaContent(html, key) {
  const re = /<meta\s+([^>]+?)\/?>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const k = /(?:property|name)\s*=\s*"([^"]+)"/i.exec(attrs);
    if (k && k[1].toLowerCase() === key.toLowerCase()) {
      const c = /content\s*=\s*"([^"]*)"/i.exec(attrs);
      return c ? decodeEntities(c[1]) : null;
    }
  }
  return null;
}

/** ISO-8601 duration like P00H06M40S or PT3M10S → seconds. */
export function isoDurationToSeconds(d) {
  if (!d) return null;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/i.exec(String(d));
  if (!m) return null;
  const [, days, h, min, s] = m;
  const total = (+days || 0) * 86400 + (+h || 0) * 3600 + (+min || 0) * 60 + Math.round(+s || 0);
  return total || null;
}

function jsonLd(html) {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      if (data && (data['@type'] === 'MusicAlbum' || data['@type'] === 'MusicRecording')) return data;
    } catch { /* ignore */ }
  }
  return null;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function parseBandcampHtml(html, pageUrl, opts = {}) {
  const propsRaw = metaContent(html, 'bc-page-properties');
  let props = null;
  try { props = propsRaw ? JSON.parse(propsRaw) : null; } catch { props = null; }
  if (!props || !props.item_id || !['a', 't'].includes(props.item_type)) {
    throw new ResolveError('Could not find a Bandcamp album or track on that page.');
  }
  const kind = props.item_type === 'a' ? 'album' : 'track';
  const ogTitle = metaContent(html, 'og:title') || '';
  const siteName = metaContent(html, 'og:site_name');
  const ogImage = metaContent(html, 'og:image');
  const ld = jsonLd(html);

  // og:title is "Title, by Artist"
  const byIdx = ogTitle.lastIndexOf(', by ');
  const ogName = byIdx > -1 ? ogTitle.slice(0, byIdx) : ogTitle;
  const ogArtist = byIdx > -1 ? ogTitle.slice(byIdx + 5) : null;
  const pageArtist = ld?.byArtist?.name || ogArtist || siteName || null;

  if (kind === 'track') {
    return {
      title: ld?.name || ogName,
      artist: pageArtist,
      album: ld?.inAlbum?.name || null,
      duration_s: isoDurationToSeconds(ld?.duration),
      art_url: ogImage,
      source: 'bandcamp',
      play_url: pageUrl,
      embed_id: `track=${props.item_id}`,
    };
  }

  // Album page: a playlist row is one track, so pick the hinted track
  // (e.g. the title shown on an Indiecrates row), otherwise track 1.
  const albumTitle = ld?.name || ogName;
  const items = (ld?.track?.itemListElement || []).map((e) => e.item || e).filter(Boolean);
  let pick = null;
  if (opts.trackTitle && items.length) {
    const want = norm(opts.trackTitle);
    pick = items.find((t) => norm(t.name) === want) || items.find((t) => norm(t.name).includes(want) || want.includes(norm(t.name)));
  }
  if (!pick) pick = items[0] || null;
  const trackId = pick?.additionalProperty?.find((p) => p.name === 'track_id')?.value;

  return {
    title: pick?.name || albumTitle,
    artist: pick?.byArtist?.name || pageArtist,
    album: albumTitle,
    duration_s: isoDurationToSeconds(pick?.duration),
    art_url: ogImage,
    source: 'bandcamp',
    play_url: pageUrl,
    embed_id: trackId ? `album=${props.item_id}/track=${trackId}` : `album=${props.item_id}`,
  };
}

async function resolveBandcamp(url, opts) {
  url.hash = '';
  const pageUrl = url.toString();
  let res;
  try {
    res = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  } catch (e) {
    throw new ResolveError(`Could not reach Bandcamp (${e.message}).`, 502);
  }
  if (!res.ok) throw new ResolveError(`Bandcamp returned HTTP ${res.status} for that link.`, 502);
  const finalHost = new URL(res.url || pageUrl).hostname;
  if (!(finalHost === 'bandcamp.com' || finalHost.endsWith('.bandcamp.com'))) {
    throw new ResolveError('That link redirected away from Bandcamp.', 422);
  }
  const html = await res.text();
  return parseBandcampHtml(html, pageUrl, opts);
}

export function bandcampEmbedSrc(embedId, { size = 'small' } = {}) {
  return `https://bandcamp.com/EmbeddedPlayer/${embedId}/size=${size}/bgcol=0b0b0b/linkcol=ff4d2e/artwork=none/transparent=true/`;
}

// ---------- YouTube ----------

export function youTubeId(u) {
  const url = u instanceof URL ? u : new URL(u);
  const host = url.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (url.searchParams.get('v')) id = url.searchParams.get('v');
  else {
    const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
    if (m) id = m[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** "Artist - Title (Official Video)" → { artist, title } */
export function splitYouTubeTitle(raw, author) {
  const cleanAuthor = String(author || '').replace(/\s*-\s*Topic$/i, '').trim() || null;
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(String(raw || ''));
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: cleanAuthor, title: String(raw || '').trim() };
}

async function resolveYouTube(url) {
  const id = youTubeId(url);
  if (!id) throw new ResolveError('Could not find a YouTube video id in that link.', 400);
  const watch = `https://www.youtube.com/watch?v=${id}`;
  let res;
  try {
    res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { headers: { 'user-agent': UA } });
  } catch (e) {
    throw new ResolveError(`Could not reach YouTube (${e.message}).`, 502);
  }
  if (res.status === 401 || res.status === 403) throw new ResolveError('That YouTube video does not allow embedding.', 422);
  if (!res.ok) throw new ResolveError(`YouTube oEmbed returned HTTP ${res.status} (private or removed video?).`, 422);
  const o = await res.json();
  const { artist, title } = splitYouTubeTitle(o.title, o.author_name);
  return {
    title,
    artist,
    album: null,
    duration_s: null, // oEmbed has no duration; the player fills it in once known, or edit it in /admin
    art_url: o.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    source: 'youtube',
    play_url: watch,
    embed_id: id,
  };
}
