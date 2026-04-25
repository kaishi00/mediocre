-- Feedback System Schema Migration
-- Run: node migrate_feedback.js

-- 1a. Add rating column to watch_history
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS rating REAL;

-- 1b. Create dismissed_items table
CREATE TABLE IF NOT EXISTS dismissed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  dismissed_at TEXT DEFAULT (datetime('unixepoch','now')),
  reason TEXT DEFAULT 'not_interested',
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_user ON dismissed_items(user_id);
CREATE INDEX IF NOT EXISTS idx_dismissed_item ON dismissed_items(item_id);

-- 1c. Create user_ratings table
CREATE TABLE IF NOT EXISTS user_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  rating REAL NOT NULL CHECK(rating >= 1 AND rating <= 10),
  rated_at TEXT DEFAULT (datetime('unixepoch','now')),
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ratings_user ON user_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ratings_item ON user_ratings(item_id);
