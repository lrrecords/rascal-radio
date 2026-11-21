// Reads a YouTube video's length in the browser by cueing it in a hidden,
// muted IFrame player. Used by /admin to fill in times that the server-side
// lookup couldn't get (YouTube sometimes blocks server requests).
let apiReady = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  });
  return apiReady;
}

let player = null;
let chain = Promise.resolve();

async function getPlayer(YT) {
  if (player) return player;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px;';
  const el = document.createElement('div');
  host.append(el);
  document.body.append(host);
  await new Promise((resolve) => {
    player = new YT.Player(el, {
      host: 'https://www.youtube-nocookie.com',
      width: 200, height: 200,
      playerVars: { autoplay: 0, controls: 0, mute: 1, playsinline: 1 },
      events: { onReady: resolve },
    });
  });
  return player;
}

/** Seconds, or null after ~12s without an answer. Calls run one at a time. */
export function youTubeDuration(videoId) {
  const run = async () => {
    const YT = await loadApi();
    const p = await getPlayer(YT);
    p.cueVideoById(videoId);
    for (let i = 0; i < 48; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const d = Math.round(p.getDuration ? p.getDuration() || 0 : 0);
      const data = p.getVideoData ? p.getVideoData() : null;
      if (d > 0 && (!data || !data.video_id || data.video_id === videoId)) return d;
    }
    return null;
  };
  const result = chain.then(run, run);
  chain = result.catch(() => null);
  return result;
}
