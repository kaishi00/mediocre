import db from '../config.js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PlexClient } from '../services/plex.js';
import { resolveTitle, filterByType, filterByYear } from '../lib/titleResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load Plex token from file
 */
function loadPlexToken() {
  const tokenPath = join(__dirname, '..', '..', 'data', '.plex_token.json');
  if (!existsSync(tokenPath)) {
    throw new Error(`Plex token not found at ${tokenPath}. Run OAuth flow first or create the file with {"token":"..."}`);
  }
  const tokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  return tokenData.token || tokenData.access_token;
}

/**
 * Ensure user exists in database
 */
function ensureUser(username, displayName) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO users (username, display_name, email, created_at)
    VALUES (?, ?, ?, datetime('unixepoch','now'))
  `).run(username, displayName || username, `${username}@plex.local`);
  return result.lastInsertRowid;
}

/**
 * Match a Plex item to a TMDB item in our database
 */
async function matchPlexItemToTmdb(plexItem, client) {
  const { title, year, type, guid, ratingKey } = plexItem;

  // Strategy 1: Try TMDB GUID from Plex
  if (guid) {
    // Plex GUIDs look like: com.plexapp.agents.imdb://tt1234567?lang=en
    // or tmdb://12345
    const tmdbMatch = guid.match(/tmdb:\/\/(\d+)/);
    if (tmdbMatch) {
      const tmdbId = parseInt(tmdbMatch[1]);
      const existing = db.prepare('SELECT id FROM items WHERE tmdb_id = ?').get(tmdbId);
      if (existing) {
        return { itemId: existing.id, method: 'guid', confidence: 1.0 };
      }
    }
  }

  // Strategy 2: Fuzzy title match against our items
  // Fetch candidates from DB matching media type
  const mediaType = type === 'show' ? 'tv' : 'movie';
  let candidates = db.prepare(`
    SELECT * FROM items
    WHERE media_type = ?
    ORDER BY popularity DESC
  `).all(mediaType);

  if (candidates.length === 0) {
    return null;
  }

  // Filter by year if available
  if (year) {
    candidates = filterByYear(candidates, year);
  }

  // Try fuzzy match
  const match = resolveTitle(
    { title, year, type: mediaType },
    candidates,
    0.55 // Threshold - allow partial matches
  );

  if (match) {
    return {
      itemId: match.item.id,
      method: 'fuzzy',
      confidence: match.score
    };
  }

  return null;
}

/**
 * Import watch history for a specific user
 */
async function importWatchHistory(userId, userName, plexClient, options = {}) {
  console.log(`\n📥 Importing watch history for user: ${userName} (ID: ${userId})`);

  // Get all libraries
  const libraries = await plexClient.getLibraries();
  console.log(`   Found ${libraries.length} libraries`);

  let totalWatched = 0;
  let matched = 0;
  let unmatched = 0;
  const matchMethods = {};

  for (const lib of libraries) {
    console.log(`   📚 Scanning library: ${lib.title} (${lib.type})`);

    try {
      const watchedItems = await plexClient.getWatchHistory(lib.key);
      console.log(`      Found ${watchedItems.length} watched items`);

      for (const plexItem of watchedItems) {
        totalWatched++;

        // Skip if already in watch history (unique constraint)
        const existing = db.prepare(`
          SELECT id FROM watch_history
          WHERE user_id = ? AND title = ? AND source = 'plex'
        `).get(userId, plexItem.title);

        if (existing) {
          continue;
        }

        // Match to TMDB
        const match = await matchPlexItemToTmdb(plexItem, plexClient);

        if (match) {
          // Insert into watch_history
          try {
            db.prepare(`
              INSERT INTO watch_history (user_id, item_id, media_type, title, watched_at, source, rating, metadata_json)
              VALUES (?, ?, ?, ?, ?, 'plex', ?, ?)
            `).run(
              userId,
              match.itemId,
              plexItem.type === 'show' ? 'tv' : 'movie',
              plexItem.title,
              new Date(plexItem.lastViewedAt * 1000).toISOString(),
              plexItem.userRating || null,
              JSON.stringify({ plexRatingKey: plexItem.ratingKey, plexTitle: plexItem.title })
            );

            matched++;
            matchMethods[match.method] = (matchMethods[match.method] || 0) + 1;
            console.log(`      ✅ [${match.method.toUpperCase()}] ${plexItem.title} → item ${match.itemId} (conf: ${(match.confidence * 100).toFixed(0)}%)`);
          } catch (e) {
            // Duplicate or constraint violation - skip
            if (e.code === 'SQLITE_CONSTRAINT') {
              // Already logged, skip
            } else {
              console.error(`      ❌ DB error:`, e.message);
            }
          }
        } else {
          unmatched++;
          console.log(`      ❌ No match: ${plexItem.title}`);
        }

        // Small delay to be nice to our own DB
        if (options.dryRun) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (e) {
      console.error(`   ❌ Error scanning library ${lib.title}:`, e.message);
    }
  }

  // Summary
  console.log(`\n📊 Import Summary for ${userName}:`);
  console.log(`   Total watched items scanned: ${totalWatched}`);
  console.log(`   Successfully matched: ${matched}`);
  console.log(`   Unmatched: ${unmatched}`);
  console.log(`   Match rate: ${((matched / totalWatched) * 100).toFixed(1)}%`);
  console.log('   Methods:', matchMethods);

  return { totalWatched, matched, unmatched };
}

/**
 * Main import function
 */
async function importPlexHistory(options = {}) {
  console.log('🚀 Starting Plex Watch History Import');
  console.log(`   Plex URL: ${process.env.PLEX_URL || 'http://localhost:32400'}`);
  console.log(`   Target user: ${options.userName || 'all'}`);
  console.log(`   Dry run: ${options.dryRun}`);

  if (options.dryRun) {
    console.log('   ⚠️  Dry run mode - no database changes will be made');
  }

  try {
    // Load token and create client
    const token = loadPlexToken();
    const client = new PlexClient({
      url: process.env.PLEX_URL || 'http://localhost:32400',
      token: token
    });

    // Test connection
    try {
      const servers = await client.query('/');
      console.log(`   ✅ Connected to Plex server: ${servers.MediaContainer?.friendlyName || 'Unknown'}`);
    } catch (e) {
      console.error('❌ Failed to connect to Plex server:', e.message);
      process.exit(1);
    }

    // Get users
    const users = await client.getUsers();
    console.log(`   👥 Discovered ${users.length} Plex users`);

    // Determine which users to import
    let targetUsers = users;
    if (options.userName) {
      targetUsers = users.filter(u => u.username === options.userName || u.title === options.userName);
      if (targetUsers.length === 0) {
        console.error(`❌ User "${options.userName}" not found`);
        process.exit(1);
      }
    }

    // Import for each user
    for (const user of targetUsers) {
      const localUserId = ensureUser(user.username, user.title);
      await importWatchHistory(localUserId, user.username, client, options);
    }

    console.log('\n✅ Plex import complete!');

  } catch (err) {
    console.error('❌ Import failed:', err);
    process.exit(1);
  }
}

// CLI handling
const args = process.argv.slice(2);
const cliOptions = { dryRun: false };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--user' && args[i + 1]) {
    cliOptions.userName = args[i + 1];
  } else if (args[i] === '--all') {
    cliOptions.userName = null; // All users
  } else if (args[i] === '--dry-run') {
    cliOptions.dryRun = true;
  }
}

importPlexHistory(cliOptions).catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
