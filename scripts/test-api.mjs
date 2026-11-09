#!/usr/bin/env node
// Smoke test for the API against a running dev server:
//   npx wrangler pages dev            (in one terminal; needs .dev.vars, see README)
//   node scripts/test-api.mjs         (in another)
// BASE=https://… node scripts/test-api.mjs   to point somewhere else (admin calls need Access there).
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
let failures = 0;

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✕ ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

console.log(`Rascal Radio API tests → ${BASE}\n`);

await test('resolve Bandcamp album URL', async () => {
  const { status, data } = await call('/api/resolve', { method: 'POST', body: { url: 'https://robotgodband.bandcamp.com/album/onto-the-afterlife' } });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.source, 'bandcamp');
  assert.match(data.embed_id, /^album=\d+\/track=\d+$/);
  assert.equal(data.album, 'Onto The Afterlife');
  assert.equal(data.artist, 'Robot God');
  assert.ok(data.title, 'title');
  assert.ok(data.duration_s > 0, 'duration_s');
  assert.match(data.art_url, /^https:\/\/f4\.bcbits\.com\//);
});

await test('resolve Bandcamp album URL with a track hint picks that track', async () => {
  const { status, data } = await call('/api/resolve', { method: 'POST', body: { url: 'https://robotgodband.bandcamp.com/album/onto-the-afterlife', track_title: 'Soldier of Love' } });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.title, 'Soldier of Love');
});

await test('resolve Bandcamp track URL', async () => {
  const { status, data } = await call('/api/resolve', { method: 'POST', body: { url: 'https://motsus.bandcamp.com/track/driver-2' } });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.source, 'bandcamp');
  assert.match(data.embed_id, /^track=\d+$/);
  assert.equal(data.title, 'Driver');
  assert.equal(data.artist, 'MOTSUS');
  assert.ok(data.duration_s > 0, 'duration_s');
});

await test('resolve YouTube URL', async () => {
  const { status, data } = await call('/api/resolve', { method: 'POST', body: { url: 'https://www.youtube.com/watch?v=5dBJbXo5GB4' } });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.source, 'youtube');
  assert.equal(data.embed_id, '5dBJbXo5GB4');
  assert.ok(data.title, 'title');
  assert.ok(data.art_url, 'art_url');
});

await test('resolve youtu.be short link', async () => {
  const { status, data } = await call('/api/resolve', { method: 'POST', body: { url: 'https://youtu.be/5dBJbXo5GB4' } });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.embed_id, '5dBJbXo5GB4');
});

await test('resolve rejects unsupported hosts', async () => {
  const { status } = await call('/api/resolve', { method: 'POST', body: { url: 'https://example.com/song' } });
  assert.equal(status, 400);
});

await test('admin CRUD: show + tracks + publish + public read', async () => {
  const slug = `api-test-${Date.now()}`;
  const created = await call('/api/admin/shows', { method: 'POST', body: { title: 'API test show', slug, air_date: '2026-11-09' } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.show.id;
  let trackId = null;
  try {
    const embedId = `test-${Date.now()}`;
    const tr = await call('/api/admin/tracks', { method: 'POST', body: { title: 'T', artist: 'A', source: 'youtube', play_url: 'https://www.youtube.com/watch?v=5dBJbXo5GB4', embed_id: embedId } });
    assert.equal(tr.status, 201, JSON.stringify(tr.data));
    trackId = tr.data.track.id;
    const put = await call(`/api/admin/shows/${id}/tracks`, { method: 'PUT', body: { items: [{ track_id: tr.data.track.id, segment_note: 'Opener' }] } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.tracks[0].segment_note, 'Opener');

    assert.equal((await call(`/api/shows/${slug}`)).status, 404, 'drafts are not public');
    const pub = await call(`/api/admin/shows/${id}`, { method: 'PUT', body: { status: 'published' } });
    assert.equal(pub.data.show.status, 'published');
    const pubRead = await call(`/api/shows/${slug}`);
    assert.equal(pubRead.status, 200);
    assert.equal(pubRead.data.tracks.length, 1);
    const list = await call('/api/shows');
    assert.ok(list.data.shows.some((s) => s.slug === slug), 'listed on /api/shows');
  } finally {
    const del = await call(`/api/admin/shows/${id}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    if (trackId) assert.equal((await call(`/api/admin/tracks/${trackId}`, { method: 'DELETE' })).status, 200);
  }
});

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
