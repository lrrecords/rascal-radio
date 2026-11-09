// /admin — create/edit shows, resolve links, reorder, publish.
import { api, esc, fmtDur, parseDur, ICONS, toast } from './common.js';

const $ = (id) => document.getElementById(id);
const form = $('show-form');
const state = { show: null, order: [], dirty: false };

// ---------- show list ----------
async function loadList() {
  const { shows } = await api('/api/admin/shows');
  $('shows').innerHTML = shows.map((s) => `
    <li><a href="?show=${s.id}" data-id="${s.id}" aria-current="${state.show?.id === s.id}">
      ${esc(s.title)}<span class="s">${s.status === 'published' ? '● live' : '○ draft'} · ${s.track_count} tracks${s.air_date ? ` · ${esc(s.air_date)}` : ''}</span>
    </a></li>`).join('') || '<li class="muted small">No shows yet.</li>';
}
$('shows').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-id]');
  if (!a) return;
  e.preventDefault();
  if (!confirmLeave()) return;
  openShow(Number(a.dataset.id));
});
$('new-show').addEventListener('click', () => { if (confirmLeave()) newShow(); });

function confirmLeave() {
  return !state.dirty || confirm('You have unsaved changes. Discard them?');
}
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

function setDirty(v = true) {
  state.dirty = v;
  $('dirty').textContent = v ? 'Unsaved changes' : '';
}

// ---------- editor ----------
function fillForm(show) {
  const s = show || {};
  form.title.value = s.title || '';
  form.slug.value = s.slug || '';
  form.episode_no.value = s.episode_no ?? '';
  form.air_date.value = s.air_date || '';
  form.blast_url.value = s.blast_url || '';
  form.podcast_url.value = s.podcast_url || '';
  form.notes.value = s.notes || '';
  $('ed-title').textContent = s.title || 'New show';
  const live = s.status === 'published';
  $('status-pill').textContent = live ? 'published' : 'draft';
  $('status-pill').classList.toggle('published', live);
  $('publish').textContent = live ? 'Unpublish' : 'Publish';
  $('save').textContent = live ? 'Save' : 'Save draft';
  $('delete').hidden = !s.id;
  $('view').hidden = !live;
  if (live) $('view').href = `/s/${encodeURIComponent(s.slug)}`;
}

function newShow() {
  state.show = null;
  state.order = [];
  fillForm(null);
  renderOrder();
  setDirty(false);
  history.replaceState(null, '', '/admin');
  loadList();
  form.title.focus();
}

async function openShow(id) {
  const { show, tracks } = await api(`/api/admin/shows/${id}`);
  state.show = show;
  state.order = tracks.map((t) => ({ track: t, segment_note: t.segment_note || '' }));
  fillForm(show);
  renderOrder();
  setDirty(false);
  history.replaceState(null, '', `/admin?show=${id}`);
  loadList();
}

form.addEventListener('input', () => setDirty());
form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

// ---------- running order ----------
function renderOrder() {
  const total = state.order.reduce((a, o) => a + (o.track.duration_s || 0), 0);
  $('total').textContent = state.order.length ? `${state.order.length} tracks · ${fmtDur(total)}` : '';
  $('order').innerHTML = state.order.map((o, i) => {
    const t = o.track;
    return `
    <li class="orow" data-i="${i}">
      <span class="handle" aria-hidden="true" title="Drag to reorder">⠿</span>
      <span class="n">${i + 1}</span>
      ${t.art_url ? `<img src="${esc(t.art_url)}" alt="">` : '<img alt="">'}
      <div class="fields">
        <input aria-label="Title" data-f="title" value="${esc(t.title)}">
        <input aria-label="Artist" data-f="artist" value="${esc(t.artist || '')}" placeholder="Artist">
        <input aria-label="Duration (m:ss)" data-f="duration_s" value="${esc(fmtDur(t.duration_s))}" placeholder="m:ss">
        <input aria-label="Segment note" class="note" data-note value="${esc(o.segment_note || '')}" placeholder="Segment note (optional), e.g. “Interview with the band”">
        <a class="src" href="${esc(t.play_url)}" target="_blank" rel="noopener">${ICONS[t.source] || ''}${esc(t.album ? `${t.album} · ` : '')}${esc(t.play_url)}</a>
      </div>
      <div class="acts">
        <button type="button" class="btn btn-sm" data-move="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn btn-sm" data-move="1" aria-label="Move down" ${i === state.order.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn btn-sm" data-remove aria-label="Remove from show">✕</button>
      </div>
    </li>`;
  }).join('') || '<li class="muted small">No tracks yet. Paste some links above.</li>';
}

$('order').addEventListener('click', (e) => {
  const row = e.target.closest('.orow');
  if (!row) return;
  const i = Number(row.dataset.i);
  const mv = e.target.closest('[data-move]');
  if (mv) {
    const j = i + Number(mv.dataset.move);
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
    renderOrder(); setDirty();
    $('order').children[j]?.querySelector(`[data-move="${mv.dataset.move}"]`)?.focus();
  } else if (e.target.closest('[data-remove]')) {
    state.order.splice(i, 1);
    renderOrder(); setDirty();
  }
});

