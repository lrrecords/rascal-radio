// GET  /api/admin/shows → all shows (drafts + published)
// POST /api/admin/shows → create a show
import { json, error, readJson } from '../../../../lib/http.js';
import { SHOW_FIELDS, showInput, uniqueSlug, getShowById } from '../../../../lib/db.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT ${SHOW_FIELDS}, (SELECT COUNT(*) FROM show_tracks st WHERE st.show_id = s.id) AS track_count
       FROM shows s ORDER BY COALESCE(air_date, substr(created_at, 1, 10)) DESC, id DESC`,
  ).all();
  return json({ shows: results });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return error('Invalid JSON');
  const s = showInput(body);
  if (!s.title) return error('Title is required');
  s.slug = await uniqueSlug(env.DB, s.slug);
  const row = await env.DB.prepare(
    `INSERT INTO shows (slug, title, episode_no, air_date, blast_url, podcast_url, notes, status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`,
  ).bind(s.slug, s.title, s.episode_no, s.air_date, s.blast_url, s.podcast_url, s.notes, s.status).first();
  return json({ show: await getShowById(env.DB, row.id) }, 201);
}
