// Unit tests for the Cloudflare Access JWT check: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccess } from '../lib/access.js';

const TEAM = 'example.cloudflareaccess.com';
const AUD = 'aud-123';
const b64url = (buf) => Buffer.from(buf).toString('base64url');

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
globalThis.fetch = async (url) => {
  assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [jwk] }));
};

async function sign(payload, kid = 'k1') {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
const req = (token) => new Request('https://rascalradio.lrrecords.com.au/api/admin/shows', { headers: token ? { 'cf-access-jwt-assertion': token } : {} });
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const good = { aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: 'editor@example.com' };

test('valid token passes', async () => {
  const r = await verifyAccess(req(await sign(good)), env);
  assert.equal(r.ok, true);
});
test('locked when not configured', async () => {
  const r = await verifyAccess(req(await sign(good)), {});
  assert.deepEqual([r.ok, r.status], [false, 503]);
});
test('missing token → 401', async () => {
  assert.equal((await verifyAccess(req(null), env)).status, 401);
});
test('wrong audience, wrong issuer, expired → 403', async () => {
  for (const bad of [{ ...good, aud: ['other'] }, { ...good, iss: 'https://evil.cloudflareaccess.com' }, { ...good, exp: 1 }]) {
    const r = await verifyAccess(req(await sign(bad)), env);
    assert.deepEqual([r.ok, r.status], [false, 403], JSON.stringify(bad));
  }
});
test('tampered payload → 403', async () => {
  const [h, , s] = (await sign(good)).split('.');
  const forged = `${h}.${b64url(JSON.stringify({ ...good, email: 'x@evil.com' }))}.${s}`;
  assert.equal((await verifyAccess(req(forged), env)).status, 403);
});
