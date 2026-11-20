-- Rascal Radio phase 1 schema
CREATE TABLE IF NOT EXISTS shows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  episode_no  INTEGER,
  air_date    TEXT,               -- ISO date, YYYY-MM-DD
  blast_url   TEXT,
  podcast_url TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tracks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  artist     TEXT,
  album      TEXT,
  duration_s INTEGER,
  art_url    TEXT,
  source     TEXT NOT NULL CHECK (source IN ('bandcamp', 'youtube')),
  play_url   TEXT NOT NULL,       -- the public page (Buy on Bandcamp / Watch on YouTube)
  embed_id   TEXT NOT NULL,       -- bandcamp: "track=123" or "album=123/track=456"; youtube: video id
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_tracks_source_embed ON tracks (source, embed_id);

CREATE TABLE IF NOT EXISTS show_tracks (
  show_id      INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  track_id     INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  segment_note TEXT,
  PRIMARY KEY (show_id, position)
);
CREATE INDEX IF NOT EXISTS idx_show_tracks_track ON show_tracks (track_id);
CREATE INDEX IF NOT EXISTS idx_shows_status_date ON shows (status, air_date);
