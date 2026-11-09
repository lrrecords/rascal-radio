// POST /api/admin/import {url} → reads a public indiecrates.com crate page and
// returns its title + the Bandcamp link on each track row, in order.
// The browser then resolves each link via /api/resolve and builds a draft show.
// Only the Bandcamp page links are read; stream URLs on the page are ignored.
import { json, error, readJson } from '../../../lib/http.js';
import { parseCrate } from '../../../lib/crate.js';

export async function onRequestPost({ request }) {
  const body = await readJson(request);
  let u;
  try { u = new URL(String(body?.url || '').trim()); } catch { return error('Paste a crate URL like https://indiecrates.com/crates/lrrecords/rascal-radio-oct-26'); }
  if (!/^(www\.)?indiecrates\.com$/i.test(u.hostname) || !/^\/crates\/[^/]+\/[^/]+\/?$/.test(u.pathname)) {
    return error('Only public indiecrates.com crate URLs (…/crates/<user>/<crate>) are supported.');
  }
  u.search = ''; u.hash = '';
  const res = await fetch(u.toString(), { headers: { 'user-agent': 'RascalRadio/1.0', accept: 'text/html' } });
  if (!res.ok) return error(`Indiecrates returned HTTP ${res.status}`, 502);
  const crate = parseCrate(await res.text());
  if (!crate.items.length) return error('No Bandcamp track links found on that crate page.', 422);
  return json({ source_url: u.toString(), ...crate });
}
