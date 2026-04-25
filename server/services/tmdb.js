import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';

if (!TMDB_API_KEY) {
  console.error('❌ TMDB_API_KEY not set in environment');
  process.exit(1);
}

// Simple disk cache setup
const cacheDir = join(__dirname, '..', 'data', 'tmdb_cache');
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

/**
 * Get cache file path for a query key
 */
function getCachePath(key) {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(cacheDir, `${safeKey}.json`);
}

/**
 * Fetch with simple disk cache
 */
async function cachedFetch(url, params = {}) {
  const paramStr = new URLSearchParams(params).toString();
  const fullUrl = `${url}?${paramStr}`;
  const cacheKey = `${url}-${paramStr}`;
  const cachePath = getCachePath(cacheKey);

  // Check cache
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
      return cached;
    } catch (e) {
      // Cache corrupt, ignore and re-fetch
    }
  }

  // Fetch from API
  const res = await fetch(fullUrl);
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  // Write cache
  try {
    writeFileSync(cachePath, JSON.stringify(data, null, 2));
  } catch (e) {
    // Ignore cache write errors
  }

  return data;
}

/**
 * Rate-limited fetch wrapper (350ms between calls)
 */
let lastFetchTime = 0;
async function rateLimitedFetch(url, params = {}) {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  const delay = Math.max(0, 350 - elapsed);
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastFetchTime = Date.now();
  return cachedFetch(url, params);
}

/**
 * Generic GET request to TMDB API
 */
async function tmdbGet(endpoint, params = {}) {
  const url = `${TMDB_BASE_URL}${endpoint}`;
  return rateLimitedFetch(url, { ...params, api_key: TMDB_API_KEY });
}

// Exported API functions

/**
 * Get movie details by TMDB ID
 */
export async function getMovie(id) {
  return tmdbGet(`/movie/${id}`);
}

/**
 * Get TV show details by TMDB ID
 */
export async function getTvShow(id) {
  return tmdbGet(`/tv/${id}`);
}

/**
 * Search for movies/shows
 * @param {string} query - Search term
 * @param {string} [type='multi'] - 'multi', 'movie', 'tv'
 */
export async function search(query, type = 'multi') {
  return tmdbGet(`/search/${type}`, { query, include_adult: false });
}

/**
 * Get popular movies (paginated)
 */
export async function getPopularMovies(page = 1) {
  return tmdbGet('/movie/popular', { page });
}

/**
 * Get popular TV shows (paginated)
 */
export async function getPopularTvShows(page = 1) {
  return tmdbGet('/tv/popular', { page });
}

/**
 * Get genre list for movies or TV
 * @param {string} [type='movie'] - 'movie' or 'tv'
 */
export async function getGenres(type = 'movie') {
  return tmdbGet(`/genre/${type}/list`);
}
