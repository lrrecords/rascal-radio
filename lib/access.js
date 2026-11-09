// Verifies the Cloudflare Access JWT on admin requests (defence in depth).
// Cloudflare Access does the actual login at the edge; this only checks the
// signed assertion Access attaches, so a request that bypasses Access (e.g. the
// *.pages.dev hostname without a policy) is refused. Fails closed.

import { error, isLocalRequest } from './http.js';

let certCache = { url: null, keys: null, at: 0 };

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodePart(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(teamDomain) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if (certCache.url === url && certCache.keys && Date.now() - certCache.at < 10 * 60 * 1000) return certCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`certs HTTP ${res.status}`);
  const { keys } = await res.json();
  certCache = { url, keys, at: Date.now() };
  return keys;
}

function readToken(request) {
  const h = request.headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const cookie = request.headers.get('cookie') || '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? m[1] : null;
}

export async function verifyAccess(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = String(env.ACCESS_AUD || '');
  if (!team || !aud) return { ok: false, status: 503, reason: 'Admin is locked: set ACCESS_TEAM_DOMAIN and ACCESS_AUD (see README).' };

  const token = readToken(request);
  if (!token) return { ok: false, status: 401, reason: 'Missing Cloudflare Access token.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'Malformed Access token.' };

  try {
    const header = decodePart(parts[0]);
    const payload = decodePart(parts[1]);
    if (header.alg !== 'RS256') throw new Error('unexpected alg');
    const keys = await getKeys(team);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('unknown key');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new Error('bad signature');
    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
    if (!audOk) throw new Error('wrong audience');
    if (payload.iss !== `https://${team}`) throw new Error('wrong issuer');
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) throw new Error('expired');
    return { ok: true, email: payload.email || null };
  } catch (e) {
    return { ok: false, status: 403, reason: `Access token rejected (${e.message}).` };
  }
}

/** Pages middleware body shared by /admin/* and /api/admin/*. */
export async function requireAccess(context, { html = false } = {}) {
  const { request, env } = context;
  if (env.DEV_ONLY_SKIP_ACCESS_CHECK === '1' && isLocalRequest(request)) return context.next();
  const result = await verifyAccess(request, env);
  if (result.ok) return context.next();
  if (html) {
    return new Response(`<!doctype html><meta charset="utf-8"><title>Locked</title><body style="background:#0a0a0a;color:#f2efe6;font-family:system-ui;padding:2rem"><h1>Admin locked</h1><p>${result.reason}</p>`, {
      status: result.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return error(result.reason, result.status);
}
