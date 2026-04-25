-- Base SeerrV2 Database Schema (Phase 1-4)
-- This creates all core tables. The feedback schema is separate (feedback_schema.sql)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  created_at TEXT DEFAULT (datetime('unixepoch','now'))
);

-- Items (TMDB catalog)
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv', 'anime')),
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date TEXT,
  first_air_date TEXT,
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,
  is_anime INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('unixepoch','now')),
  updated_at TEXT DEFAULT (datetime('unixepoch','now')),
  UNIQUE(tmdb_id, media_type)
);

-- Genres lookup
CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER UNIQUE,
  name TEXT UNIQUE NOT NULL
);

-- Item-genre relationships
CREATE TABLE IF NOT EXISTS item_genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  UNIQUE(item_id, genre_id)
);

-- Watch history
CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  watched_at TEXT DEFAULT (datetime('unixepoch','now')),
  source TEXT DEFAULT 'plex',
  rating REAL,
  metadata_json TEXT,
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_item ON watch_history(item_id);

-- Taste profiles (cached genre weights)
CREATE TABLE IF NOT EXISTS taste_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
  genre_weights_json TEXT NOT NULL DEFAULT '{}',
  keyword_weights_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('unixepoch','now')),
  updated_at TEXT DEFAULT (datetime('unixepoch','now'))
);

-- Recommendations cache (per user per item)
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  category TEXT NOT NULL DEFAULT 'for_you',
  score REAL NOT NULL,
  content_score REAL,
  collab_score REAL,
  pop_score REAL,
  breakdown_json TEXT,
  generated_at TEXT DEFAULT (datetime('unixepoch','now')),
  UNIQUE(user_id, item_id, category)
);

CREATE INDEX IF NOT EXISTS idx_rec_user ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_rec_category ON recommendations(category);
CREATE INDEX IF NOT EXISTS idx_rec_score ON recommendations(score DESC);

-- Keywords (for content filtering)
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER UNIQUE,
  name TEXT UNIQUE NOT NULL
);

-- Item-keyword relationships
CREATE TABLE IF NOT EXISTS item_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  UNIQUE(item_id, keyword_id)
);

-- FTS virtual table for search
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  title,
  overview,
  original_title,
  content='items',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, overview, original_title)
  VALUES (new.id, new.title, new.overview, new.original_title);
END;

CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, overview, original_title)
  VALUES('delete', old.id, old.title, old.overview, old.original_title);
END;

CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, overview, original_title)
  VALUES('delete', old.id, old.title, old.overview, old.original_title);
  INSERT INTO items_fts(rowid, title, overview, original_title)
  VALUES (new.id, new.title, new.overview, new.original_title);
END;

-- TMDB cache metadata
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('unixepoch','now'))
);
