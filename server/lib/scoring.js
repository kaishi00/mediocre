import db from '../config.js';

/**
 * 3-Layer Ensemble Scoring Engine
 *
 * Layer weights:
 * - Content Filtering: 50% (genre/taste profile matching)
 * - Collaborative Filtering: 30% (user similarity from watch history overlap)
 * - Popularity/Recency: 20% (TMDB popularity × release year decay)
 */

/**
 * Content layer: score candidate against user's taste profile (genres + keywords).
 * @param {number} itemId
 * @param {Object} tasteProfile - { genreName: weight0-100, keywordName: weight0-100 }
 * @returns {number} score 0-1
 */
export function scoreContent(itemId, tasteProfile) {
  // Get item genres
  const genres = db.prepare(`
    SELECT g.name FROM item_genres ig
    JOIN genres g ON ig.genre_id = g.id
    WHERE ig.item_id = ?
  `).all(itemId);

  if (!genres.length) return 0;

  // Calculate genre match (average of matched genre weights / 100)
  let genreTotalWeight = 0;
  let genreMatches = 0;

  for (const g of genres) {
    if (tasteProfile.genres && tasteProfile.genres[g.name]) {
      genreTotalWeight += tasteProfile.genres[g.name];
      genreMatches++;
    }
  }

  const genreMatch = genreMatches > 0 ? genreTotalWeight / genreMatches / 100 : 0;

  // Get item keywords
  const keywords = db.prepare(`
    SELECT k.name FROM item_keywords ik
    JOIN keywords k ON ik.keyword_id = k.id
    WHERE ik.item_id = ?
  `).all(itemId);

  // Calculate keyword match (average of matched keyword weights / 100)
  let keywordTotalWeight = 0;
  let keywordMatches = 0;

  for (const k of keywords) {
    if (tasteProfile.keywords && tasteProfile.keywords[k.name]) {
      keywordTotalWeight += tasteProfile.keywords[k.name];
      keywordMatches++;
    }
  }

  const keywordMatch = keywordMatches > 0 ? keywordTotalWeight / keywordMatches / 100 : 0;

  // Blend: 50% genre + 50% keyword, but if no keywords, use genre only
  if (keywordMatches === 0) {
    return genreMatch;
  }

  const contentScore = (genreMatch * 0.5) + (keywordMatch * 0.5);
  return contentScore;
}

/**
 * Collaborative filtering: Jaccard similarity between user's watched set and other users.
 * @param {number} userId
 * @param {number} itemId
 * @returns {number} score 0-1
 */
export function scoreCollaborative(userId, itemId) {
  // Get users who watched this item
  const otherUsers = db.prepare(`
    SELECT DISTINCT user_id FROM watch_history
    WHERE item_id = ? AND user_id != ?
  `).all(itemId, userId);

  if (!otherUsers.length) return 0;

  // Get current user's watched set
  const userWatched = new Set(
    db.prepare('SELECT item_id FROM watch_history WHERE user_id = ?').all(userId).map(r => r.item_id)
  );

  let totalSim = 0;

  for (const other of otherUsers) {
    const otherWatched = db.prepare('SELECT item_id FROM watch_history WHERE user_id = ?').all(other.user_id).map(r => r.item_id);
    const otherSet = new Set(otherWatched);

    // Jaccard: intersection / union
    const intersection = [...userWatched].filter(id => otherSet.has(id)).length;
    const union = new Set([...userWatched, ...otherWatched]).size;

    if (union > 0) {
      totalSim += intersection / union;
    }
  }

  return totalSim / otherUsers.length;
}

/**
 * Popularity/Recency layer.
 * - TMDB popularity (log-scaled)
 * - Release year decay (newer = higher)
 * @param {number} itemId
 * @returns {number} score 0-1
 */
export function scorePopularity(itemId) {
  const item = db.prepare('SELECT popularity, release_date FROM items WHERE id = ?').get(itemId);

  if (!item || !item.popularity) return 0;

  // Log-scaled popularity (log(1 + popularity) / log(max_popularity + 1))
  const maxPop = db.prepare('SELECT MAX(popularity) as max FROM items WHERE popularity IS NOT NULL').get().max || 1;
  const popScore = Math.log(1 + item.popularity) / Math.log(1 + maxPop);

  // Year decay: newer releases score higher
  const currentYear = new Date().getFullYear();
  const releaseYear = item.release_date ? parseInt(item.release_date.substring(0, 4)) : currentYear;
  const age = Math.max(0, currentYear - releaseYear);
  const yearScore = Math.max(0, 1 - age / 50); // Linear decay over 50 years

  // Weighted combo: popularity 60%, recency 40%
  return (popScore * 0.6) + (yearScore * 0.4);
}

/**
 * Score a single candidate item against a user's profile.
 * @param {number} userId
 * @param {number} itemId
 * @param {Object} tasteProfile - normalized 0-100 genre weights
 * @returns {Object} { total, content, collab, pop, breakdown }
 */
export function scoreCandidate(userId, itemId, tasteProfile) {
  // Check dismissed/watched (should be pre-filtered but double-check)
  const isDismissed = db.prepare('SELECT 1 FROM dismissed_items WHERE user_id = ? AND item_id = ?').get(userId, itemId);
  const isWatched = db.prepare('SELECT 1 FROM watch_history WHERE user_id = ? AND item_id = ?').get(userId, itemId);

  if (isDismissed || isWatched) {
    return { total: 0, content: 0, collab: 0, pop: 0, breakdown: {}, dismissed: true, watched: !!isWatched };
  }

  const content = scoreContent(itemId, tasteProfile);

  // Also compute keyword_match separately for breakdown
  let keywordMatch = 0;
  const keywords = db.prepare(`
    SELECT k.name FROM item_keywords ik
    JOIN keywords k ON ik.keyword_id = k.id
    WHERE ik.item_id = ?
  `).all(itemId);

  if (keywords.length > 0 && tasteProfile.keywords) {
    let kwTotal = 0, kwMatches = 0;
    for (const k of keywords) {
      if (tasteProfile.keywords[k.name]) {
        kwTotal += tasteProfile.keywords[k.name];
        kwMatches++;
      }
    }
    keywordMatch = kwMatches > 0 ? kwTotal / kwMatches / 100 : 0;
  }

  const collab = scoreCollaborative(userId, itemId);
  const pop = scorePopularity(itemId);

  // Ensemble weights
  const total = (content * 0.5) + (collab * 0.3) + (pop * 0.2);

  return {
    total: Math.min(1, Math.max(0, total)),
    content,
    collab,
    pop,
    breakdown: {
      content_match: content.toFixed(4),
      keyword_match: keywordMatch.toFixed(4),
      collab_sim: collab.toFixed(4),
      pop_score: pop.toFixed(4)
    },
    dismissed: false,
    watched: false
  };
}

/**
 * Score a batch of candidate items for a user.
 * @param {number} userId
 * @param {number[]} candidateIds
 * @param {Object} tasteProfile
 * @returns {Array<{item_id, score, ...}>}
 */
export function scoreCandidates(userId, candidateIds, tasteProfile) {
  const results = [];

  for (const itemId of candidateIds) {
    const scored = scoreCandidate(userId, itemId, tasteProfile);
    if (!scored.dismissed && !scored.watched) {
      results.push({
        item_id: itemId,
        score: scored.total,
        content_score: scored.content,
        collab_score: scored.collab,
        pop_score: scored.pop,
        breakdown: scored.breakdown
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

export default {
  scoreContent,
  scoreCollaborative,
  scorePopularity,
  scoreCandidate,
  scoreCandidates
};
