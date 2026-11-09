// /admin pages are also gated (Access protects them at the edge; this refuses
// requests that arrive without a valid Access token, e.g. via *.pages.dev).
import { requireAccess } from '../../lib/access.js';

export const onRequest = (context) => requireAccess(context, { html: true });
