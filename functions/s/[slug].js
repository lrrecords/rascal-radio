// /s/:slug → the public crate page, with OG/Twitter tags injected server-side so
// shared links get a proper preview card. The page itself loads data from /api/shows/:slug.
import { escapeHtml } from '../../lib/http.js';
import { renderTemplate } from '../../lib/pages.js';

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const slug = String(params.slug);
  const show = await env.DB.prepare(`SELECT id, title, air_date, notes FROM shows WHERE slug = ?1 AND status = 'published'`).bind(slug).first();
  let meta = '<meta name="robots" content="noindex">';
  let status = 404;
  if (show) {
    status = 200;
    const art = await env.DB.prepare('SELECT t.art_url FROM show_tracks st JOIN tracks t ON t.id = st.track_id WHERE st.show_id = ?1 ORDER BY st.position LIMIT 1').bind(show.id).first();
    const url = new URL(`/s/${encodeURIComponent(slug)}`, request.url).toString();
    const desc = show.notes || `Rascal Radio playlist${show.air_date ? ` — aired ${show.air_date}` : ''}. Little Rascal Records.`;
    meta = [
      `<title>${escapeHtml(show.title)} · Rascal Radio</title>`,
      `<meta name="description" content="${escapeHtml(desc.slice(0, 300))}">`,
      `<link rel="canonical" href="${escapeHtml(url)}">`,
      `<meta property="og:type" content="music.playlist">`,
      `<meta property="og:site_name" content="Rascal Radio">`,
      `<meta property="og:title" content="${escapeHtml(show.title)}">`,
      `<meta property="og:description" content="${escapeHtml(desc.slice(0, 300))}">`,
      `<meta property="og:url" content="${escapeHtml(url)}">`,
      art?.art_url ? `<meta property="og:image" content="${escapeHtml(art.art_url)}">` : '',
      `<meta name="twitter:card" content="summary_large_image">`,
      `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(new URL(`/embed/${encodeURIComponent(slug)}`, request.url).toString())}">`,
    ].join('\n    ');
  }
  return renderTemplate(context, '/show', meta, { status, frameAncestors: "'self'" });
}
