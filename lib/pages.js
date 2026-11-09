// Serve a static HTML template from /public with extra <head> tags and a
// Content-Security-Policy whose frame-ancestors we control per route.

export async function renderTemplate({ env, request }, path, headExtra, { status = 200, frameAncestors = "'self'" } = {}) {
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  let html = await res.text();
  html = html.replace('<!--HEAD-->', headExtra || '');
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'content-security-policy': `frame-ancestors ${frameAncestors}`,
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  });
}
