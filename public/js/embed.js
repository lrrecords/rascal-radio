// /embed/:slug?size=compact|full
import { api, esc, fmtDur, collageHtml, ICONS } from './common.js';
import { QueuePlayer } from './player.js';

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const size = new URLSearchParams(location.search).get('size') === 'full' ? 'full' : 'compact';
const root = document.getElementById('embed');
const fullUrl = `${location.origin}/s/${encodeURIComponent(slug)}`;
document.body.classList.add(size);

let data;
try {
  data = await api(`/api/shows/${encodeURIComponent(slug)}`);
} catch {
  root.innerHTML = '<p class="muted" style="padding:12px">This show isn’t available.</p>';
  throw new Error('not found');
}
const { show, tracks } = data;
document.title = `${show.title} · Rascal Radio`;

if (size === 'compact') {
  const first = tracks[0];
  root.innerHTML = `
    <img class="c-art" id="c-art" src="${esc(first?.art_url || '')}" alt="">
    <div class="c-main">
      <div class="c-top">
        <span class="show">${esc(show.title)}</span>
        <a class="brandlink" href="${esc(fullUrl)}" target="_blank" rel="noopener">Rascal Radio ↗</a>
      </div>
      <div id="player"></div>
    </div>`;
  const art = document.getElementById('c-art');
  const player = new QueuePlayer(document.getElementById('player'), {
    mode: 'compact', fullUrl,
    onChange: (t) => { art.src = t.art_url || ''; },
  });
  // Show the first track ready to go, with a big Play affordance.
  player.el.title.textContent = first ? first.title : 'Empty show';
  player.el.artist.textContent = first ? `${first.artist || ''} · ${tracks.length} tracks` : '';
  const ctrl = player.root.querySelector('.rp-ctrl');
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'btn btn-primary btn-icon';
  start.setAttribute('aria-label', 'Play the show');
  start.innerHTML = ICONS.play;
  start.addEventListener('click', () => { start.remove(); player.load(tracks, 0); });
  ctrl.prepend(start);
  player.setStatus(`${tracks.length} tracks · Bandcamp &amp; YouTube`);
} else {
  root.innerHTML = `
    <div class="e-head">
      ${collageHtml(tracks.slice(0, 4).map((t) => t.art_url), '')}
      <div class="t">
        <div class="kicker">Rascal Radio</div>
        <h1>${esc(show.title)}</h1>
        <div class="btn-row" style="margin-top:6px">
          <button type="button" class="btn btn-primary btn-sm" id="play">${ICONS.play} Play</button>
          <a class="btn btn-sm" href="${esc(fullUrl)}" target="_blank" rel="noopener">Open ↗</a>
        </div>
      </div>
    </div>
    <div class="e-list">
      <ol class="tracklist" id="tracks">
        ${tracks.map((t, i) => `
          <li class="track" data-i="${i}">
            <span class="pos">${t.position}</span>
            <button type="button" class="art-btn" data-play="${i}" aria-label="Play ${esc(t.title)}">${t.art_url ? `<img src="${esc(t.art_url)}" alt="" loading="lazy">` : ''}</button>
            <div class="info"><div class="title">${esc(t.title)}</div><div class="artist">${esc(t.artist || '')}</div></div>
            <div class="side"><span class="dur">${ICONS[t.source] || ''}${fmtDur(t.duration_s)}</span>
              ${t.source === 'bandcamp' ? `<a class="buy" href="${esc(t.play_url)}" target="_blank" rel="noopener">Buy</a>` : ''}</div>
          </li>`).join('')}
      </ol>
    </div>
    <div id="player"></div>`;
  const rows = [...root.querySelectorAll('.track')];
  const player = new QueuePlayer(document.getElementById('player'), {
    mode: 'full', fullUrl,
    onChange: (t) => rows.forEach((r) => r.classList.toggle('now', Number(r.dataset.i) === player.index)),
  });
  document.getElementById('play').addEventListener('click', () => player.load(tracks, 0));
  document.getElementById('tracks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-play]');
    if (!b) return;
    if (player.queue.length) player.playAt(Number(b.dataset.play)); else player.load(tracks, Number(b.dataset.play));
  });
}
