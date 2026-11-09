#!/usr/bin/env node
// Creates (or refreshes) a published 5-track show at /s/test using the API.
//   node scripts/seed-test.mjs            (dev server must be running)
const BASE = process.env.BASE || 'http://127.0.0.1:8788';

const LINKS = [
  { url: 'https://robotgodband.bandcamp.com/album/onto-the-afterlife', track_title: 'Soldier of Love', note: 'Opening the show' },
  { url: 'https://motsus.bandcamp.com/track/driver-2' },
  { url: 'https://www.youtube.com/watch?v=5dBJbXo5GB4', note: 'Perth’s own Twin Serpents' },
  { url: 'https://twinserpents.bandcamp.com/track/pillars-of-crom' },
  { url: 'https://salivatingred.bandcamp.com/album/autumnal-fog', track_title: 'Autumnal Fog' },
];

async function call(path, method = 'GET', body) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status}`);
  return data;
}

const items = [];
for (const l of LINKS) {
  const meta = await call('/api/resolve', 'POST', { url: l.url, track_title: l.track_title });
  const { track } = await call('/api/admin/tracks', 'POST', meta);
  items.push({ track_id: track.id, segment_note: l.note || null });
  console.log(`✓ ${track.title} — ${track.artist} (${track.source})`);
}

const { shows } = await call('/api/admin/shows');
let show = shows.find((s) => s.slug === 'test');
const fields = {
  title: 'Rascal Radio - Test Show', slug: 'test', episode_no: 0, air_date: '2026-11-09', status: 'published',
  blast_url: 'https://blast.radio', podcast_url: 'https://lrrecords.com.au/rascal-radio',
  notes: 'A five-track test crate for the Rascal Radio player.',
};
show = show ? (await call(`/api/admin/shows/${show.id}`, 'PUT', fields)).show : (await call('/api/admin/shows', 'POST', fields)).show;
await call(`/api/admin/shows/${show.id}/tracks`, 'PUT', { items });
console.log(`\nPublished ${BASE}/s/${show.slug}`);
