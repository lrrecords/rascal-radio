// GET /api/stream/:trackId → 302 to the Bandcamp stream link for that track.
// Used by the player's <audio> element so shows play straight through.
// 404/502 JSON tells the player to fall back to the official Bandcamp embed.
import { error, intOrNull } from '../../../lib/http.js';
import { findBandcampStream, STREAM_TTL_S } from '../../../lib/bandcamp-stream.js';

export async function onRequestGet({ env, params, waitUntil }) {
  const id = intOrNull(params.id);
  if (!id) return error('Track not found', 404);
  const cache = caches.default;
  const key = new Request(`https://stream-cache.rascal-radio.internal/${id}`);
  let url = null;
  const hit = await cache.match(key);
  if (hit) url = (await hit.json()).url;
  if (!url) {
    const t = await env.DB.prepare(`SELECT play_url, embed_id FROM tracks WHERE id = ?1 AND source = 'bandcamp'`).bind(id).first();
    if (!t) return error('Track not found', 404);
    try {
      url = await findBandcampStream(t.play_url, t.embed_id);
    } catch (e) {
      return error(e.message, e.status || 502);
    }
    waitUntil(cache.put(key, new Response(JSON.stringify({ url }), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STREAM_TTL_S}` },
    })));
  }
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
