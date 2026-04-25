/**
 * Fuzzy title matching for Plex → TMDB resolution.
 * Uses string similarity, year matching, and media type hints.
 */

import { findNthIndex } from 'node:fs'; // placeholder - we'll implement without external deps

/**
 * Normalize a title for comparison
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .trim()
    // Remove common article prefixes
    .replace(/^(the|a|an)\s+/i, '')
    // Remove punctuation
    .replace(/[^\w\s]/g, '')
    // Replace multiple spaces with single
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract year from title if present in parentheses
 */
function extractYearFromTitle(title) {
  const match = title.match(/\((\d{4})\)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Calculate simple Jaro-Winkler-like similarity (0-1)
 */
function stringSimilarity(str1, str2) {
  const s1 = normalizeTitle(str1);
  const s2 = normalizeTitle(str2);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Simple character matching distance
  const len1 = s1.length;
  const len2 = s2.length;

  // Use Levenshtein distance
  const matrix = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = s2[i - 1] === s1[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Check if two years are "close" (same year or off by 1)
 */
function yearsMatch(year1, year2) {
  if (!year1 || !year2) return true; // If unknown, don't penalize
  return Math.abs(year1 - year2) <= 1;
}

/**
 * Score a candidate match between Plex title and TMDB item
 */
function scoreMatch(plexTitle, plexYear, plexType, tmdbItem) {
  let score = 0;

  // Title similarity (0-1)
  const titleSim = stringSimilarity(plexTitle, tmdbItem.title);
  score += titleSim * 0.6; // 60% weight

  // Year match bonus/penalty
  const tmdbYear = tmdbItem.release_year || (tmdbItem.first_air_date ? parseInt(tmdbItem.first_air_date.substring(0, 4)) : null);
  if (plexYear && tmdbYear) {
    if (yearsMatch(plexYear, tmdbYear)) {
      score += 0.2; // +20% for year match
    } else {
      score -= 0.2; // -20% for year mismatch
    }
  }

  // Media type match bonus
  if (plexType) {
    const tmdbType = tmdbItem.media_type || (tmdbItem.first_air_date ? 'tv' : 'movie');
    if (plexType === tmdbType) {
      score += 0.1; // +10% for type match
    }
  }

  // Popularity/vote count bonus (more popular items are more likely)
  const voteCount = tmdbItem.vote_count || 0;
  const popularity = tmdbItem.popularity || 0;
  const popularityBonus = Math.min(0.1, (Math.log10(voteCount + 1) / 10) * 0.1);
  score += popularityBonus;

  return Math.max(0, Math.min(1, score));
}

/**
 * Find the best TMDB match for a Plex item.
 * @param {Object} plexItem - Plex metadata object with title, year, type
 * @param {Array} candidates - Array of TMDB items to search
 * @param {number} [threshold=0.6] - Minimum score to consider a match
 * @returns {Object|null} Best matching TMDB item or null
 */
export function resolveTitle(plexItem, candidates, threshold = 0.6) {
  const { title, year, type } = plexItem;

  if (!candidates || candidates.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreMatch(title, year, type, candidate);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    return { item: bestMatch, score: bestScore };
  }

  return null;
}

/**
 * Batch resolve multiple Plex items
 */
export function resolveBatch(plexItems, candidates, threshold = 0.6) {
  return plexItems.map(plexItem => ({
    plexItem,
    match: resolveTitle(plexItem, candidates, threshold)
  }));
}

/**
 * Pre-filter candidates by media type
 */
export function filterByType(candidates, type) {
  if (!type) return candidates;
  return candidates.filter(c => {
    const tmdbType = c.media_type || (c.first_air_date ? 'tv' : 'movie');
    return tmdbType === type;
  });
}

/**
 * Pre-filter candidates by year range (±2 years)
 */
export function filterByYear(candidates, year, tolerance = 2) {
  if (!year) return candidates;
  return candidates.filter(c => {
    const cYear = c.release_year || (c.first_air_date ? parseInt(c.first_air_date.substring(0, 4)) : null);
    if (!cYear) return true;
    return Math.abs(cYear - year) <= tolerance;
  });
}
