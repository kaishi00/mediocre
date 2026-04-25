/**
 * Anime detection heuristics for TMDB items.
 * Uses genre, language, origin country, and keyword analysis.
 */

/**
 * Check if an item is likely anime based on heuristics.
 * @param {Object} item - TMDB item (movie or tv)
 * @param {Array} genres - Array of genre objects {id, name}
 * @param {Array} keywords - Array of keyword objects {id, name}
 * @returns {boolean} true if item is likely anime
 */
export function isAnime(item, genres = [], keywords = []) {
  // Genre ID 16 = Animation
  const hasAnimationGenre = genres.some(g => g.id === 16 || g.name === 'Animation');

  // Language/region indicators
  const isJapanese = item.original_language === 'ja';
  const originCountries = item.origin_country || [];
  const hasJapan = Array.isArray(originCountries)
    ? originCountries.some(c => c === 'JP' || c === 'Japan' || c === 'JP')
    : false;

  // Keyword checks for anime/manga indicators
  const animeKeywords = [
    'anime',
    'based-on-manga',
    'manga',
    'shounen',
    'seinen',
    'shoujo',
    'josei',
    'mecha',
    'isekai',
    'fantasy',
    'japanese animation'
  ];

  const hasAnimeKeyword = keywords.some(k =>
    animeKeywords.some(ak => k.name.toLowerCase().includes(ak))
  );

  // Decision logic:
  // - Animation genre + Japanese origin => anime
  // - Animation genre + Japanese language => anime
  // - Explicit anime/manga keyword => anime
  const isAnimeResult = (hasAnimationGenre && (isJapanese || hasJapan)) || hasAnimeKeyword;

  return isAnimeResult;
}

/**
 * Batch detect anime for multiple items.
 * Useful for bulk operations.
 */
export function detectAnimeBatch(itemsWithMetadata) {
  return itemsWithMetadata.map(({ item, genres, keywords }) => ({
    tmdbId: item.id,
    mediaType: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
    isAnime: isAnime(item, genres, keywords)
  }));
}
