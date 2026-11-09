// GET  /api/admin/tracks → library (newest first)
// POST /api/admin/tracks → create (or return existing with the same source + embed_id)
import { json, error, readJson } from '../../../../lib/http.js';
import { trackInput } from '../../../../lib/db.js';

const FIELDS = 'id, title, artist, album, duration_s, art_url, source, play_url, embed_id, created_at';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`SELECT ${FIELDS} FROM tracks ORDER BY id DESC LIMIT 500`).all();
  return json({ tracks: results });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return error('Invalid JSON');
  const t = trackInput(body);
  if (!t.title || !t.source || !t.play_url || !t.embed_id) return error('title, source, play_url and embed_id are required');
  const existing = await env.DB.prepare(`SELECT ${FIELDS} FROM tracks WHERE source = ?1 AND embed_id = ?2`).bind(t.source, t.embed_id).first();
  if (existing) return json({ track: existing, existing: true });
  const track = await env.DB.prepare(
    `INSERT INTO tracks (title, artist, album, duration_s, art_url, source, play_url, embed_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING ${FIELDS}`,
  ).bind(t.title, t.artist, t.album, t.duration_s, t.art_url, t.source, t.play_url, t.embed_id).first();
  return json({ track }, 201);
}
