import db from '../config.js';

/**
 * Build a taste profile for a user from their watch history.
 * Now weights genres AND keywords by rating (explicit or from watch_history).
 *
 * @param {number} userId - The user ID
 * @returns {Object} { genres: {...}, keywords: {...}, stats: {...} }
 */
export function buildTasteProfile(userId) {
  // Get all watched items with their ratings
  const rows = db.prepare(`
    SELECT
      wh.item_id,
      wh.rating as wh_rating,
      ur.rating as ur_rating
    FROM watch_history wh
    LEFT JOIN user_ratings ur ON wh.user_id = ur.user_id AND wh.item_id = ur.item_id
    WHERE wh.user_id = ?
    GROUP BY wh.item_id
  `).all(userId);

  // Calculate effective rating (explicit > watch_history rating > 1.0 neutral)
  const getEffectiveRating = (whRating, urRating) => {
    if (urRating !== null && urRating !== undefined) return urRating;
    if (whRating !== null && whRating !== undefined) return whRating;
    return null; // null means neutral weight 1.0
  };

  // Get rating multiplier weight
  const getRatingWeight = (rating) => {
    if (rating === null) return 1.0; // neutral
    if (rating >= 9) return 2.0;
    if (rating >= 7) return 1.5;
    if (rating >= 5) return 1.0;
    if (rating >= 3) return 0.5;
    return -0.5; // penalty for low ratings
  };

  // Aggregate genre scores weighted by ratings
  const genreScores = {};
  // Aggregate keyword scores weighted by ratings
  const keywordScores = {};

  for (const row of rows) {
    const effectiveRating = getEffectiveRating(row.wh_rating, row.ur_rating);
    const weight = getRatingWeight(effectiveRating);

    // Fetch genres for this item
    const genres = db.prepare(`
      SELECT g.name FROM item_genres ig
      JOIN genres g ON ig.genre_id = g.id
      WHERE ig.item_id = ?
    `).all(row.item_id);

    for (const g of genres) {
      const genreName = g.name;
      if (!genreScores[genreName]) {
        genreScores[genreName] = 0;
      }
      genreScores[genreName] += weight;
    }

    // Fetch keywords for this item
    const keywords = db.prepare(`
      SELECT k.name FROM item_keywords ik
      JOIN keywords k ON ik.keyword_id = k.id
      WHERE ik.item_id = ?
    `).all(row.item_id);

    for (const k of keywords) {
      const keywordName = k.name;
      if (!keywordScores[keywordName]) {
        keywordScores[keywordName] = 0;
      }
      keywordScores[keywordName] += weight;
    }
  }

  // Clamp scores at 0 (no negative base scores)
  for (const key in genreScores) {
    if (genreScores[key] < 0) genreScores[key] = 0;
  }
  for (const key in keywordScores) {
    if (keywordScores[key] < 0) keywordScores[key] = 0;
  }

  // Normalize to 0-100 scale
  const maxGenreScore = Math.max(...Object.values(genreScores), 1);
  const normalizedGenres = {};
  for (const [genre, score] of Object.entries(genreScores)) {
    normalizedGenres[genre] = Math.round((score / maxGenreScore) * 100);
  }

  const maxKeywordScore = Math.max(...Object.values(keywordScores), 1);
  const normalizedKeywords = {};
  for (const [keyword, score] of Object.entries(keywordScores)) {
    normalizedKeywords[keyword] = Math.round((score / maxKeywordScore) * 100);
  }

  // Stats
  const totalWatched = db.prepare('SELECT COUNT(*) as count FROM watch_history WHERE user_id = ?').get(userId).count;
  const withRatings = db.prepare('SELECT COUNT(*) as count FROM watch_history WHERE user_id = ? AND rating IS NOT NULL').get(userId).count;
  const explicitRatings = db.prepare('SELECT COUNT(*) as count FROM user_ratings WHERE user_id = ?').get(userId).count;

  return {
    genres: normalizedGenres,
    keywords: normalizedKeywords,
    stats: {
      totalWatched,
      withRatings,
      explicitRatings,
      distinctGenres: Object.keys(normalizedGenres).length,
      distinctKeywords: Object.keys(normalizedKeywords).length
    }
  };
}

/**
 * Get all dismissed item IDs for a user.
 * @param {number} userId
 * @returns {number[]}
 */
export function getDismissedItems(userId) {
  const rows = db.prepare('SELECT item_id FROM dismissed_items WHERE user_id = ?').all(userId);
  return rows.map(r => r.item_id);
}

/**
 * Get all watched item IDs for a user.
 * @param {number} userId
 * @returns {number[]}
 */
export function getWatchedItems(userId) {
  const rows = db.prepare('SELECT item_id FROM watch_history WHERE user_id = ?').all(userId);
  return rows.map(r => r.item_id);
}

/**
 * Rebuild a user's taste profile and trigger recommendation regeneration.
 * Called after watch/dismiss actions.
 * @param {number} userId
 * @param {Function} generateFn - Optional callback to trigger regeneration
 */
export function rebuildProfile(userId, generateFn = null) {
  const profile = buildTasteProfile(userId);
  const existing = db.prepare('SELECT id FROM taste_profiles WHERE user_id = ?').get(userId);

  if (existing) {
    db.prepare(`
      UPDATE taste_profiles
      SET genre_weights_json = ?, keyword_weights_json = ?, updated_at = datetime('unixepoch','now')
      WHERE user_id = ?
    `).run(JSON.stringify(profile.genres), JSON.stringify(profile.keywords), userId);
  } else {
    db.prepare(`
      INSERT INTO taste_profiles (user_id, genre_weights_json, keyword_weights_json, created_at, updated_at)
      VALUES (?, ?, ?, datetime('unixepoch','now'), datetime('unixepoch','now'))
    `).run(userId, JSON.stringify(profile.genres), JSON.stringify(profile.keywords));
  }

  console.log(`✅ Taste profile rebuilt for user ${userId}`);

  if (generateFn) {
    // Async fire-and-forget
    setImmediate(() => {
      try {
        generateFn(userId);
      } catch (e) {
        console.error('Failed to generate recs:', e);
      }
    });
  }
}

export default {
  buildTasteProfile,
  getDismissedItems,
  getWatchedItems,
  rebuildProfile
};
