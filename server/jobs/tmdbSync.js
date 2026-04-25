import db from '../config.js';
import { getPopularMovies, getPopularTvShows, getMovie, getTvShow, getGenres } from '../services/tmdb.js';
import { isAnime } from '../lib/animeDetector.js';

const TMDB_GENRES = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Kids',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'SciFi',
  10770: 'TVMovie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western'
};

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure a genre exists in the genres table and return its local ID.
 * Creates it if needed.
 */
function ensureGenre(tmdbGenreId, genreName) {
  const existing = db.prepare('SELECT id FROM genres WHERE tmdb_id = ?').get(tmdbGenreId);
  if (existing) {
    return existing.id;
  }

  // Also check by name (unique constraint)
  const byName = db.prepare('SELECT id FROM genres WHERE name = ?').get(genreName);
  if (byName) {
    // Update the tmdb_id if missing
    db.prepare('UPDATE genres SET tmdb_id = ? WHERE id = ?').run(tmdbGenreId, byName.id);
    return byName.id;
  }

  const result = db.prepare('INSERT INTO genres (tmdb_id, name) VALUES (?, ?)').run(tmdbGenreId, genreName);
  return result.lastInsertRowid;
}

/**
 * Link item to genre (item_genres)
 */
function linkItemGenre(itemId, genreId) {
  try {
    db.prepare('INSERT OR IGNORE INTO item_genres (item_id, genre_id) VALUES (?, ?)').run(itemId, genreId);
  } catch (e) {
    // Ignore duplicate errors
  }
}

/**
 * Upsert a keyword and return local ID
 */
function upsertKeyword(tmdbKeywordId, name) {
  const existing = db.prepare('SELECT id FROM keywords WHERE tmdb_id = ?').get(tmdbKeywordId);
  if (existing) {
    return existing.id;
  }

  try {
    const result = db.prepare('INSERT INTO keywords (tmdb_id, name) VALUES (?, ?)').run(tmdbKeywordId, name);
    return result.lastInsertRowid;
  } catch (err) {
    // Keyword might already exist by unique name constraint
    const existingByName = db.prepare('SELECT id FROM keywords WHERE name = ?').get(name);
    return existingByName ? existingByName.id : null;
  }
}

/**
 * Link item to keyword (item_keywords)
 */
function linkItemKeyword(itemId, keywordId) {
  try {
    db.prepare('INSERT OR IGNORE INTO item_keywords (item_id, keyword_id) VALUES (?, ?)').run(itemId, keywordId);
  } catch (e) {
    // Ignore duplicate errors
  }
}

/**
 * Upsert an item (movie or TV show) into the items table.
 * Returns the local item ID.
 */
function upsertItem(itemData, mediaType) {
  // TMDB uses 'title' for movies, 'name' for TV shows — normalize
  const title = itemData.title || itemData.name;
  const original_title = itemData.original_title || itemData.original_name;

  const {
    id,
    overview,
    poster_path,
    backdrop_path,
    release_date,
    first_air_date,
    vote_average,
    vote_count,
    popularity,
    original_language,
    origin_country
  } = itemData;

  // Extract year from dates
  const release_year = release_date ? parseInt(release_date.substring(0, 4)) : null;
  const first_air_year = first_air_date ? parseInt(first_air_date.substring(0, 4)) : null;

  // Check if item exists
  const existing = db.prepare('SELECT id FROM items WHERE tmdb_id = ? AND media_type = ?').get(id, mediaType);

  if (existing) {
    // Update
    db.prepare(`
      UPDATE items SET
        title = ?, original_title = ?, overview = ?, poster_path = ?,
        backdrop_path = ?, release_date = ?, first_air_date = ?,
        vote_average = ?, vote_count = ?, popularity = ?,
        updated_at = datetime('unixepoch','now')
      WHERE id = ?
    `).run(
      title, original_title, overview, poster_path,
      backdrop_path, release_date, first_air_date,
      vote_average, vote_count, popularity,
      existing.id
    );
    return existing.id;
  } else {
    // Insert
    const result = db.prepare(`
      INSERT INTO items (
        tmdb_id, media_type, title, original_title, overview,
        poster_path, backdrop_path, release_date, first_air_date,
        vote_average, vote_count, popularity,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('unixepoch','now'), datetime('unixepoch','now'))
    `).run(
      id, mediaType, title, original_title, overview,
      poster_path, backdrop_path, release_date, first_air_date,
      vote_average, vote_count, popularity
    );
    return result.lastInsertRowid;
  }
}

