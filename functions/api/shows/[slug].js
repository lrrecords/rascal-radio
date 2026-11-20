// GET /api/shows/:slug → a published show with its ordered tracks.
import { json, error } from '../../../lib/http.js';
import { SHOW_FIELDS, getShowTracks } from '../../../lib/db.js';

export async function onRequestGet({ env, params }) {
  const show = await env.DB.prepare(`SELECT ${SHOW_FIELDS} FROM shows WHERE slug = ?1 AND status = 'published'`)
    .bind(String(params.slug)).first();
  if (!show) return error('Show not found', 404);
  const tracks = await getShowTracks(env.DB, show.id);
  return json({ show, tracks }, 200, { 'cache-control': 'public, max-age=60' });
}
