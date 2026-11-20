// Shared browser helpers.

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtDur(sec) {
  if (sec == null || !Number.isFinite(+sec)) return '';
  sec = Math.round(+sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function parseDur(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const ICONS = {
  bandcamp: '<svg class="src-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M0 18.75l7.44-13.5H24l-7.44 13.5z"/></svg>',
  youtube: '<svg class="src-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12v8h16v-8M12 3v13M7 8l5-5 5 5"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5v14l10-7zM17 5h2v14h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 5v14L9 12zM5 5h2v14H5z"/></svg>',
  radio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  podcast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14v7M7.8 16.5a6 6 0 1 1 8.4 0M5 19.5a10 10 0 1 1 14 0"/></svg>',
};

export function collageHtml(covers, alt = '') {
  const list = (covers || []).filter(Boolean);
  if (!list.length) return '<div class="collage empty" aria-hidden="true">♪</div>';
  const four = [0, 1, 2, 3].map((i) => list[i % list.length]);
  return `<div class="collage">${four.map((src, i) => `<img src="${esc(src)}" alt="${i === 0 ? esc(alt) : ''}" loading="lazy">`).join('')}</div>`;
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.role = 'status';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied');
}

export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
