import { api, esc, fmtDate, collageHtml, fmtDur } from './common.js';

const box = document.getElementById('shows');
try {
  const { shows } = await api('/api/shows');
  box.innerHTML = shows.length
    ? shows.map((s) => `
      <a class="show-card" href="/s/${encodeURIComponent(s.slug)}">
        ${collageHtml(s.covers, s.title)}
        <h3>${esc(s.title)}</h3>
        <div class="muted small">${[s.episode_no ? `Ep ${esc(s.episode_no)}` : '', esc(fmtDate(s.air_date)), `${s.track_count} tracks`, s.total_s ? fmtDur(s.total_s) : ''].filter(Boolean).join(' · ')}</div>
      </a>`).join('')
    : '<p class="empty-state">No shows published yet.</p>';
} catch (e) {
  box.innerHTML = `<p class="empty-state">Couldn’t load shows (${esc(e.message)}).</p>`;
}
