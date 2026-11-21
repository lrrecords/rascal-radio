// Queue player: plays a show straight through, track after track, from any
// starting point, until the listener pauses.
// - Bandcamp tracks play in an <audio> element from Bandcamp's own streaming
//   link (found by /api/stream/:id, which redirects; audio is never proxied).
//   If Bandcamp won't give a link, that track falls back to the official
//   Bandcamp embedded player and the Next button.
// - YouTube tracks play in the YouTube IFrame player (min 200x200px).
// One play/pause button drives whichever is current; both report when a track
// ends, so the queue moves on by itself.

import { esc, fmtDur, ICONS } from './common.js';

const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

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
  return `https://bandcamp.com/EmbeddedPlayer/${embedId}/size=small/bgcol=0b0b0b/linkcol=fcbc4b/artwork=none/transparent=true/`;
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
    this.kind = null; // 'audio' | 'youtube' | 'embed' | 'link' for the current track
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
            <button type="button" class="btn btn-icon btn-primary rp-toggle" aria-label="Play">${ICONS.play}</button>
            <button type="button" class="btn btn-icon rp-next" aria-label="Next track">${ICONS.next}</button>
          </div>
        </div>
        <div class="rp-prog" hidden>
          <span class="rp-cur">0:00</span>
          <input class="rp-seek" type="range" min="0" max="0" step="1" value="0" aria-label="Seek">
          <span class="rp-dur">0:00</span>
        </div>
        <div class="rp-bc" hidden></div>
        <div class="rp-status" aria-live="polite"></div>
      </div>
      <div class="rp-yt" hidden><div class="rp-yt-host"></div></div>
      <audio class="rp-audio" preload="auto"></audio>`;
    this.el = {
      art: r.querySelector('.rp-art'),
      title: r.querySelector('.rp-title'),
      artist: r.querySelector('.rp-artist'),
      prev: r.querySelector('.rp-prev'),
      toggle: r.querySelector('.rp-toggle'),
      next: r.querySelector('.rp-next'),
      prog: r.querySelector('.rp-prog'),
      cur: r.querySelector('.rp-cur'),
      seek: r.querySelector('.rp-seek'),
      dur: r.querySelector('.rp-dur'),
      bc: r.querySelector('.rp-bc'),
      status: r.querySelector('.rp-status'),
      yt: r.querySelector('.rp-yt'),
      ytHost: r.querySelector('.rp-yt-host'),
      audio: r.querySelector('.rp-audio'),
    };
    this.el.prev.addEventListener('click', () => this.prev());
    this.el.next.addEventListener('click', () => this.next());
    this.el.toggle.addEventListener('click', () => this.toggle());
    this.el.seek.addEventListener('input', () => this.seekTo(Number(this.el.seek.value)));

    const a = this.el.audio;
    a.addEventListener('ended', () => { if (this.kind === 'audio') this.next(); });
    a.addEventListener('play', () => this.setPlaying(true));
    a.addEventListener('pause', () => { if (!a.ended) this.setPlaying(false); });
    a.addEventListener('timeupdate', () => { if (this.kind === 'audio') this.showTime(a.currentTime, a.duration); });
    a.addEventListener('loadedmetadata', () => {
      const cur = this.current;
      if (this.kind === 'audio' && cur && !cur.duration_s && Number.isFinite(a.duration)) {
        cur.duration_s = Math.round(a.duration);
        this.onChange(cur, this.index);
      }
    });
    a.addEventListener('error', () => {
      if (this.kind !== 'audio' || !a.getAttribute('src')) return;
      this.useBandcampEmbed(this.current); // no stream from Bandcamp → official player
    });

    this.ytTimer = setInterval(() => {
      if (this.kind === 'youtube' && this.ytReady && this.yt.getCurrentTime) {
        this.showTime(this.yt.getCurrentTime() || 0, this.yt.getDuration() || 0);
      }
    }, 500);

    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported */ } };
      safe('play', () => this.toggle(true));
      safe('pause', () => this.toggle(false));
      safe('previoustrack', () => this.prev());
      safe('nexttrack', () => this.next());
    }

    this.updateButtons();
    if (this.mode === 'sticky' && 'ResizeObserver' in window) {
      new ResizeObserver(() => {
        const h = r.hidden ? 0 : r.querySelector('.rp-inner').offsetHeight;
        document.documentElement.style.setProperty('--player-h', `${h}px`);
      }).observe(r);
    }
  }

  get current() { return this.queue[this.index] || null; }

  /** Set the queue without starting (the play button then starts at track 1). */
  setQueue(queue) {
    this.queue = queue.slice();
    this.updateButtons();
  }

  load(queue, startIndex = 0) {
    this.queue = queue.slice();
    this.playAt(startIndex);
  }

  updateButtons() {
    this.el.prev.disabled = this.index <= 0;
    this.el.next.disabled = this.index < 0 || this.index >= this.queue.length - 1;
    this.el.toggle.disabled = !this.queue.length || this.kind === 'embed' || this.kind === 'link';
  }

  setStatus(html) { this.el.status.innerHTML = html; }

  setPlaying(on) {
    this.playing = on;
    this.el.toggle.innerHTML = on ? PAUSE_ICON : ICONS.play;
    this.el.toggle.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }

  showTime(cur, dur) {
    const d = Number.isFinite(dur) && dur > 0 ? dur : 0;
    this.el.prog.hidden = !d;
    this.el.seek.max = String(Math.floor(d));
    if (document.activeElement !== this.el.seek) this.el.seek.value = String(Math.floor(cur || 0));
    this.el.cur.textContent = fmtDur(Math.floor(cur || 0)) || '0:00';
    this.el.dur.textContent = fmtDur(Math.round(d)) || '0:00';
  }

  seekTo(s) {
    if (this.kind === 'audio') this.el.audio.currentTime = s;
    else if (this.kind === 'youtube' && this.ytReady) this.yt.seekTo(s, true);
  }

  /** Play/pause the current track; with nothing loaded, start the show. */
  toggle(force) {
    if (this.index < 0) { if (this.queue.length) this.playAt(0); return; }
    const want = force ?? !this.playing;
    if (this.kind === 'audio') {
      if (want) this.el.audio.play().catch(() => this.setPlaying(false));
      else this.el.audio.pause();
    } else if (this.kind === 'youtube' && this.ytReady) {
      if (want) this.yt.playVideo(); else this.yt.pauseVideo();
    }
  }

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
    this.showTime(0, t.duration_s || 0);
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist || '', album: t.album || 'Rascal Radio',
        artwork: t.art_url ? [{ src: t.art_url, sizes: '512x512' }] : [],
      });
    }
    if (t.source === 'youtube') this.playYouTube(t, token);
    else this.playBandcamp(t);
    this.updateButtons();
    this.onChange(t, i);
  }

  next() { if (this.index < this.queue.length - 1) this.playAt(this.index + 1); else this.end(); }
  prev() { if (this.index > 0) this.playAt(this.index - 1); }

  end() {
    this.stopAll();
    this.kind = null;
    this.setPlaying(false);
    this.updateButtons();
    this.setStatus('End of the show. Thanks for listening to Rascal Radio.');
    this.el.next.classList.remove('attn');
  }

  stopAudio() {
    const a = this.el.audio;
    a.pause();
    a.removeAttribute('src');
    a.load();
  }

  stopYouTube() {
    this.el.yt.hidden = true;
    if (this.ytReady) { try { this.yt.pauseVideo(); } catch { /* not ready */ } }
  }

  stopAll() {
    this.stopAudio();
    this.stopYouTube();
    this.el.bc.innerHTML = '';
    this.el.bc.hidden = true;
  }

  /** YouTube player state handler (0 = ended, 1 = playing, 2 = paused). */
  onYouTubeState(state, ytPlayer = this.yt) {
    const cur = this.current;
    if (!cur || cur.source !== 'youtube' || this.kind !== 'youtube') return;
    if (state === 1 && !cur.duration_s && ytPlayer && ytPlayer.getDuration) {
      const d = Math.round(ytPlayer.getDuration() || 0);
      if (d) { cur.duration_s = d; this.onChange(cur, this.index); }
    }
    if (state === 1) { this.setPlaying(true); this.setStatus(''); }
    if (state === 2) this.setPlaying(false);
    if (state === 0) this.next();
  }

  playBandcamp(t) {
    this.stopAll();
    if (!t.id) { this.useBandcampEmbed(t); return; }
    this.kind = 'audio';
    this.setStatus('');
    const a = this.el.audio;
    a.src = `/api/stream/${encodeURIComponent(t.id)}`;
    a.play().catch((e) => {
      if (this.current !== t) return;
      if (e && e.name === 'NotAllowedError') {
        // Browser wants a tap before sound (e.g. after a long pause on mobile).
        this.setPlaying(false);
        this.setStatus('Press ▶ to keep listening.');
      }
      // Other failures surface as the audio "error" event → embed fallback.
    });
  }

  /** Fallback when Bandcamp gives no stream: the official embed + Next button. */
  useBandcampEmbed(t) {
    if (!t || this.current !== t) return;
    this.stopAudio();
    this.kind = 'embed';
    this.setPlaying(false);
    this.el.prog.hidden = true;
    const label = `Bandcamp player: ${t.title}${t.artist ? ` by ${t.artist}` : ''}`;
    this.el.bc.innerHTML = `<iframe src="${esc(bandcampSrc(t.embed_id))}" title="${esc(label)}" allow="autoplay" loading="eager" seamless></iframe>`;
    this.el.bc.hidden = false;
    const more = this.index < this.queue.length - 1;
    this.el.next.classList.toggle('attn', more);
    this.setStatus(`Press ▶ in the Bandcamp player.${more ? ' Tap Next ⏭ when it finishes.' : ''}`);
    this.updateButtons();
  }

  async playYouTube(t, token) {
    this.stopAll();
    if (this.mode === 'compact') {
      this.kind = 'link';
      this.setPlaying(false);
      this.el.prog.hidden = true;
      const full = this.fullUrl ? ` or <a href="${esc(this.fullUrl)}" target="_blank" rel="noopener">open the full player ↗</a>` : '';
      this.setStatus(`YouTube track: <a href="${esc(t.play_url)}" target="_blank" rel="noopener">watch on YouTube ↗</a>${full}`);
      this.el.next.classList.toggle('attn', this.index < this.queue.length - 1);
      return;
    }
    this.kind = 'youtube';
    this.el.yt.hidden = false;
    this.setStatus('');
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
      this.checkYouTubeStarted(token);
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
          if (cur && cur.source === 'youtube' && this.kind === 'youtube') e.target.loadVideoById(cur.embed_id); // autoplays
          else e.target.stopVideo(); // user already moved on
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
    this.checkYouTubeStarted(token);
  }

  /** If the browser blocked YouTube from starting by itself, ask for a tap. */
  checkYouTubeStarted(token) {
    setTimeout(() => {
      if (token !== this.token || this.kind !== 'youtube' || !this.ytReady) return;
      const s = this.yt.getPlayerState ? this.yt.getPlayerState() : -1;
      if (s !== 1 && s !== 3) { this.setPlaying(false); this.setStatus('Press ▶ to keep listening.'); }
    }, 4000);
  }
}
