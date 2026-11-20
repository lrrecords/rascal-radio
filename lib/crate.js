// Parse a public Indiecrates crate page: title + the Bandcamp link on each row.
import { decodeEntities, metaContent } from './resolve.js';

export function parseCrate(html) {
  let title = null;
  let description = null;
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(html);
  if (ld) {
    try {
      const d = JSON.parse(ld[1]);
      if (d['@type'] === 'MusicPlaylist') { title = d.name; description = d.description || null; }
    } catch { /* fall through */ }
  }
  if (!title) title = (metaContent(html, 'og:title') || '').replace(/ by [^ ]+$/, '') || null;

  const items = [];
  const re = /<a\s[^>]*class="[^"]*\btrack-bandcamp-link\b[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const href = /href="([^"]+)"/i.exec(tag);
    if (!href) continue;
    const label = /aria-label="Buy (.*) on Bandcamp"/i.exec(tag);
    const artist = /data-track-link-artist-value="([^"]*)"/i.exec(tag);
    items.push({
      url: decodeEntities(href[1]),
      title: label ? decodeEntities(label[1]) : null,
      artist: artist ? decodeEntities(artist[1]) : null,
    });
  }
  return { title, description, items };
}
