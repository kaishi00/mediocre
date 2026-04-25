import db from '../config.js';

console.log('🌱 Seeding sample data...');

// Check if already seeded
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount > 0) {
  console.log('✅ Database already contains data, skipping seed');
  process.exit(0);
}

// Insert sample users
const insertUser = db.prepare('INSERT INTO users (username, display_name) VALUES (?, ?)');
insertUser.run('ganyu', 'Ganyu');
insertUser.run('paimon', 'Paimon');
console.log('✅ Inserted 2 users');

// Insert sample genres (standard TMDB genre IDs)
const insertGenre = db.prepare('INSERT OR IGNORE INTO genres (tmdb_id, name) VALUES (?, ?)');
const genres = [
  [28, 'Action'],
  [12, 'Adventure'],
  [16, 'Animation'],
  [35, 'Comedy'],
  [80, 'Crime'],
  [99, 'Documentary'],
  [18, 'Drama'],
  [10751, 'Family'],
  [14, 'Fantasy'],
  [36, 'History'],
  [27, 'Horror'],
  [10402, 'Music'],
  [9648, 'Mystery'],
  [10749, 'Romance'],
  [878, 'Science Fiction'],
  [53, 'Thriller']
];
for (const [id, name] of genres) {
  insertGenre.run(id, name);
}
console.log(`✅ Inserted ${genres.length} genres`);

