// POST /api/resolve {url, track_title?} → track metadata (not saved).
import { json, error, readJson } from '../../lib/http.js';
import { resolveUrl, ResolveError } from '../../lib/resolve.js';

export async function onRequestPost({ request }) {
  const body = await readJson(request);
  if (!body || !body.url) return error('Send JSON like {"url": "https://artist.bandcamp.com/track/..."}');
  try {
    const track = await resolveUrl(body.url, { trackTitle: body.track_title });
    return json(track);
  } catch (e) {
    if (e instanceof ResolveError) return error(e.message, e.status);
    return error(`Resolve failed: ${e.message}`, 500);
  }
}
