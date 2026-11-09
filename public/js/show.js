// Public crate page: /s/:slug
import { api, esc, fmtDur, fmtDate, collageHtml, ICONS, copyText, shuffled } from './common.js';
import { QueuePlayer } from './player.js';

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const main = document.getElementById('crate');
let data;
try {
  data = await api(`/api/shows/${encodeURIComponent(slug)}`);
} catch (e) {
  main.innerHTML = `<div class="empty-state"><h1>Show not found</h1><p><a href="/">Back to all shows</a></p></div>`;
  throw e;
}
const { show, tracks } = data;
const total = tracks.reduce((a, t) => a + (t.duration_s || 0), 0);
const pageUrl = `${location.origin}/s/${encodeURIComponent(show.slug)}`;
if (!document.title) document.title = `${show.title} · Rascal Radio`;

main.innerHTML = `
  <section class="crate-head">
    ${collageHtml(tracks.slice(0, 4).map((t) => t.art_url), `${show.title} cover collage`)}
    <div class="crate-meta">
      <div class="kicker">Rascal Radio${show.episode_no ? ` · Episode ${esc(show.episode_no)}` : ''}</div>
      <h1>${esc(show.title)}</h1>
      <p class="stats">${[show.air_date ? `Aired ${esc(fmtDate(show.air_date))}` : '', `${tracks.length} tracks`, total ? fmtDur(total) : ''].filter(Boolean).join(' · ')}</p>
      ${show.notes ? `<p class="crate-notes">${esc(show.notes)}</p>` : ''}
      <div class="btn-row">
        <button type="button" class="btn btn-primary" id="play">${ICONS.play} Play</button>
        <button type="button" class="btn" id="shuffle">${ICONS.shuffle} Shuffle</button>
        <button type="button" class="btn" id="share-btn">${ICONS.share} Share</button>
        ${show.blast_url ? `<a class="btn" href="${esc(show.blast_url)}" target="_blank" rel="noopener">${ICONS.radio} Blast Radio</a>` : ''}
        ${show.podcast_url ? `<a class="btn" href="${esc(show.podcast_url)}" target="_blank" rel="noopener">${ICONS.podcast} Podcast</a>` : ''}
      </div>
    </div>
  </section>
  <ol class="tracklist" id="tracks">
    ${tracks.map((t, i) => `
      <li class="track" data-i="${i}">
        <span class="pos">${t.position}</span>
        <button type="button" class="art-btn" data-play="${i}" aria-label="Play ${esc(t.title)}">
          ${t.art_url ? `<img src="${esc(t.art_url)}" alt="" loading="lazy" width="52" height="52">` : ''}
        </button>
        <div class="info">
          <div class="title">${esc(t.title)}</div>
          <div class="artist">${esc(t.artist || '')}</div>
          ${t.segment_note ? `<div class="note">${esc(t.segment_note)}</div>` : ''}
        </div>
        <div class="side">
          <span class="dur">${ICONS[t.source] || ''}<span class="d">${fmtDur(t.duration_s)}</span><span class="sr-only">${t.source === 'youtube' ? 'YouTube' : 'Bandcamp'}</span></span>
          ${t.source === 'bandcamp'
            ? `<a class="buy" href="${esc(t.play_url)}" target="_blank" rel="noopener">Buy on Bandcamp</a>`
            : `<a class="buy" href="${esc(t.play_url)}" target="_blank" rel="noopener">Watch on YouTube</a>`}
        </div>
      </li>`).join('')}
  </ol>`;

// ---------- player ----------
const rows = [...document.querySelectorAll('#tracks .track')];
const player = new QueuePlayer(document.getElementById('player'), {
  mode: 'sticky',
  onChange(track) {
    rows.forEach((r) => r.classList.toggle('now', Number(r.dataset.i) === tracks.indexOf(track)));
    const row = rows[tracks.indexOf(track)];
    if (row && track.duration_s) row.querySelector('.d').textContent = fmtDur(track.duration_s);
  },
});
window.rrPlayer = player; // handy for debugging in the console
document.getElementById('play').addEventListener('click', () => player.load(tracks, 0));
document.getElementById('shuffle').addEventListener('click', () => player.load(shuffled(tracks), 0));
document.getElementById('tracks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-play]');
  if (!b) return;
  const i = Number(b.dataset.play);
  // Clicking a row plays the show in order from that track.
  if (player.queue.length === tracks.length && player.queue.every((t, k) => t === tracks[k])) player.playAt(i);
  else player.load(tracks, i);
});

// ---------- share dialog ----------
const dlg = document.getElementById('share');
const text = `${show.title} — Rascal Radio by Little Rascal Records`;
const enc = encodeURIComponent;
const links = [
  ['X', `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(pageUrl)}`],
  ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(pageUrl)}`],
  ['Bluesky', `https://bsky.app/intent/compose?text=${enc(`${text} ${pageUrl}`)}`],
  ['Threads', `https://www.threads.net/intent/post?text=${enc(`${text} ${pageUrl}`)}`],
  ['Reddit', `https://www.reddit.com/submit?url=${enc(pageUrl)}&title=${enc(text)}`],
  ['WhatsApp', `https://wa.me/?text=${enc(`${text} ${pageUrl}`)}`],
  ['Email', `mailto:?subject=${enc(text)}&body=${enc(pageUrl)}`],
];
document.getElementById('share-links').innerHTML =
  links.map(([name, href]) => `<a class="btn btn-sm" href="${esc(href)}" target="_blank" rel="noopener">${name}</a>`).join('') +
  (navigator.share ? '<button type="button" class="btn btn-sm" id="native-share">More…</button>' : '');
document.getElementById('native-share')?.addEventListener('click', () => navigator.share({ title: show.title, text, url: pageUrl }).catch(() => {}));
document.getElementById('share-url').value = pageUrl;

let size = 'compact';
function embedCode() {
  const h = size === 'compact' ? 152 : 480;
  const src = `${location.origin}/embed/${encodeURIComponent(show.slug)}?size=${size}`;
  document.getElementById('embed-preview').href = src;
  return `<iframe src="${src}" width="100%" height="${h}" style="border:0;border-radius:12px;max-width:100%" loading="lazy" allow="autoplay; encrypted-media; clipboard-write" title="Rascal Radio: ${esc(show.title)}"></iframe>`;
}
const code = document.getElementById('embed-code');
code.value = embedCode();
dlg.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
  size = b.dataset.size;
  dlg.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  code.value = embedCode();
}));
document.getElementById('share-btn').addEventListener('click', () => dlg.showModal());
dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
document.getElementById('copy-link').addEventListener('click', () => copyText(pageUrl));
document.getElementById('copy-embed').addEventListener('click', () => copyText(code.value));
