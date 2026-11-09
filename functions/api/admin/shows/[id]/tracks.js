// show_tracks for one show.
// GET  /api/admin/shows/:id/tracks → ordered list
// PUT  /api/admin/shows/:id/tracks {items:[{track_id, segment_note}]} → replace order/notes
// POST /api/admin/shows/:id/tracks {track_id, segment_note?} → append one
import { json, error, readJson, intOrNull, strOrNull } from '../../../../../lib/http.js';
import { getShowById, getShowTracks, replaceShowTracks } from '../../../../../lib/db.js';

async function loadShow(env, params) {
  const id = intOrNull(params.id);
  return id ? getShowById(env.DB, id) : null;
}

export async function onRequestGet({ env, params }) {
  const show = await loadShow(env, params);
  if (!show) return error('Show not found', 404);
  return json({ tracks: await getShowTracks(env.DB, show.id) });
}

export async function onRequestPut({ request, env, params }) {
  const show = await loadShow(env, params);
  if (!show) return error('Show not found', 404);
  const body = await readJson(request);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) return error('Send {"items": [{"track_id": 1, "segment_note": "..."}]}');
  if (items.length > 300) return error('Too many tracks');
  const clean = items.map((it) => ({ track_id: intOrNull(it.track_id), segment_note: it.segment_note }));
  if (clean.some((it) => !it.track_id)) return error('Every item needs a track_id');
  const ids = [...new Set(clean.map((it) => it.track_id))];
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM tracks WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`).bind(...ids).all();
    if (results.length !== ids.length) return error('Unknown track_id in items');
  }
  await replaceShowTracks(env.DB, show.id, clean);
  return json({ tracks: await getShowTracks(env.DB, show.id) });
}

export async function onRequestPost({ request, env, params }) {
  const show = await loadShow(env, params);
  if (!show) return error('Show not found', 404);
  const body = await readJson(request);
  const trackId = intOrNull(body?.track_id);
  if (!trackId || !(await env.DB.prepare('SELECT id FROM tracks WHERE id = ?1').bind(trackId).first())) return error('Unknown track_id');
  const { next } = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM show_tracks WHERE show_id = ?1').bind(show.id).first();
  await env.DB.prepare('INSERT INTO show_tracks (show_id, track_id, position, segment_note) VALUES (?1, ?2, ?3, ?4)')
    .bind(show.id, trackId, next, strOrNull(body.segment_note, 1000)).run();
  return json({ tracks: await getShowTracks(env.DB, show.id) }, 201);
}
