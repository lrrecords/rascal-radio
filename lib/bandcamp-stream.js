// Finds the current streaming link for a Bandcamp track: the same mp3-128 link
// Bandcamp's own pages play (data-tralbum → trackinfo[].file). The browser is
// redirected to it; audio never passes through this app. The links expire, so
// they are looked up on demand and cached at the edge for a short time.
import { decodeEntities, ResolveError } from './resolve.js';

const UA = 'Mozilla/5.0 (compatible; RascalRadio/1.0; +https://rascalradio.lrrecords.com.au)';
export const STREAM_TTL_S = 60 * 60;

/** embed_id "track=1", "album=2/track=1" or "album=2" → the wanted track id (or null = first). */
export function wantedTrackId(embedId) {
  const m = /(?:^|\/)track=(\d+)/.exec(String(embedId || ''));
  return m ? Number(m[1]) : null;
}

export function parseTrackinfo(html) {
  const m = /data-tralbum="([^"]+)"/.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(decodeEntities(m[1]));
    return Array.isArray(data.trackinfo) ? data.trackinfo : null;
  } catch {
    return null;
  }
}

export function pickStream(trackinfo, trackId) {
  if (!trackinfo || !trackinfo.length) return null;
  const hasFile = (t) => t && t.file && t.file['mp3-128'];
  const t = trackId != null
    ? trackinfo.find((x) => Number(x.id) === trackId || Number(x.track_id) === trackId)
    : trackinfo.find(hasFile);
  if (!hasFile(t)) return null;
  const url = String(t.file['mp3-128']);
  return /^https:\/\/[a-z0-9.-]+\.bcbits\.com\/stream\//i.test(url) ? url : null;
}

export async function findBandcampStream(playUrl, embedId) {
  const u = new URL(playUrl);
  if (!(u.hostname === 'bandcamp.com' || u.hostname.endsWith('.bandcamp.com'))) throw new ResolveError('Not a Bandcamp page', 400);
  const res = await fetch(u.toString(), { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new ResolveError(`Bandcamp returned HTTP ${res.status}`, 502);
  const url = pickStream(parseTrackinfo(await res.text()), wantedTrackId(embedId));
  if (!url) throw new ResolveError('No stream for this track on Bandcamp (not streamable, or the page changed).', 404);
  return url;
}
