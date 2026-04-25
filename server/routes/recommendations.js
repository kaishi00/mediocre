     1|import express from 'express';
     2|import db from './config.js';
     3|import { buildTasteProfile, getDismissedItems, getWatchedItems, rebuildProfile } from './services/recommender.js';
     4|import { scoreCandidates } from './lib/scoring.js';
     5|
     6|const app = express();
     7|const PORT = process.env.PORT || 3000;
     8|
     9|app.use(express.json());
    10|
    11|// CORS middleware for frontend
    12|app.use((req, res, next) => {
    13|  res.header('Access-Control-Allow-Origin', '*');
    14|  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    15|  next();
    16|});
    17|
    18|// Health check
    19|app.get('/health', (req, res) => {
    20|  res.json({ status: 'ok', timestamp: new Date().toISOString() });
    21|});
    22|
    23|/**
    24| * POST /api/v2/recommendations/:user/watched
    25| * Record that a user watched an item, optionally with a rating.
    26| */
    27|app.post('/api/v2/recommendations/:user/watched', (req, res) => {
    28|  const { user } = req.params;
    29|  const { item_id, rating } = req.body;
    30|
    31|  // Validate user exists
    32|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
    33|  if (!userRow) {
    34|    return res.status(404).json({ ok: false, error: 'User not found' });
    35|  }
    36|  const userId = userRow.id;
    37|
    38|  // Validate item exists
    39|  const itemRow = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
    40|  if (!itemRow) {
    41|    return res.status(404).json({ ok: false, error: 'Item not found' });
    42|  }
    43|
    44|  // Validate rating if provided
    45|  if (rating !== undefined && (rating < 1 || rating > 10)) {
    46|    return res.status(400).json({ ok: false, error: 'Rating must be between 1 and 10' });
    47|  }
    48|
    49|  try {
    50|    // 3. If rating provided, upsert into user_ratings
    51|    if (rating !== undefined) {
    52|      db.prepare(`
    53|        INSERT INTO user_ratings (user_id, item_id, rating) VALUES (?, ?, ?)
    54|        ON CONFLICT(user_id, item_id) DO UPDATE SET rating = excluded.rating, rated_at = datetime('unixepoch','now')
    55|      `).run(userId, item_id, rating);
    56|    }
    57|
    58|    // 4. Insert into watch_history (if not already there, ignore duplicates)
    59|    const existingWatch = db.prepare('SELECT id FROM watch_history WHERE user_id = ? AND item_id = ?').get(userId, item_id);
    60|    if (!existingWatch) {
    61|      db.prepare(`
    62|        INSERT INTO watch_history (user_id, item_id, media_type, title, watched_at, source, rating)
    63|        SELECT id, ?, media_type, title, datetime('unixepoch','now'), 'api', ?
    64|        FROM items WHERE id = ?
    65|      `).run(item_id, rating, item_id);
    66|    } else if (rating !== undefined) {
    67|      // Update rating on existing watch
    68|      db.prepare('UPDATE watch_history SET rating = ? WHERE user_id = ? AND item_id = ?').run(rating, userId, item_id);
    69|    }
    70|
    71|    // 5. Rebuild taste profile (sync for consistency)
    72|    rebuildProfile(userId, generateRecsForUser);
    73|
    74|    // 6. Respond immediately (async regen in background)
    75|    res.status(201).json({
    76|      ok: true,
    77|      message: 'Watched recorded, recommendations updating...'
    78|    });
    79|  } catch (err) {
    80|    console.error('Error recording watched:', err);
    81|    res.status(500).json({ ok: false, error: 'Internal server error' });
    82|  }
    83|});
    84|
    85|/**
    86| * POST /api/v2/recommendations/:user/dismiss
    87| * Dismiss an item from recommendations.
    88| */
    89|app.post('/api/v2/recommendations/:user/dismiss', (req, res) => {
    90|  const { user } = req.params;
    91|  const { item_id } = req.body;
    92|
    93|  // Validate user exists
    94|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
    95|  if (!userRow) {
    96|    return res.status(404).json({ ok: false, error: 'User not found' });
    97|  }
    98|  const userId = userRow.id;
    99|
   100|  // Validate item exists
   101|  const itemRow = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
   102|  if (!itemRow) {
   103|    return res.status(404).json({ ok: false, error: 'Item not found' });
   104|  }
   105|
   106|  try {
   107|    // 2. Insert into dismissed_items (ignore conflicts)
   108|    db.prepare(`
   109|      INSERT OR IGNORE INTO dismissed_items (user_id, item_id, reason) VALUES (?, ?, 'not_interested')
   110|    `).run(userId, item_id);
   111|
   112|    // 3. Remove from cached recommendations
   113|    db.prepare('DELETE FROM recommendations WHERE user_id = ? AND item_id = ?').run(userId, item_id);
   114|
   115|    res.status(201).json({
   116|      ok: true,
   117|      message: 'Dismissed'
   118|    });
   119|  } catch (err) {
   120|    console.error('Error dismissing item:', err);
   121|    res.status(500).json({ ok: false, error: 'Internal server error' });
   122|  }
   123|});
   124|
   125|/**
   126| * POST /api/v2/recommendations/:user/request
   127| * Request an item to be added (Overseerr integration placeholder).
   128| */
   129|app.post('/api/v2/recommendations/:user/request', (req, res) => {
   130|  const { user } = req.params;
   131|  const { tmdb_id, media_type } = req.body;
   132|
   133|  // Validate user exists
   134|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
   135|  if (!userRow) {
   136|    return res.status(404).json({ ok: false, error: 'User not found' });
   137|  }
   138|
   139|  if (!tmdb_id || !media_type) {
   140|    return res.status(400).json({ ok: false, error: 'tmdb_id and media_type required' });
   141|  }
   142|
   143|  // For now, just acknowledge
   144|  console.log(`[Request] User ${user} requested ${media_type} ${tmdb_id}`);
   145|  res.status(201).json({
   146|    ok: true,
   147|    message: 'Request noted (Overseerr integration coming soon)'
   148|  });
   149|});
   150|
   151|/**
   152| * GET /api/v2/recommendations/:user/profile
   153| * Get user's taste profile.
   154| */
   155|app.get('/api/v2/recommendations/:user/profile', (req, res) => {
   156|  const { user } = req.params;
   157|
   158|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
   159|  if (!userRow) {
   160|    return res.status(404).json({ ok: false, error: 'User not found' });
   161|  }
   162|
   163|  const profileRow = db.prepare('SELECT genre_weights_json, keyword_weights_json FROM taste_profiles WHERE user_id = ?').get(userRow.id);
   164|  const tasteProfile = {
   165|    genres: profileRow ? JSON.parse(profileRow.genre_weights_json) : {},
   166|    keywords: profileRow ? JSON.parse(profileRow.keyword_weights_json) : {}
   167|  };
   168|  res.json({ ok: true, profile: tasteProfile });
   169|});
   170|
   171|/**
   172| * GET /api/v2/recommendations/:user/:category
   173| * Get paginated recommendations for a category.
   174| */
   175|app.get('/api/v2/recommendations/:user/:category', (req, res) => {
   176|  const { user, category } = req.params;
   177|  const page = parseInt(req.query.page) || 1;
   178|  const limit = parseInt(req.query.limit) || 20;
   179|  const offset = (page - 1) * limit;
   180|
   181|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
   182|  if (!userRow) {
   183|    return res.status(404).json({ ok: false, error: 'User not found' });
   184|  }
   185|  const userId = userRow.id;
   186|
   187|  // Load taste profile (genres + keywords)
   188|  const profileRow = db.prepare('SELECT genre_weights_json, keyword_weights_json FROM taste_profiles WHERE user_id = ?').get(userId);
   189|  const tasteProfile = {
   190|    genres: profileRow ? JSON.parse(profileRow.genre_weights_json) : {},
   191|    keywords: profileRow ? JSON.parse(profileRow.keyword_weights_json) : {}
   192|  };
   193|
   194|  // Load candidates (items not in watch_history or dismissed_items)
   195|  const watched = getWatchedItems(userId);
   196|  const dismissed = getDismissedItems(userId);
   197|  const excluded = new Set([...watched, ...dismissed]);
   198|
   199|  // Get all items
   200|  const allItems = db.prepare('SELECT id FROM items').all().map(r => r.id);
   201|  const candidates = allItems.filter(id => !excluded.has(id));
   202|
   203|  // Score and sort
   204|  const scored = scoreCandidates(userId, candidates, tasteProfile);
   205|
   206|  // Filter by category if needed
   207|  let filtered = scored;
   208|  if (category !== 'for_you') {
   209|    const catMap = {
   210|      movies: 'movie',
   211|      tv: 'tv',
   212|      anime: 'anime',
   213|      trending: 'trending',
   214|      hidden_gems: 'hidden_gem'
   215|    };
   216|    const mediaType = catMap[category];
   217|    if (mediaType) {
   218|      filtered = scored.filter(s => {
   219|        const item = db.prepare('SELECT media_type FROM items WHERE id = ?').get(s.item_id);
   220|        return item && item.media_type === mediaType;
   221|      });
   222|    }
   223|  }
   224|
   225|  // Paginate
   226|  const pageItems = filtered.slice(offset, offset + limit);
   227|  const total = filtered.length;
   228|
   229|  // Enrich with item details
   230|  const enriched = pageItems.map(s => {
   231|    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(s.item_id);
   232|    return {
   233|      ...item,
   234|      score: s.score,
   235|      score_breakdown: s.breakdown
   236|    };
   237|  });
   238|
   239|  res.json({
   240|    ok: true,
   241|    page,
   242|    limit,
   243|    total,
   244|    total_pages: Math.ceil(total / limit),
   245|    category,
   246|    items: enriched
   247|  });
   248|});
   249|
   250|/**
   251| * POST /api/v2/recommendations/:user/generate
   252| * Manually trigger full regeneration.
   253| */
   254|app.post('/api/v2/recommendations/:user/generate', (req, res) => {
   255|  const { user } = req.params;
   256|
   257|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
   258|  if (!userRow) {
   259|    return res.status(404).json({ ok: false, error: 'User not found' });
   260|  }
   261|
   262|  generateRecsForUser(userRow.id);
   263|  res.json({ ok: true, message: 'Recommendations regenerating...' });
   264|});
   265|
   266|/**
   267| * DELETE /api/v2/recommendations/:user
   268| * Clear cached recommendations.
   269| */
   270|app.delete('/api/v2/recommendations/:user', (req, res) => {
   271|  const { user } = req.params;
   272|
   273|  const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(user);
   274|  if (!userRow) {
   275|    return res.status(404).json({ ok: false, error: 'User not found' });
   276|  }
   277|
   278|  db.prepare('DELETE FROM recommendations WHERE user_id = ?').run(userRow.id);
   279|  res.json({ ok: true, message: 'Recommendations cleared' });
   280|});
   281|
   282|// ============ RECOMMENDATION GENERATION ============
   283|
   284|/**
   285| * Generate recommendations for a single user.
   286| * Scores all candidates, stores top N per category.
   287| * @param {number} userId
   288| */
   289|export function generateRecsForUser(userId) {
   290|  console.log(`🎬 Generating recommendations for user ${userId}...`);
   291|
   292|  // Load taste profile (genres + keywords)
   293|  const profileRow = db.prepare('SELECT genre_weights_json, keyword_weights_json FROM taste_profiles WHERE user_id = ?').get(userId);
   294|  const tasteProfile = {
   295|    genres: profileRow ? JSON.parse(profileRow.genre_weights_json) : {},
   296|    keywords: profileRow ? JSON.parse(profileRow.keyword_weights_json) : {}
   297|  };
   298|
   299|  // Get exclusions
   300|  const watched = getWatchedItems(userId);
   301|  const dismissed = getDismissedItems(userId);
   302|  const excluded = new Set([...watched, ...dismissed]);
   303|
   304|  // All candidate items
   305|  const allItems = db.prepare('SELECT id FROM items').all().map(r => r.id);
   306|  const candidates = allItems.filter(id => !excluded.has(id));
   307|
   308|  // Score all
   309|  const scored = scoreCandidates(userId, candidates, tasteProfile);
   310|  console.log(`   Scored ${scored.length} candidates`);
   311|
   312|  // Clear old recommendations
   313|  db.prepare('DELETE FROM recommendations WHERE user_id = ?').run(userId);
   314|
   315|  // Category mapping
   316|  const categories = [
   317|    { name: 'for_you', filter: () => true },
   318|    { name: 'movies', filter: (id) => getMediaType(id) === 'movie' },
   319|    { name: 'tv', filter: (id) => getMediaType(id) === 'tv' },
   320|    { name: 'anime', filter: (id) => isAnime(id) },
   321|    { name: 'trending', filter: (id) => isTrending(id) },
   322|    { name: 'hidden_gems', filter: (id) => isHiddenGem(id) }
   323|  ];
   324|
   325|  const insert = db.prepare(`
   326|    INSERT INTO recommendations (user_id, item_id, category, score, content_score, collab_score, pop_score, breakdown_json, generated_at)
   327|    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('unixepoch','now'))
   328|  `);
   329|
   330|  for (const cat of categories) {
   331|    const catItems = scored.filter(s => cat.filter(s.item_id)).slice(0, 50);
   332|    for (const item of catItems) {
   333|      insert.run(userId, item.item_id, cat.name, item.score, item.content_score, item.collab_score, item.pop_score, JSON.stringify(item.breakdown));
   334|    }
   335|  }
   336|
   337|  console.log(`✅ Stored recommendations across ${categories.length} categories`);
   338|}
   339|
   340|/**
   341| * Helper: get media type for item
   342| */
   343|function getMediaType(itemId) {
   344|  const row = db.prepare('SELECT media_type FROM items WHERE id = ?').get(itemId);
   345|  return row ? row.media_type : null;
   346|}
   347|
   348|/**
   349| * Helper: check if item is anime
   350| */
   351|function isAnime(itemId) {
   352|  const row = db.prepare('SELECT is_anime FROM items WHERE id = ?').get(itemId);
   353|  return row && row.is_anime === 1;
   354|}
   355|
   356|/**
   357| * Helper: check if item is trending (high popularity)
   358| */
   359|function isTrending(itemId) {
   360|  const row = db.prepare('SELECT popularity FROM items WHERE id = ?').get(itemId);
   361|  return row && row.popularity >= 1000;
   362|}
   363|
   364|/**
   365| * Helper: check if item is hidden gem (moderate popularity, high rating)
   366| */
   367|function isHiddenGem(itemId) {
   368|  const row = db.prepare('SELECT popularity, vote_average FROM items WHERE id = ?').get(itemId);
   369|  return row && row.popularity >= 50 && row.popularity < 500 && row.vote_average >= 7.5;
   370|}
   371|
   372|// Start server
   373|if (import.meta.url === `file://${process.argv[1]}`) {
   374|  app.listen(PORT, () => {
   375|    console.log(`🚀 Mediocre Engine running on http://localhost:${PORT}`);
   376|  });
   377|}
   378|
   379|export default app;
   380|