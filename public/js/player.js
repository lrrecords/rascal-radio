// Queue player: plays a list of tracks in order, swapping between the official
// Bandcamp EmbeddedPlayer and the YouTube IFrame API per track.
// - YouTube reports when a video ends, so the queue auto-advances.
// - Bandcamp's embed does not report track end (and cross-origin iframes can't be
//   observed), so the Next button is highlighted for Bandcamp tracks instead.
// Audio is only ever played by the official players; nothing is proxied.

import { esc, ICONS } from './common.js';

let ytPromise = null;
function loadYouTubeApi() {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytPromise = null; reject(new Error('YouTube player failed to load')); };
    document.head.append(s);
  });
  return ytPromise;
}

export function bandcampSrc(embedId) {
  return `https://bandcamp.com/EmbeddedPlayer/${embedId}/size=small/bgcol=0b0b0b/linkcol=ff4d2e/artwork=none/transparent=true/`;
}

export class QueuePlayer {
  /**
   * @param {HTMLElement} root  container element (gets class "rp")
   * @param {{mode?: 'sticky'|'full'|'compact', onChange?: Function, fullUrl?: string}} opts
   *   compact: YouTube's player needs >= 200x200px, which a 152px embed can't give,
   *   so YouTube tracks link out instead of playing inline.
   */
  constructor(root, { mode = 'sticky', onChange = () => {}, fullUrl = null } = {}) {
    this.root = root;
    this.mode = mode;
    this.onChange = onChange;
    this.fullUrl = fullUrl;
    this.queue = [];
    this.index = -1;
    this.token = 0;
    this.yt = null;
    this.ytReady = false;
    this.render();
  }

  render() {
    const r = this.root;
    r.classList.add('rp', `mode-${this.mode}`);
    if (this.mode !== 'compact') r.hidden = true; // shown on first play
    r.innerHTML = `
      <div class="rp-inner">
        <div class="rp-bar">
          <img class="rp-art" alt="" width="48" height="48">
          <div class="rp-meta">
            <div class="rp-title">Nothing playing</div>
            <div class="rp-artist">Press Play to start the show</div>
          </div>
          <div class="rp-ctrl">
            <button type="button" class="btn btn-icon rp-prev" aria-label="Previous track">${ICONS.prev}</button>
            <button type="button" class="btn btn-icon rp-next" aria-label="Next track">${ICONS.next}</button>
          </div>
        </div>
        <div class="rp-bc" hidden></div>
        <div class="rp-status" aria-live="polite"></div>
      </div>
      <div class="rp-yt" hidden><div class="rp-yt-host"></div></div>`;
    this.el = {
      art: r.querySelector('.rp-art'),
      title: r.querySelector('.rp-title'),
      artist: r.querySelector('.rp-artist'),
      prev: r.querySelector('.rp-prev'),
      next: r.querySelector('.rp-next'),
      bc: r.querySelector('.rp-bc'),
      status: r.querySelector('.rp-status'),
      yt: r.querySelector('.rp-yt'),
      ytHost: r.querySelector('.rp-yt-host'),
    };
    this.el.prev.addEventListener('click', () => this.prev());
    this.el.next.addEventListener('click', () => this.next());
    this.updateButtons();
    if (this.mode === 'sticky' && 'ResizeObserver' in window) {
      new ResizeObserver(() => {
        const h = r.hidden ? 0 : r.querySelector('.rp-inner').offsetHeight;
        document.documentElement.style.setProperty('--player-h', `${h}px`);
      }).observe(r);
    }
  }

  get current() { return this.queue[this.index] || null; }

  load(queue, startIndex = 0) {
    this.queue = queue.slice();
    this.playAt(startIndex);
  }

  updateButtons() {
    this.el.prev.disabled = this.index <= 0;
    this.el.next.disabled = this.index < 0 || this.index >= this.queue.length - 1;
  }

  setStatus(html) { this.el.status.innerHTML = html; }

