// /embed/:slug?size=compact|full → iframe-friendly player.
// frame-ancestors allows lrrecords.com.au (and subdomains) to embed it.
import { renderTemplate } from '../../lib/pages.js';
import { isLocalRequest } from '../../lib/http.js';

export async function onRequestGet(context) {
  const ancestors = ["'self'", 'https://lrrecords.com.au', 'https://*.lrrecords.com.au'];
  if (isLocalRequest(context.request)) ancestors.push('http://localhost:*', 'http://127.0.0.1:*');
  return renderTemplate(context, '/embed', '<meta name="robots" content="noindex">', { frameAncestors: ancestors.join(' ') });
}
