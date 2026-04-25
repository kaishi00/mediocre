import express from 'express';
import db from './config.js';
import { buildTasteProfile, getDismissedItems, getWatchedItems, rebuildProfile } from './services/recommender.js';
import { scoreCandidates } from './lib/scoring.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS middleware for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/v2/recommendations/:user/watched
 * Record that a user watched an item, optionally with a rating.
 */
app.post('/api/v2/recommendations/:user/watched', (req, res) => {
  const { user } = req.params;
  const { item_id, rating } = req.body;

  // Validate user exists
  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }
  const userId = userRow.id;

  // Validate item exists
  const itemRow = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
  if (!itemRow) {
    return res.status(404).json({ ok: false, error: 'Item not found' });
  }

  // Validate rating if provided
  if (rating !== undefined && (rating < 1 || rating > 10)) {
    return res.status(400).json({ ok: false, error: 'Rating must be between 1 and 10' });
  }

  try {
    // 3. If rating provided, upsert into user_ratings
    if (rating !== undefined) {
      db.prepare(`
        INSERT INTO user_ratings (user_id, item_id, rating) VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET rating = excluded.rating, rated_at = datetime('unixepoch','now')
      `).run(userId, item_id, rating);
    }

    // 4. Insert into watch_history (if not already there, ignore duplicates)
    const existingWatch = db.prepare('SELECT id FROM watch_history WHERE user_id = ? AND item_id = ?').get(userId, item_id);
    if (!existingWatch) {
      db.prepare(`
        INSERT INTO watch_history (user_id, item_id, media_type, title, watched_at, source, rating)
        SELECT id, ?, media_type, title, datetime('unixepoch','now'), 'api', ?
        FROM items WHERE id = ?
      `).run(item_id, rating, item_id);
    } else if (rating !== undefined) {
      // Update rating on existing watch
      db.prepare('UPDATE watch_history SET rating = ? WHERE user_id = ? AND item_id = ?').run(rating, userId, item_id);
    }

    // 5. Rebuild taste profile (sync for consistency)
    rebuildProfile(userId, generateRecsForUser);

    // 6. Respond immediately (async regen in background)
    res.status(201).json({
      ok: true,
      message: 'Watched recorded, recommendations updating...'
    });
  } catch (err) {
    console.error('Error recording watched:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/v2/recommendations/:user/dismiss
 * Dismiss an item from recommendations.
 */
app.post('/api/v2/recommendations/:user/dismiss', (req, res) => {
  const { user } = req.params;
  const { item_id } = req.body;

  // Validate user exists
  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }
  const userId = userRow.id;

  // Validate item exists
  const itemRow = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
  if (!itemRow) {
    return res.status(404).json({ ok: false, error: 'Item not found' });
  }

  try {
    // 2. Insert into dismissed_items (ignore conflicts)
    db.prepare(`
      INSERT OR IGNORE INTO dismissed_items (user_id, item_id, reason) VALUES (?, ?, 'not_interested')
    `).run(userId, item_id);

    // 3. Remove from cached recommendations
    db.prepare('DELETE FROM recommendations WHERE user_id = ? AND item_id = ?').run(userId, item_id);

    res.status(201).json({
      ok: true,
      message: 'Dismissed'
    });
  } catch (err) {
    console.error('Error dismissing item:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/v2/recommendations/:user/request
 * Request an item to be added (Overseerr integration placeholder).
 */
app.post('/api/v2/recommendations/:user/request', (req, res) => {
  const { user } = req.params;
  const { tmdb_id, media_type } = req.body;

  // Validate user exists
  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }

  if (!tmdb_id || !media_type) {
    return res.status(400).json({ ok: false, error: 'tmdb_id and media_type required' });
  }

  // For now, just acknowledge
  console.log(`[Request] User ${user} requested ${media_type} ${tmdb_id}`);
  res.status(201).json({
    ok: true,
    message: 'Request noted (Overseerr integration coming soon)'
  });
});

/**
 * GET /api/v2/recommendations/:user/profile
 * Get user's taste profile.
 */
app.get('/api/v2/recommendations/:user/profile', (req, res) => {
  const { user } = req.params;

  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }

  const profileRow = db.prepare('SELECT genre_weights_json, keyword_weights_json FROM taste_profiles WHERE user_id = ?').get(userRow.id);
  const tasteProfile = {
    genres: profileRow ? JSON.parse(profileRow.genre_weights_json) : {},
    keywords: profileRow ? JSON.parse(profileRow.keyword_weights_json) : {}
  };
  res.json({ ok: true, profile: tasteProfile });
});

/**
 * GET /api/v2/recommendations/:user/:category
 * Get paginated recommendations for a category.
 */
app.get('/api/v2/recommendations/:user/:category', (req, res) => {
  const { user, category } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }
  const userId = userRow.id;

  // Load taste profile (genres + keywords)
  const profileRow = db.prepare('SELECT genre_weights_json, keyword_weights_json FROM taste_profiles WHERE user_id = ?').get(userId);
  const tasteProfile = {
    genres: profileRow ? JSON.parse(profileRow.genre_weights_json) : {},
    keywords: profileRow ? JSON.parse(profileRow.keyword_weights_json) : {}
  };

  // Load candidates (items not in watch_history or dismissed_items)
  const watched = getWatchedItems(userId);
  const dismissed = getDismissedItems(userId);
  const excluded = new Set([...watched, ...dismissed]);

  // Get all items
  const allItems = db.prepare('SELECT id FROM items').all().map(r => r.id);
  const candidates = allItems.filter(id => !excluded.has(id));

  // Score and sort
  const scored = scoreCandidates(userId, candidates, tasteProfile);

  // Filter by category if needed
  let filtered = scored;
  if (category !== 'for_you') {
    const catMap = {
      movies: 'movie',
      tv: 'tv',
      anime: 'anime',
      trending: 'trending',
      hidden_gems: 'hidden_gem'
    };
    const mediaType = catMap[category];
    if (mediaType) {
      filtered = scored.filter(s => {
        const item = db.prepare('SELECT media_type FROM items WHERE id = ?').get(s.item_id);
        return item && item.media_type === mediaType;
      });
    }
  }

  // Paginate
  const pageItems = filtered.slice(offset, offset + limit);
  const total = filtered.length;

  // Enrich with item details
  const enriched = pageItems.map(s => {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(s.item_id);
    return {
      ...item,
      score: s.score,
      score_breakdown: s.breakdown
    };
  });

  res.json({
    ok: true,
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
    category,
    items: enriched
  });
});

/**
 * POST /api/v2/recommendations/:user/generate
 * Manually trigger full regeneration.
 */
app.post('/api/v2/recommendations/:user/generate', (req, res) => {
  const { user } = req.params;

  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }

  generateRecsForUser(userRow.id);
  res.json({ ok: true, message: 'Recommendations regenerating...' });
});

/**
 * DELETE /api/v2/recommendations/:user
 * Clear cached recommendations.
 */
app.delete('/api/v2/recommendations/:user', (req, res) => {
  const { user } = req.params;

  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }

  db.prepare('DELETE FROM recommendations WHERE user_id = ?').run(userRow.id);
  res.json({ ok: true, message: 'Recommendations cleared' });
});

// ============ RECOMMENDATION GENERATION ============

/**
 * Generate recommendations for a single user.
 * Scores all candidates, stores top N per category.
 * @param {number} userId
 */
export function generateRecsForUser(userId) {
  console.log(`🎬 Generating recommendations for user ${userId}...`);

  // Load taste profile (genres + keywords)
  const profileRow = db.prepare('SELECT genre_weights_json, keyword_weights_json FROM taste_profiles WHERE user_id = ?').get(userId);
  const tasteProfile = {
    genres: profileRow ? JSON.parse(profileRow.genre_weights_json) : {},
    keywords: profileRow ? JSON.parse(profileRow.keyword_weights_json) : {}
  };

  // Get exclusions
  const watched = getWatchedItems(userId);
  const dismissed = getDismissedItems(userId);
  const excluded = new Set([...watched, ...dismissed]);

  // All candidate items
  const allItems = db.prepare('SELECT id FROM items').all().map(r => r.id);
  const candidates = allItems.filter(id => !excluded.has(id));

  // Score all
  const scored = scoreCandidates(userId, candidates, tasteProfile);
  console.log(`   Scored ${scored.length} candidates`);

  // Clear old recommendations
  db.prepare('DELETE FROM recommendations WHERE user_id = ?').run(userId);

  // Category mapping
  const categories = [
    { name: 'for_you', filter: () => true },
    { name: 'movies', filter: (id) => getMediaType(id) === 'movie' },
    { name: 'tv', filter: (id) => getMediaType(id) === 'tv' },
    { name: 'anime', filter: (id) => isAnime(id) },
    { name: 'trending', filter: (id) => isTrending(id) },
    { name: 'hidden_gems', filter: (id) => isHiddenGem(id) }
  ];

  const insert = db.prepare(`
    INSERT INTO recommendations (user_id, item_id, category, score, content_score, collab_score, pop_score, breakdown_json, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('unixepoch','now'))
  `);

  for (const cat of categories) {
    const catItems = scored.filter(s => cat.filter(s.item_id)).slice(0, 50);
    for (const item of catItems) {
      insert.run(userId, item.item_id, cat.name, item.score, item.content_score, item.collab_score, item.pop_score, JSON.stringify(item.breakdown));
    }
  }

  console.log(`✅ Stored recommendations across ${categories.length} categories`);
}

/**
 * Helper: get media type for item
 */
function getMediaType(itemId) {
  const row = db.prepare('SELECT media_type FROM items WHERE id = ?').get(itemId);
  return row ? row.media_type : null;
}

/**
 * Helper: check if item is anime
 */
function isAnime(itemId) {
  const row = db.prepare('SELECT is_anime FROM items WHERE id = ?').get(itemId);
  return row && row.is_anime === 1;
}

/**
 * Helper: check if item is trending (high popularity)
 */
function isTrending(itemId) {
  const row = db.prepare('SELECT popularity FROM items WHERE id = ?').get(itemId);
  return row && row.popularity >= 1000;
}

/**
 * Helper: check if item is hidden gem (moderate popularity, high rating)
 */
function isHiddenGem(itemId) {
  const row = db.prepare('SELECT popularity, vote_average FROM items WHERE id = ?').get(itemId);
  return row && row.popularity >= 50 && row.popularity < 500 && row.vote_average >= 7.5;
}

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`🚀 SeerrV2 Engine running on http://localhost:${PORT}`);
  });
}

export default app;
