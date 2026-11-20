// GET/PUT/DELETE /api/admin/shows/:id
import { json, error, readJson, intOrNull } from '../../../../../lib/http.js';
import { showInput, getShowById, getShowTracks, uniqueSlug } from '../../../../../lib/db.js';

export async function onRequestGet({ env, params }) {
  const id = intOrNull(params.id);
  const show = id && await getShowById(env.DB, id);
  if (!show) return error('Show not found', 404);
  return json({ show, tracks: await getShowTracks(env.DB, id) });
}

export async function onRequestPut({ request, env, params }) {
  const id = intOrNull(params.id);
  if (!id || !(await getShowById(env.DB, id))) return error('Show not found', 404);
  const body = await readJson(request);
  if (!body) return error('Invalid JSON');
  const s = showInput(body, { partial: true });
  if ('title' in s && !s.title) return error('Title cannot be empty');
  if ('slug' in s) {
    if (!s.slug) delete s.slug;
    else s.slug = await uniqueSlug(env.DB, s.slug, id);
  }
  const keys = Object.keys(s);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = ?${i + 1}`).join(', ');
    await env.DB.prepare(`UPDATE shows SET ${sets} WHERE id = ?${keys.length + 1}`).bind(...keys.map((k) => s[k]), id).run();
  }
  return json({ show: await getShowById(env.DB, id), tracks: await getShowTracks(env.DB, id) });
}

export async function onRequestDelete({ env, params }) {
  const id = intOrNull(params.id);
  const res = await env.DB.prepare('DELETE FROM shows WHERE id = ?1').bind(id).run();
  if (!res.meta.changes) return error('Show not found', 404);
  return json({ deleted: id });
}
