// Offline unit tests for the HTML parsers: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBandcampHtml, youTubeId, splitYouTubeTitle, isoDurationToSeconds, detectSource } from '../lib/resolve.js';
import { parseCrate } from '../lib/crate.js';

const albumHtml = `
<meta property="og:title" content="Onto The Afterlife, by Robot God">
<meta property="og:site_name" content="Robot God">
<meta property="og:image" content="https://f4.bcbits.com/img/a1_5.jpg">
<meta name="bc-page-properties" content="{&quot;item_type&quot;:&quot;a&quot;,&quot;item_id&quot;:555,&quot;tralbum_page_version&quot;:0}">
<script type="application/ld+json">{"@type":"MusicAlbum","name":"Onto The Afterlife","byArtist":{"name":"Robot God"},
"track":{"itemListElement":[
 {"item":{"name":"Soldier of Love","duration":"P00H06M40S","additionalProperty":[{"name":"track_id","value":111}]}},
 {"item":{"name":"Second One","duration":"P00H03M05S","additionalProperty":[{"name":"track_id","value":222}]}}]}}</script>`;

test('Bandcamp album → first track by default', () => {
  const r = parseBandcampHtml(albumHtml, 'https://x.bandcamp.com/album/a');
  assert.equal(r.embed_id, 'album=555/track=111');
  assert.equal(r.title, 'Soldier of Love');
  assert.equal(r.album, 'Onto The Afterlife');
  assert.equal(r.artist, 'Robot God');
  assert.equal(r.duration_s, 400);
});

test('Bandcamp album with a hint → that track', () => {
  const r = parseBandcampHtml(albumHtml, 'https://x.bandcamp.com/album/a', { trackTitle: 'second one' });
  assert.equal(r.embed_id, 'album=555/track=222');
  assert.equal(r.duration_s, 185);
});

test('Bandcamp track page', () => {
  const html = `<meta name="bc-page-properties" content="{&quot;item_type&quot;:&quot;t&quot;,&quot;item_id&quot;:999}">
    <meta property="og:title" content="Driver, by MOTSUS"><meta property="og:site_name" content="MOTSUS">`;
  const r = parseBandcampHtml(html, 'https://m.bandcamp.com/track/driver');
  assert.deepEqual([r.embed_id, r.title, r.artist], ['track=999', 'Driver', 'MOTSUS']);
});

test('Bandcamp page without properties is rejected', () => {
  assert.throws(() => parseBandcampHtml('<html></html>', 'https://x.bandcamp.com/'));
});

test('YouTube ids and titles', () => {
  assert.equal(youTubeId('https://www.youtube.com/watch?v=5dBJbXo5GB4&t=10'), '5dBJbXo5GB4');
  assert.equal(youTubeId('https://youtu.be/5dBJbXo5GB4'), '5dBJbXo5GB4');
  assert.equal(youTubeId('https://www.youtube.com/shorts/5dBJbXo5GB4'), '5dBJbXo5GB4');
  assert.equal(youTubeId('https://www.youtube.com/'), null);
  assert.deepEqual(splitYouTubeTitle('Twin Serpents - Forever Witch', 'Someone'), { artist: 'Twin Serpents', title: 'Forever Witch' });
  assert.deepEqual(splitYouTubeTitle('Forever Witch', 'Twin Serpents - Topic'), { artist: 'Twin Serpents', title: 'Forever Witch' });
});

test('source detection', () => {
  assert.equal(detectSource('https://a.bandcamp.com/track/x').source, 'bandcamp');
  assert.equal(detectSource('https://music.youtube.com/watch?v=5dBJbXo5GB4').source, 'youtube');
  assert.throws(() => detectSource('https://evil.example/bandcamp.com'));
  assert.throws(() => detectSource('https://bandcamp.com.evil.example/x'));
});

test('ISO durations', () => {
  assert.equal(isoDurationToSeconds('P00H07M19S'), 439);
  assert.equal(isoDurationToSeconds('PT1H2M3S'), 3723);
  assert.equal(isoDurationToSeconds(null), null);
});

test('Indiecrates crate parsing', () => {
  const html = `<script type="application/ld+json">{"@type":"MusicPlaylist","name":"Rascal Radio - Oct 26","description":"Desc"}</script>
  <a class="track-bandcamp-link" aria-label="Buy Soldier of Love on Bandcamp" data-track-link-artist-value="Robot God" href="https://robotgodband.bandcamp.com/album/onto-the-afterlife"></a>
  <a class="track-bandcamp-link" aria-label="Buy Who Have I Been Praying To? on Bandcamp" data-track-link-artist-value="liveconformdie" href="https://liveconformdie.bandcamp.com/album/die-in-my-prime"></a>`;
  const c = parseCrate(html);
  assert.equal(c.title, 'Rascal Radio - Oct 26');
  assert.equal(c.items.length, 2);
  assert.deepEqual(c.items[1], { url: 'https://liveconformdie.bandcamp.com/album/die-in-my-prime', title: 'Who Have I Been Praying To?', artist: 'liveconformdie' });
});
