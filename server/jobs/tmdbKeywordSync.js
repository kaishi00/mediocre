import db from '../config.js';

/**
 * Sync keywords from TMDB for all items in the database.
 * Queries TMDB /movie/{id}/keywords or /tv/{id}/keywords
 * Upserts into keywords and item_keywords tables.
 *
 * Usage: node server/jobs/tmdbKeywordSync.js
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';

if (!TMDB_API_KEY) {
  console.error('❌ TMDB_API_KEY not set in environment');
  process.exit(1);
}

/**
 * Fetch keywords from TMDB for a given item
 * @param {number} tmdbId - TMDB ID
 * @param {string} mediaType - 'movie' or 'tv'
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
async function fetchKeywordsFromTMDB(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv'
    ? `/tv/${tmdbId}/keywords`
    : `/movie/${tmdbId}/keywords`;

  const url = `${TMDB_BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`   ⚠️  No keywords found for ${mediaType} ${tmdbId} (404)`);
        return [];
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    // Movies return "keywords" array, TV shows return "results" array
    return data.keywords || data.results || [];
  } catch (err) {
    console.error(`   ❌ Error fetching keywords for ${mediaType} ${tmdbId}:`, err.message);
    return [];
  }
}

/**
 * Upsert a keyword into the keywords table and return its local ID
 * @param {number} tmdbKeywordId - TMDB keyword ID
 * @param {string} name - Keyword name
 * @returns {number} local keyword ID
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
 * Link an item to a keyword (item_keywords)
 * @param {number} itemId - Local item ID
 * @param {number} keywordId - Local keyword ID
 */
function linkItemKeyword(itemId, keywordId) {
  try {
    db.prepare('INSERT OR IGNORE INTO item_keywords (item_id, keyword_id) VALUES (?, ?)').run(itemId, keywordId);
  } catch (err) {
    // Ignore duplicate errors
  }
}

/**
 * Main sync function
 */
async function syncKeywords() {
  console.log('📥 Starting TMDB keyword sync...');

  // Get all items from DB
  const items = db.prepare('SELECT id, tmdb_id, media_type FROM items').all();
  console.log(`   Found ${items.length} items to process`);

  let totalKeywords = 0;
  let failed = 0;

  for (const [index, item] of items.entries()) {
    const { id: itemId, tmdb_id, media_type } = item;

    // Rate limiting: be nice to TMDB (3 requests/sec free tier)
    if (index > 0 && index % 40 === 0) {
      console.log(`   💤 Rate limit pause at ${index}/${items.length}...`);
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10s pause every 40 items
    }

    console.log(`   [${index + 1}/${items.length}] Fetching keywords for ${media_type} ${tmdb_id} (item ${itemId})`);

    const keywords = await fetchKeywordsFromTMDB(tmdb_id, media_type);

    for (const kw of keywords) {
      const keywordId = upsertKeyword(kw.id, kw.name);
      if (keywordId) {
        linkItemKeyword(itemId, keywordId);
        totalKeywords++;
      }
    }

    if (keywords.length === 0) {
      console.log(`      No keywords`);
    } else {
      console.log(`      Added ${keywords.length} keywords`);
    }
  }

  console.log(`✅ Sync complete! Total keywords linked: ${totalKeywords}`);
  console.log(`   Keywords table: ${db.prepare('SELECT COUNT(*) as cnt FROM keywords').get().cnt} entries`);
  console.log(`   Item_keywords table: ${db.prepare('SELECT COUNT(*) as cnt FROM item_keywords').get().cnt} links`);
}

// Run
syncKeywords().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