// Sample items (movies/TV with TMDB-style IDs)
const insertItem = db.prepare(`
  INSERT INTO items (tmdb_id, media_type, title, overview, popularity, vote_average, release_year, is_anime)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const items = [
  // Movies
  [101, 'movie', 'The Super Mario Galaxy Movie', 'Mario embarks on an intergalactic adventure.', 2500, 8.2, 2024, 0],
  [102, 'movie', 'GOAT', 'The greatest of all time story.', 1800, 7.8, 2024, 0],
  [103, 'movie', 'Project Hail Mary', 'A lone astronaut saves humanity.', 3200, 8.8, 2024, 0],
  [104, 'movie', 'Hoppers', 'A comedy about bouncing back.', 900, 6.5, 2024, 0],
  [105, 'movie', 'Dune: Part Three', 'The saga continues.', 4500, 8.5, 2025, 0],
  [106, 'movie', 'Avengers: Secret Wars', 'Earth's mightiest heroes assemble.', 5200, 8.1, 2025, 0],
  [107, 'movie', 'Spirited Away Remake', 'A magical journey reimagined.', 3800, 8.7, 2024, 0],
  [108, 'movie', 'Oppenheimer 2', 'The story continues.', 2900, 7.9, 2025, 0],
  [109, 'movie', 'Blade Runner 2099', 'Neo-noir sci-fi sequel.', 2100, 8.0, 2024, 0],
  [110, 'movie', 'The Batman Returns', 'Dark knight rises again.', 4100, 8.3, 2024, 0],
  // TV Shows
  [201, 'tv', 'Solo Leveling', 'The weakest hunter becomes the strongest.', 3500, 9.1, 2024, 1],
  [202, 'tv', 'Frieren: Beyond Journey\'s End', 'An elf\'s reflective journey.', 2800, 9.3, 2023, 1],
  [203, 'tv', 'Jujutsu Kaisen Season 3', 'Cursed battles intensify.', 3200, 8.9, 2024, 1],
  [204, 'tv', 'Hell\'s Paradise', 'Ninjas on a death island.', 2600, 8.7, 2023, 1],
  [205, 'tv', 'Avatar Aang: The Last Airbender', 'Live-action adaptation.', 3100, 8.4, 2024, 0],
  [206, 'tv', 'House of the Dragon S2', 'The dance of dragons.', 4800, 8.6, 2024, 0],
  [207, 'tv', 'The Last of Us S2', 'Post-apocalyptic drama.', 5200, 9.0, 2024, 0],
  [208, 'tv', 'Stranger Things S5', 'Final season arrives.', 4600, 8.8, 2025, 0],
  [209, 'tv', 'Arcane S2', 'Piltover and Zaun return.', 3900, 9.4, 2024, 0],
  [210, 'tv', 'The Mandalorian S4', 'Din Djarin\'s final chapter.', 4200, 8.5, 2024, 0],
];

for (const item of items) {
  const [tmdbId, mediaType, title, overview, pop, vote, year, isAnime] = item;
  insertItem.run(tmdbId, mediaType, title, overview, pop, vote, year, isAnime);
}
console.log(`✅ Inserted ${items.length} items`);

// Assign genres to items
const insertItemGenre = db.prepare('INSERT INTO item_genres (item_id, genre_id) VALUES (?, ?)');
const itemGenres = [
  // Mario - Animation, Action, Adventure, Comedy
  [1, 16], [1, 28], [1, 12], [1, 35],
  // GOAT - Action, Comedy
  [2, 28], [2, 35],
  // Hail Mary - Sci-Fi, Drama
  [3, 878], [3, 18],
  // Hoppers - Comedy
  [4, 35],
  // Dune - Sci-Fi, Adventure
  [5, 878], [5, 12],
  // Avengers - Action, Sci-Fi
  [6, 28], [6, 878],
  // Spirited Away - Animation, Fantasy
  [7, 16], [7, 14],
  // Oppenheimer 2 - Drama, History
  [8, 18], [8, 36],
  // Blade Runner - Sci-Fi, Thriller
  [9, 878], [9, 53],
  // Batman - Action, Crime, Thriller
  [10, 28], [10, 80], [10, 53],
  // Solo Leveling - Anime, Action, Adventure
  [11, 16], [11, 28], [11, 12],
  // Frieren - Anime, Adventure, Fantasy
  [12, 16], [12, 12], [12, 14],
  // JJK - Anime, Action, Horror
  [13, 16], [13, 28], [13, 27],
  // Hell's Paradise - Anime, Action, Horror
  [14, 16], [14, 28], [14, 27],
  // Avatar - Adventure, Fantasy, Family
  [15, 12], [15, 14], [15, 10751],
  // House of Dragon - Fantasy, Drama, Action
  [16, 14], [16, 18], [16, 28],
  // Last of Us - Drama, Thriller, Adventure
  [17, 18], [17, 53], [17, 12],
  // Stranger Things - Sci-Fi, Horror, Mystery
  [18, 878], [18, 27], [18, 9648],
  // Arcane - Animation, Action, Sci-Fi
  [19, 16], [19, 28], [19, 878],
  // Mandalorian - Sci-Fi, Adventure, Action
  [20, 878], [20, 12], [20, 28],
];

for (const [itemId, genreId] of itemGenres) {
  insertItemGenre.run(itemId, genreId);
}
console.log(`✅ Assigned ${itemGenres.length} genre relationships`);

// Sample watch history for ganyu (user_id 1)
const insertWatch = db.prepare(`
  INSERT INTO watch_history (user_id, item_id, media_type, title, watched_at, source, rating)
  VALUES (?, ?, ?, ?, datetime('unixepoch','now'), 'plex', ?)
`);
const watchHistory = [
  [1, 1, 'movie', 'The Super Mario Galaxy Movie', 9],
  [1, 2, 'movie', 'GOAT', 8],
  [1, 3, 'movie', 'Project Hail Mary', 10],
  [1, 5, 'movie', 'Dune: Part Three', 9],
  [1, 10, 'movie', 'The Batman Returns', 7],
  [1, 11, 'tv', 'Solo Leveling', 9],
  [1, 12, 'tv', 'Frieren: Beyond Journey\'s End', 10],
  [1, 15, 'tv', 'Avatar Aang: The Last Airbender', 8],
  [1, 19, 'tv', 'Arcane S2', 10],
  [1, 20, 'tv', 'The Mandalorian S4', 6],
];
for (const wh of watchHistory) {
  insertWatch.run(...wh);
}
console.log(`✅ Added ${watchHistory.length} watch history entries for ganyu`);

// Sample watch history for paimon (user_id 2)
const paimonWatch = [
  [2, 4, 'movie', 'Hoppers', 7],
  [2, 7, 'movie', 'Spirited Away Remake', 10],
  [2, 13, 'tv', 'Jujutsu Kaisen Season 3', 9],
  [2, 14, 'tv', 'Hell\'s Paradise', 8],
];
for (const wh of paimonWatch) {
  insertWatch.run(...wh);
}
console.log(`✅ Added ${paimonWatch.length} watch history entries for paimon`);

// Build initial taste profiles
const buildProfile = require('./services/recommender.js').buildTasteProfile;
const { rebuildProfile } = require('./services/recommender.js');

rebuildProfile(1, null);
rebuildProfile(2, null);
console.log('✅ Built initial taste profiles');

console.log('🎉 Seed complete! Database ready.');