/**
 * Fetch and link genres for an item
 */
async function processGenres(itemId, itemData, mediaType) {
  const genreIds = itemData.genre_ids || [];
  for (const tmdbGenreId of genreIds) {
    const genreName = TMDB_GENRES[tmdbGenreId];
    if (genreName) {
      const localGenreId = ensureGenre(tmdbGenreId, genreName);
      linkItemGenre(itemId, localGenreId);
    }
  }
}

/**
 * Fetch and link keywords for an item
 */
async function processKeywords(itemId, tmdbId, mediaType) {
  try {
    // Fetch keywords from TMDB
    const endpoint = mediaType === 'tv' ? `/tv/${tmdbId}/keywords` : `/movie/${tmdbId}/keywords`;
    const res = await fetch(`${process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3'}${endpoint}?api_key=${process.env.TMDB_API_KEY}`);
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`      ⚠️  No keywords (404)`);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const keywords = data.keywords || [];

    for (const kw of keywords) {
      const keywordId = upsertKeyword(kw.id, kw.name);
      if (keywordId) {
        linkItemKeyword(itemId, keywordId);
      }
    }

    if (keywords.length === 0) {
      console.log(`      No keywords`);
    } else {
      console.log(`      Added ${keywords.length} keywords`);
    }
  } catch (err) {
    console.error(`      ❌ Error fetching keywords:`, err.message);
  }
}

/**
 * Process a single movie or TV show
 */
async function processItem(item, mediaType, index, total) {
  const { id, original_language, origin_country, genre_ids, ...rest } = item;
  const title = item.title || item.name || 'Unknown';

  console.log(`[${index + 1}/${total}] Processing ${mediaType === 'movie' ? '🎬' : '📺'} ${title}`);

  // Upsert item
  const itemId = upsertItem(item, mediaType);

  // Process genres
  await processGenres(itemId, item, mediaType);

  // Process keywords
  await processKeywords(itemId, id, mediaType);

  return itemId;
}

/**
 * Phase 1: Fetch popular movies
 */
async function syncPopularMovies(maxPages = 5) {
  console.log('\n📥 Phase 1: Fetching popular movies...');
  let totalProcessed = 0;

  for (let page = 1; page <= maxPages; page++) {
    console.log(`   Fetching page ${page}/${maxPages}...`);
    const data = await getPopularMovies(page);

    const movies = data.results || [];
    console.log(`   Found ${movies.length} movies on page ${page}`);

    for (let i = 0; i < movies.length; i++) {
      await processItem(movies[i], 'movie', totalProcessed + i, movies.length * maxPages);
      await sleep(350); // Rate limiting between items
    }

    totalProcessed += movies.length;
  }

  console.log(`✅ Phase 1 complete: ${totalProcessed} movies processed`);
  return totalProcessed;
}

/**
 * Phase 2: Fetch popular TV shows
 */
async function syncPopularTvShows(maxPages = 5) {
  console.log('\n📺 Phase 2: Fetching popular TV shows...');
  let totalProcessed = 0;

  for (let page = 1; page <= maxPages; page++) {
    console.log(`   Fetching page ${page}/${maxPages}...`);
    const data = await getPopularTvShows(page);

    const shows = data.results || [];
    console.log(`   Found ${shows.length} shows on page ${page}`);

    for (let i = 0; i < shows.length; i++) {
      await processItem(shows[i], 'tv', totalProcessed + i, shows.length * maxPages);
      await sleep(350); // Rate limiting between items
    }

    totalProcessed += shows.length;
  }

  console.log(`✅ Phase 2 complete: ${totalProcessed} TV shows processed`);
  return totalProcessed;
}

/**
 * Phase 3: Normalize all TMDB genres into our genres table
 */
