// GET /api/shows → published shows, newest first.
import { json } from '../../../lib/http.js';
import { listPublishedShows } from '../../../lib/db.js';

export async function onRequestGet({ env }) {
  const shows = await listPublishedShows(env.DB);
  return json({ shows }, 200, { 'cache-control': 'public, max-age=60' });
}
