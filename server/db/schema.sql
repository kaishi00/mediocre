     1|-- Mediocre Database Schema
     2|-- This creates all core tables. The feedback schema is separate (feedback_schema.sql)
     3|
     4|-- Users table
     5|CREATE TABLE IF NOT EXISTS users (
     6|  id INTEGER PRIMARY KEY AUTOINCREMENT,
     7|  username TEXT UNIQUE NOT NULL,
     8|  display_name TEXT,
     9|  email TEXT,
    10|  created_at TEXT DEFAULT (datetime('unixepoch','now'))
    11|);
    12|
    13|-- Items (TMDB catalog)
    14|CREATE TABLE IF NOT EXISTS items (
    15|  id INTEGER PRIMARY KEY,
    16|  tmdb_id INTEGER NOT NULL,
    17|  media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv', 'anime')),
    18|  title TEXT NOT NULL,
    19|  original_title TEXT,
    20|  overview TEXT,
    21|  poster_path TEXT,
    22|  backdrop_path TEXT,
    23|  release_date TEXT,
    24|  first_air_date TEXT,
    25|  vote_average REAL,
    26|  vote_count INTEGER,
    27|  popularity REAL,
    28|  is_anime INTEGER DEFAULT 0,
    29|  created_at TEXT DEFAULT (datetime('unixepoch','now')),
    30|  updated_at TEXT DEFAULT (datetime('unixepoch','now')),
    31|  UNIQUE(tmdb_id, media_type)
    32|);
    33|
    34|-- Genres lookup
    35|CREATE TABLE IF NOT EXISTS genres (
    36|  id INTEGER PRIMARY KEY AUTOINCREMENT,
    37|  tmdb_id INTEGER UNIQUE,
    38|  name TEXT UNIQUE NOT NULL
    39|);
    40|
    41|-- Item-genre relationships
    42|CREATE TABLE IF NOT EXISTS item_genres (
    43|  id INTEGER PRIMARY KEY AUTOINCREMENT,
    44|  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    45|  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    46|  UNIQUE(item_id, genre_id)
    47|);
    48|
    49|-- Watch history
    50|CREATE TABLE IF NOT EXISTS watch_history (
    51|  id INTEGER PRIMARY KEY AUTOINCREMENT,
    52|  user_id INTEGER NOT NULL REFERENCES users(id),
    53|  item_id INTEGER NOT NULL REFERENCES items(id),
    54|  media_type TEXT NOT NULL,
    55|  title TEXT NOT NULL,
    56|  watched_at TEXT DEFAULT (datetime('unixepoch','now')),
    57|  source TEXT DEFAULT 'plex',
    58|  rating REAL,
    59|  metadata_json TEXT,
    60|  UNIQUE(user_id, item_id)
    61|);
    62|
    63|CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_history(user_id);
    64|CREATE INDEX IF NOT EXISTS idx_watch_item ON watch_history(item_id);
    65|
    66|-- Taste profiles (cached genre weights)
    67|CREATE TABLE IF NOT EXISTS taste_profiles (
    68|  id INTEGER PRIMARY KEY AUTOINCREMENT,
    69|  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    70|  genre_weights_json TEXT NOT NULL DEFAULT '{}',
    71|  keyword_weights_json TEXT NOT NULL DEFAULT '{}',
    72|  created_at TEXT DEFAULT (datetime('unixepoch','now')),
    73|  updated_at TEXT DEFAULT (datetime('unixepoch','now'))
    74|);
    75|
    76|-- Recommendations cache (per user per item)
    77|CREATE TABLE IF NOT EXISTS recommendations (
    78|  id INTEGER PRIMARY KEY AUTOINCREMENT,
    79|  user_id INTEGER NOT NULL REFERENCES users(id),
    80|  item_id INTEGER NOT NULL REFERENCES items(id),
    81|  category TEXT NOT NULL DEFAULT 'for_you',
    82|  score REAL NOT NULL,
    83|  content_score REAL,
    84|  collab_score REAL,
    85|  pop_score REAL,
    86|  breakdown_json TEXT,
    87|  generated_at TEXT DEFAULT (datetime('unixepoch','now')),
    88|  UNIQUE(user_id, item_id, category)
    89|);
    90|
    91|CREATE INDEX IF NOT EXISTS idx_rec_user ON recommendations(user_id);
    92|CREATE INDEX IF NOT EXISTS idx_rec_category ON recommendations(category);
    93|CREATE INDEX IF NOT EXISTS idx_rec_score ON recommendations(score DESC);
    94|
    95|-- Keywords (for content filtering)
    96|CREATE TABLE IF NOT EXISTS keywords (
    97|  id INTEGER PRIMARY KEY AUTOINCREMENT,
    98|  tmdb_id INTEGER UNIQUE,
    99|  name TEXT UNIQUE NOT NULL
   100|);
   101|
   102|-- Item-keyword relationships
   103|CREATE TABLE IF NOT EXISTS item_keywords (
   104|  id INTEGER PRIMARY KEY AUTOINCREMENT,
   105|  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
   106|  keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
   107|  UNIQUE(item_id, keyword_id)
   108|);
   109|
   110|-- FTS virtual table for search
   111|CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
   112|  title,
   113|  overview,
   114|  original_title,
   115|  content='items',
   116|  content_rowid='id'
   117|);
   118|
   119|-- Triggers to keep FTS in sync
   120|CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
   121|  INSERT INTO items_fts(rowid, title, overview, original_title)
   122|  VALUES (new.id, new.title, new.overview, new.original_title);
   123|END;
   124|
   125|CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
   126|  INSERT INTO items_fts(items_fts, rowid, title, overview, original_title)
   127|  VALUES('delete', old.id, old.title, old.overview, old.original_title);
   128|END;
   129|
   130|CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
   131|  INSERT INTO items_fts(items_fts, rowid, title, overview, original_title)
   132|  VALUES('delete', old.id, old.title, old.overview, old.original_title);
   133|  INSERT INTO items_fts(rowid, title, overview, original_title)
   134|  VALUES (new.id, new.title, new.overview, new.original_title);
   135|END;
   136|
   137|-- TMDB cache metadata
   138|CREATE TABLE IF NOT EXISTS metadata (
   139|  key TEXT PRIMARY KEY,
   140|  value TEXT,
   141|  updated_at TEXT DEFAULT (datetime('unixepoch','now'))
   142|);
   143|