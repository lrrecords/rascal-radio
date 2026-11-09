// GET/PUT/DELETE /api/admin/tracks/:id
import { json, error, readJson, intOrNull } from '../../../../lib/http.js';
import { trackInput } from '../../../../lib/db.js';

const FIELDS = 'id, title, artist, album, duration_s, art_url, source, play_url, embed_id, created_at';
const get = (env, id) => env.DB.prepare(`SELECT ${FIELDS} FROM tracks WHERE id = ?1`).bind(id).first();

export async function onRequestGet({ env, params }) {
  const t = await get(env, intOrNull(params.id));
  return t ? json({ track: t }) : error('Track not found', 404);
}

export async function onRequestPut({ request, env, params }) {
  const id = intOrNull(params.id);
  if (!id || !(await get(env, id))) return error('Track not found', 404);
  const body = await readJson(request);
  if (!body) return error('Invalid JSON');
  const t = trackInput(body, { partial: true });
  for (const k of ['title', 'source', 'play_url', 'embed_id']) if (k in t && !t[k]) return error(`${k} cannot be empty`);
  const keys = Object.keys(t);
  if (keys.length) {
    await env.DB.prepare(`UPDATE tracks SET ${keys.map((k, i) => `${k} = ?${i + 1}`).join(', ')} WHERE id = ?${keys.length + 1}`)
      .bind(...keys.map((k) => t[k]), id).run();
  }
  return json({ track: await get(env, id) });
}

export async function onRequestDelete({ env, params }) {
  const id = intOrNull(params.id);
  const res = await env.DB.prepare('DELETE FROM tracks WHERE id = ?1').bind(id).run();
  return res.meta.changes ? json({ deleted: id }) : error('Track not found', 404);
}
