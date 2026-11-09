// D1 queries shared by the public and admin APIs.

import { cleanUrl, intOrNull, strOrNull, slugify } from './http.js';

export const SHOW_FIELDS = 'id, slug, title, episode_no, air_date, blast_url, podcast_url, notes, status, created_at';

export async function getShowTracks(db, showId) {
  const { results } = await db.prepare(
    `SELECT st.position, st.segment_note, t.id, t.title, t.artist, t.album, t.duration_s, t.art_url,
            t.source, t.play_url, t.embed_id
       FROM show_tracks st JOIN tracks t ON t.id = st.track_id
      WHERE st.show_id = ?1
      ORDER BY st.position`,
  ).bind(showId).all();
  return results;
}

/** Published shows, newest first, with up to 4 cover images + totals for cards. */
export async function listPublishedShows(db) {
  const { results: shows } = await db.prepare(
    `SELECT ${SHOW_FIELDS},
            (SELECT COUNT(*) FROM show_tracks st WHERE st.show_id = s.id) AS track_count,
            (SELECT COALESCE(SUM(t.duration_s), 0) FROM show_tracks st JOIN tracks t ON t.id = st.track_id WHERE st.show_id = s.id) AS total_s
       FROM shows s
      WHERE status = 'published'
      ORDER BY COALESCE(air_date, substr(created_at, 1, 10)) DESC, created_at DESC`,
  ).all();
  if (!shows.length) return [];
  const { results: arts } = await db.prepare(
    `SELECT st.show_id, t.art_url FROM show_tracks st JOIN tracks t ON t.id = st.track_id
      JOIN shows s ON s.id = st.show_id
      WHERE s.status = 'published' AND st.position <= 4 ORDER BY st.show_id, st.position`,
  ).all();
  const byShow = {};
  for (const a of arts) (byShow[a.show_id] ||= []).push(a.art_url);
  return shows.map((s) => ({ ...s, covers: (byShow[s.id] || []).filter(Boolean) }));
}

export function showInput(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('title')) out.title = strOrNull(body.title, 200);
  if (!partial || has('slug')) out.slug = slugify(body.slug || body.title);
  if (!partial || has('episode_no')) out.episode_no = intOrNull(body.episode_no);
  if (!partial || has('air_date')) {
    const d = strOrNull(body.air_date, 10);
    out.air_date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }
  if (!partial || has('blast_url')) out.blast_url = cleanUrl(body.blast_url);
  if (!partial || has('podcast_url')) out.podcast_url = cleanUrl(body.podcast_url);
  if (!partial || has('notes')) out.notes = strOrNull(body.notes, 5000);
  if (!partial || has('status')) out.status = body.status === 'published' ? 'published' : 'draft';
  return out;
}

export function trackInput(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('title')) out.title = strOrNull(body.title, 300);
  if (!partial || has('artist')) out.artist = strOrNull(body.artist, 300);
  if (!partial || has('album')) out.album = strOrNull(body.album, 300);
  if (!partial || has('duration_s')) out.duration_s = intOrNull(body.duration_s);
  if (!partial || has('art_url')) out.art_url = cleanUrl(body.art_url);
  if (!partial || has('source')) out.source = ['bandcamp', 'youtube'].includes(body.source) ? body.source : null;
  if (!partial || has('play_url')) out.play_url = cleanUrl(body.play_url);
  if (!partial || has('embed_id')) {
    const e = strOrNull(body.embed_id, 100);
    out.embed_id = e && /^[A-Za-z0-9_=/-]+$/.test(e) ? e : null;
  }
  return out;
}

export async function getShowById(db, id) {
  return db.prepare(`SELECT ${SHOW_FIELDS} FROM shows WHERE id = ?1`).bind(id).first();
}

export async function uniqueSlug(db, base, excludeId = null) {
  const root = base || 'show';
  let slug = root;
  for (let i = 2; i < 200; i++) {
    const row = await db.prepare('SELECT id FROM shows WHERE slug = ?1').bind(slug).first();
    if (!row || row.id === excludeId) return slug;
    slug = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

/** Replace a show's ordered track list atomically. items: [{track_id, segment_note}] */
export async function replaceShowTracks(db, showId, items) {
  const stmts = [db.prepare('DELETE FROM show_tracks WHERE show_id = ?1').bind(showId)];
  items.forEach((it, i) => {
    stmts.push(
      db.prepare('INSERT INTO show_tracks (show_id, track_id, position, segment_note) VALUES (?1, ?2, ?3, ?4)')
        .bind(showId, it.track_id, i + 1, strOrNull(it.segment_note, 1000)),
    );
  });
  await db.batch(stmts);
}
