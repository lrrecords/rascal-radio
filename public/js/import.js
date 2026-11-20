// /admin/import — Indiecrates crate → draft show (same order, title from crate).
import { api, esc, fmtDur } from './common.js';

const $ = (id) => document.getElementById(id);

$('import-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const go = $('go');
  go.disabled = true;
  const log = $('log');
  log.innerHTML = '';
  $('result').innerHTML = '<p class="muted">Reading crate…</p>';
  try {
    const crate = await api('/api/admin/import', { method: 'POST', body: { url: $('crate-url').value } });
    $('result').innerHTML = `<p><strong>${esc(crate.title)}</strong> — ${crate.items.length} Bandcamp links. Resolving…</p>`;

    // Resolve in parallel (3 at a time) but keep the crate's order.
    const rows = crate.items.map((it) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="wait">…</span><div><div>${esc(it.title || '')} — ${esc(it.artist || '')}</div><div class="u">${esc(it.url)}</div></div>`;
      log.append(li);
      return li;
    });
    const results = new Array(crate.items.length);
    let next = 0;
    async function worker() {
      while (next < crate.items.length) {
        const i = next++;
        const it = crate.items[i];
        try {
          const meta = await api('/api/resolve', { method: 'POST', body: { url: it.url, track_title: it.title } });
          const { track } = await api('/api/admin/tracks', { method: 'POST', body: meta });
          results[i] = track;
          rows[i].innerHTML = `${track.art_url ? `<img src="${esc(track.art_url)}" alt="">` : ''}<div><div><span class="ok">✓</span> ${esc(track.title)} — ${esc(track.artist || '')} <span class="muted">${fmtDur(track.duration_s)}</span></div><div class="u">${esc(it.url)}</div></div>`;
        } catch (err) {
          rows[i].innerHTML = `<span class="err">✕</span><div><div>${esc(it.title || '')} — ${esc(it.artist || '')}: <span class="err">${esc(err.message)}</span></div><div class="u">${esc(it.url)}</div></div>`;
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);

    const ok = results.filter(Boolean);
    if (!ok.length) throw new Error('None of the tracks could be resolved.');
    const { show } = await api('/api/admin/shows', {
      method: 'POST',
      body: { title: crate.title || 'Imported crate', notes: crate.description || '', status: 'draft' },
    });
    await api(`/api/admin/shows/${show.id}/tracks`, { method: 'PUT', body: { items: ok.map((t) => ({ track_id: t.id })) } });
    const missed = crate.items.length - ok.length;
    $('result').innerHTML = `<div class="panel"><p><strong>Draft created:</strong> ${esc(show.title)} — ${ok.length} tracks${missed ? `, <span class="err">${missed} failed (add them by hand)</span>` : ''}.</p>
      <a class="btn btn-primary" href="/admin?show=${show.id}">Open in editor</a></div>`;
  } catch (err) {
    $('result').innerHTML = `<p class="err" style="color:var(--danger)">${esc(err.message)}</p>`;
  } finally {
    go.disabled = false;
  }
});
