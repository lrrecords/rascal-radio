import test from 'node:test';
import assert from 'node:assert/strict';
import { wantedTrackId, parseTrackinfo, pickStream } from '../lib/bandcamp-stream.js';

const info = [
  { id: 111, track_id: 111, title: 'One', file: { 'mp3-128': 'https://t4.bcbits.com/stream/aa/mp3-128/111?p=0&ts=1&t=x' } },
  { id: 222, track_id: 222, title: 'Two', file: { 'mp3-128': 'https://t4.bcbits.com/stream/bb/mp3-128/222?p=0&ts=1&t=y' } },
  { id: 333, track_id: 333, title: 'Not streamable', file: null },
];
const attr = JSON.stringify({ current: {}, trackinfo: info }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const html = `<html><script data-tralbum="${attr}" data-band="{}"></script></html>`;

test('wanted track id from embed_id', () => {
  assert.equal(wantedTrackId('track=111'), 111);
  assert.equal(wantedTrackId('album=9/track=222'), 222);
  assert.equal(wantedTrackId('album=9'), null);
});

test('stream link from data-tralbum', () => {
  const ti = parseTrackinfo(html);
  assert.equal(ti.length, 3);
  assert.equal(pickStream(ti, 222), info[1].file['mp3-128']);
  assert.equal(pickStream(ti, null), info[0].file['mp3-128']);
  assert.equal(pickStream(ti, 333), null);
  assert.equal(pickStream(ti, 444), null);
  assert.equal(pickStream([{ id: 1, file: { 'mp3-128': 'https://evil.example.com/x.mp3' } }], 1), null);
  assert.equal(parseTrackinfo('<html></html>'), null);
});