  playAt(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.index = i;
    const t = this.current;
    const token = ++this.token;
    this.root.hidden = false;
    this.el.art.src = t.art_url || '';
    this.el.art.alt = t.album ? `${t.album} cover` : '';
    this.el.title.textContent = t.title;
    this.el.artist.textContent = [t.artist, t.segment_note].filter(Boolean).join(' · ');
    this.el.next.classList.remove('attn');
    this.updateButtons();
    if (t.source === 'youtube') this.playYouTube(t, token);
    else this.playBandcamp(t);
    this.onChange(t, i);
  }

  next() { if (this.index < this.queue.length - 1) this.playAt(this.index + 1); else this.end(); }
  prev() { if (this.index > 0) this.playAt(this.index - 1); }

  end() {
    this.stopYouTube();
    this.setStatus('End of the show. Thanks for listening to Rascal Radio.');
    this.el.next.classList.remove('attn');
  }

  /** YouTube player state handler (0 = ended, 1 = playing). */
  onYouTubeState(state, ytPlayer = this.yt) {
    const cur = this.current;
    if (!cur || cur.source !== 'youtube') return;
    if (state === 1 && !cur.duration_s && ytPlayer && ytPlayer.getDuration) {
      const d = Math.round(ytPlayer.getDuration() || 0);
      if (d) { cur.duration_s = d; this.onChange(cur, this.index); }
    }
    if (state === 0) this.next();
  }

  stopYouTube() {
    this.el.yt.hidden = true;
    if (this.ytReady) { try { this.yt.pauseVideo(); } catch { /* not ready */ } }
  }

  playBandcamp(t) {
    this.stopYouTube();
    const label = `Bandcamp player: ${t.title}${t.artist ? ` by ${t.artist}` : ''}`;
    this.el.bc.innerHTML = `<iframe src="${esc(bandcampSrc(t.embed_id))}" title="${esc(label)}" allow="autoplay" loading="eager" seamless></iframe>`;
    this.el.bc.hidden = false;
    const more = this.index < this.queue.length - 1;
    this.el.next.classList.toggle('attn', more);
    this.setStatus(`Press ▶ in the Bandcamp player.${more ? ' Bandcamp doesn’t say when a track ends, so tap Next ⏭ to move on.' : ''}`);
  }

  async playYouTube(t, token) {
    // Remove any Bandcamp iframe so its audio stops.
    this.el.bc.innerHTML = '';
    this.el.bc.hidden = true;
    if (this.mode === 'compact') {
      this.stopYouTube();
      const full = this.fullUrl ? ` or <a href="${esc(this.fullUrl)}" target="_blank" rel="noopener">open the full player ↗</a>` : '';
      this.setStatus(`YouTube track: <a href="${esc(t.play_url)}" target="_blank" rel="noopener">watch on YouTube ↗</a>${full}`);
      this.el.next.classList.toggle('attn', this.index < this.queue.length - 1);
      return;
    }
    this.el.yt.hidden = false;
    this.setStatus('Playing from YouTube. The next track starts automatically.');
    let YT;
    try {
      YT = await loadYouTubeApi();
    } catch (e) {
      this.setStatus(`Couldn’t load YouTube. <a href="${esc(t.play_url)}" target="_blank" rel="noopener">Watch on YouTube ↗</a>`);
      return;
    }
    if (token !== this.token) return; // user moved on while the API loaded
    if (this.yt) {
      // Player exists: swap video now, or let onReady pick up the current track.
      if (this.ytReady) this.yt.loadVideoById(t.embed_id);
      return;
    }
    this.yt = new YT.Player(this.el.ytHost, {
      width: 200,
      height: 200,
      videoId: t.embed_id,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: (e) => {
          this.ytReady = true;
          const cur = this.current;
          if (cur && cur.source === 'youtube') e.target.loadVideoById(cur.embed_id); // autoplays
          else e.target.stopVideo(); // user already moved on to a Bandcamp track
        },
        onStateChange: (e) => this.onYouTubeState(e.data, e.target),
        onError: () => {
          const cur = this.current;
          if (!cur || cur.source !== 'youtube') return;
          this.setStatus(`This video can’t play here. <a href="${esc(cur.play_url)}" target="_blank" rel="noopener">Watch on YouTube ↗</a> — skipping…`);
          const myToken = this.token;
          setTimeout(() => { if (myToken === this.token) this.next(); }, 4000);
        },
      },
    });
  }
}
