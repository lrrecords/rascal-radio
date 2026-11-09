// Everything under /api/admin/* needs a valid Cloudflare Access token.
import { requireAccess } from '../../../lib/access.js';

export const onRequest = (context) => requireAccess(context);