$('order').addEventListener('input', (e) => {
  if (e.target.matches('[data-note]')) {
    state.order[Number(e.target.closest('.orow').dataset.i)].segment_note = e.target.value;
    setDirty();
  }
});

// Track metadata edits save immediately (they belong to the track, not the show).
$('order').addEventListener('change', async (e) => {
  const f = e.target.dataset.f;
  if (!f) return;
  const o = state.order[Number(e.target.closest('.orow').dataset.i)];
  const value = f === 'duration_s' ? parseDur(e.target.value) : e.target.value;
  try {
    const { track } = await api(`/api/admin/tracks/${o.track.id}`, { method: 'PUT', body: { [f]: value } });
    state.order.forEach((x) => { if (x.track.id === track.id) Object.assign(x.track, track); });
    if (f === 'duration_s') renderOrder();
    toast('Track saved');
  } catch (err) {
    toast(`Not saved: ${err.message}`);
  }
});

// Pointer-based drag (works with mouse and touch).
let drag = null;
$('order').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.handle');
  if (!h) return;
  e.preventDefault();
  const row = h.closest('.orow');
  drag = { row };
  row.classList.add('dragging');
  h.setPointerCapture(e.pointerId);
});
$('order').addEventListener('pointermove', (e) => {
  if (!drag) return;
  const list = $('order');
  const rows = [...list.querySelectorAll('.orow:not(.dragging)')];
  const after = rows.find((r) => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
  if (after) list.insertBefore(drag.row, after); else list.append(drag.row);
});
function endDrag() {
  if (!drag) return;
  drag.row.classList.remove('dragging');
  const newOrder = [...$('order').querySelectorAll('.orow')].map((r) => state.order[Number(r.dataset.i)]);
  const changed = newOrder.some((o, k) => o !== state.order[k]);
  state.order = newOrder;
  drag = null;
  renderOrder();
  if (changed) setDirty();
}
$('order').addEventListener('pointerup', endDrag);
$('order').addEventListener('pointercancel', endDrag);

// ---------- resolve links ----------
$('resolve').addEventListener('click', async () => {
  const lines = $('links').value.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
  if (!lines.length) return toast('Paste at least one link');
  const btn = $('resolve');
  btn.disabled = true;
  const log = $('resolve-log');
  log.innerHTML = '';
  const failed = [];
  for (const url of lines) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="wait">…</span><div><div>Resolving</div><div class="u">${esc(url)}</div></div>`;
    log.append(li);
    try {
      const meta = await api('/api/resolve', { method: 'POST', body: { url } });
      const { track } = await api('/api/admin/tracks', { method: 'POST', body: meta });
      state.order.push({ track, segment_note: '' });
      renderOrder(); setDirty();
      li.innerHTML = `${track.art_url ? `<img src="${esc(track.art_url)}" alt="">` : ''}<div><div><span class="ok">✓</span> ${esc(track.title)} — ${esc(track.artist || '')} <span class="muted">${fmtDur(track.duration_s)}</span></div><div class="u">${esc(url)}</div></div>`;
    } catch (err) {
      failed.push(url);
      li.innerHTML = `<span class="err">✕</span><div><div class="err">${esc(err.message)}</div><div class="u">${esc(url)}</div></div>`;
    }
  }
  $('links').value = failed.join('\n');
  btn.disabled = false;
});

// ---------- save / publish / delete ----------
async function save(status) {
  const body = Object.fromEntries(new FormData(form));
  if (!body.title.trim()) { form.title.focus(); return toast('Title is required'); }
  if (status) body.status = status;
  else body.status = state.show?.status || 'draft';
  if (body.status === 'published' && !state.order.length) return toast('Add at least one track before publishing');
  if (!body.slug) delete body.slug;
  try {
    const { show } = state.show
      ? await api(`/api/admin/shows/${state.show.id}`, { method: 'PUT', body })
      : await api('/api/admin/shows', { method: 'POST', body });
    await api(`/api/admin/shows/${show.id}/tracks`, {
      method: 'PUT',
      body: { items: state.order.map((o) => ({ track_id: o.track.id, segment_note: o.segment_note })) },
    });
    state.show = show;
    fillForm(show);
    setDirty(false);
    history.replaceState(null, '', `/admin?show=${show.id}`);
    await loadList();
    toast(show.status === 'published' ? 'Saved — live' : 'Saved as draft');
  } catch (err) {
    toast(`Save failed: ${err.message}`);
  }
}
$('save').addEventListener('click', () => save());
$('publish').addEventListener('click', () => save(state.show?.status === 'published' ? 'draft' : 'published'));
$('delete').addEventListener('click', async () => {
  if (!state.show || !confirm(`Delete “${state.show.title}”? Tracks stay in the library.`)) return;
  await api(`/api/admin/shows/${state.show.id}`, { method: 'DELETE' });
  setDirty(false);
  newShow();
  toast('Show deleted');
});

// ---------- boot ----------
const initial = Number(new URLSearchParams(location.search).get('show'));
if (initial) openShow(initial).catch(() => newShow()); else newShow();