function normalizeGenres() {
  console.log('\n🏷️  Phase 3: Normalizing genres...');
  let created = 0;
  let existing = 0;

  for (const [tmdbId, name] of Object.entries(TMDB_GENRES)) {
    const id = parseInt(tmdbId);
    const existingGenre = db.prepare('SELECT id FROM genres WHERE tmdb_id = ?').get(id);
    if (existingGenre) {
      existing++;
    } else {
      db.prepare('INSERT INTO genres (tmdb_id, name) VALUES (?, ?)').run(id, name);
      created++;
    }
  }

  console.log(`✅ Phase 3 complete: ${created} created, ${existing} already existed`);
  console.log(`   Total genres in DB: ${db.prepare('SELECT COUNT(*) as cnt FROM genres').get().cnt}`);
}

/**
 * Phase 4: Detect and mark anime items
 */
function detectAnime() {
  console.log('\n🔍 Phase 4: Detecting anime...');

  const items = db.prepare('SELECT id, tmdb_id, media_type, title FROM items').all();

  let markedAnime = 0;
  let alreadyAnime = 0;

  for (const item of items) {
    const current = db.prepare('SELECT is_anime FROM items WHERE id = ?').get(item.id);
    if (current.is_anime === 1) {
      alreadyAnime++;
      continue;
    }

    const genres = db.prepare(`
      SELECT g.id, g.name, g.tmdb_id
      FROM item_genres ig
      JOIN genres g ON ig.genre_id = g.id
      WHERE ig.item_id = ?
    `).all(item.id);

    const keywords = db.prepare(`
      SELECT k.id, k.name, k.tmdb_id
      FROM item_keywords ik
      JOIN keywords k ON ik.keyword_id = k.id
      WHERE ik.item_id = ?
    `).all(item.id);

    // Genre-based detection: Animation (16) + Japanese-origin keywords
    const hasAnimation = genres.some(g => g.tmdb_id === 16);
    const animeKeywords = ['anime', 'based on manga', 'based on light novel', 'shonen', 'seinen', 'shoujo'];
    const hasAnimeKeyword = keywords.some(k =>
      animeKeywords.some(ak => k.name.toLowerCase().includes(ak))
    );

    if (hasAnimation && hasAnimeKeyword) {
      db.prepare('UPDATE items SET is_anime = 1 WHERE id = ?').run(item.id);
      console.log(`   🎌 ${item.title} → anime`);
      markedAnime++;
    }
  }

  console.log(`✅ Phase 4 complete: ${markedAnime} marked as anime, ${alreadyAnime} already marked`);
  console.log(`   Total anime: ${db.prepare("SELECT COUNT(*) as cnt FROM items WHERE is_anime = 1").get().cnt}`);
}

/**
 * Main sync function
 */
async function syncCatalog(options = {}) {
  const { pages = 5, dryRun = false } = options;

  console.log('🚀 Starting TMDB Catalog Sync');
  console.log(`   Pages per category: ${pages}`);
  console.log(`   Dry run: ${dryRun}`);

  if (dryRun) {
    console.log('   ⚠️  Dry run mode - no database changes will be made');
  }

  try {
    // Phase 1: Movies
    const movieCount = await syncPopularMovies(pages);

    // Phase 2: TV Shows
    const tvCount = await syncPopularTvShows(pages);

    // Phase 3: Genre normalization (only if not dry run)
    if (!dryRun) {
      normalizeGenres();
      detectAnime();
    }

    // Summary
    console.log('\n📊 Sync Summary:');
    console.log(`   Movies: ~${movieCount}`);
    console.log(`   TV Shows: ~${tvCount}`);
    console.log(`   Total items: ${db.prepare('SELECT COUNT(*) as cnt FROM items').get().cnt}`);
    console.log(`   Total genres: ${db.prepare('SELECT COUNT(*) as cnt FROM genres').get().cnt}`);
    console.log(`   Total keywords: ${db.prepare('SELECT COUNT(*) as cnt FROM keywords').get().cnt}`);
    console.log(`   Item-genre links: ${db.prepare('SELECT COUNT(*) as cnt FROM item_genres').get().cnt}`);
    console.log(`   Item-keyword links: ${db.prepare('SELECT COUNT(*) as cnt FROM item_keywords').get().cnt}`);

  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
}

// CLI handling
const args = process.argv.slice(2);
const options = { pages: 5, dryRun: false };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pages' && args[i + 1]) {
    options.pages = parseInt(args[i + 1]);
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  }
}

syncCatalog(options).catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
