# 😐 Mediocre

> **A self-hosted media recommendation engine. It's not bad, it's just... mediocre.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mediocre is a fast, self-hosted recommendation system that learns what you like from your Plex watch history and suggests what to watch next. Cross-domain (movies, TV, anime), multi-user, and served from SQLite in **under 50ms**.

## Why "Mediocre"?

Because every recommendation app promises to change your life. This one just gives you solid suggestions and gets out of your way. No gamification, no social feeds, no dark patterns. Just... adequate recommendations. 😐

## What It Actually Does

- **Learns your taste** from Plex watch history + explicit ratings (1–10)
- **3-Layer Ensemble Scoring Engine:**
  - **Content Filtering (50%)** — Genre & keyword matching weighted by your ratings
  - **Collaborative Filtering (30%)** — Jaccard similarity between users' watch histories
  - **Popularity/Recency (20%)** — TMDB popularity × release year decay
- **Keyword-aware recommendations** — Syncs TMDB keywords for finer-grained taste profiles
- **Feedback loop** — Dismiss items you don't want, rate what you've watched, profile rebuilds instantly
- **Auto-detects anime** — Genre heuristics + origin language detection
- **Fuzzy title matching** — Levenshtein distance resolver for Plex → TMDB catalog mapping
- **Rich web UI** — 6 tabs (For You, Movies, TV, Anime, Trending, Hidden Gems), themable accents, localStorage persistence
- **Multi-user support** — Each user gets their own taste profile and recommendations

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express (ESM) |
| Database | SQLite via `better-sqlite3` (WAL mode, 64MB cache) |
| Frontend | React 18 + Vite |
| Catalog | TMDB API (synced locally, no API calls on hot path) |
| Media Server | **Plex** (Jellyfin not supported — I don't run one to test it) |

## Performance

All scoring is pre-computed or cached in SQLite. User requests never hit external APIs:

- **Response time:** <50ms (measured 18–40ms on test hardware)
- **Full-text search:** FTS5 enabled
- **Schema:** 23+ tables with migration system

## Quick Start

### Prerequisites

- Node.js ≥18
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free)
- A [Plex server](https://www.plex.tv/) with content

### Install

```bash
git clone https://github.com/kaishi00/mediocre.git
cd mediocre

# Server
cd server
npm install
cp ../.env.example .env   # Edit with your TMDB key & Plex URL
npm run migrate            # Run schema + feedback migrations
node index.js &            # Starts on port 3000

# Client (separate terminal)
cd ../client
npm install
npm run dev                # Starts dev server with API proxy
```

Open http://localhost:5173 and enjoy your adequately personalized recommendations.

### Configuration (.env)

```env
TMDB_API_KEY=your_tmdb_key_here
PLEX_URL=http://localhost:32400
PLEX_TOKEN=your_plex_token_here
PORT=3000
DB_PATH=./data/seerr.db
```

### Background Jobs

```bash
# Import watched items from Plex
node server/jobs/plexImport.js

# Sync movie/TV metadata from TMDB
node server/jobs/tmdbSync.js

# Pull keywords from TMDB for all catalog items (enables keyword-weighted scoring)
node server/jobs/tmdbKeywordSync.js
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────┐
│   Plex      │────▶│  Import Job  │────▶│  DB   │
│   Server    │     │              │     │       │
└─────────────┘     └──────────────┘     │       │
                                          │ SQLite│
┌─────────────┐     ┌──────────────┐     │       │
│   TMDB API  │────▶│  Sync Jobs   │────▶│       │
│             │     │ (metadata +  │     │       │
│             │     │  keywords)   │     │       │
└─────────────┘     └──────────────┘     └──┬────┘
                                               │
┌─────────────┐     ┌──────────────┐          ▼
│   React UI  │◀────│  API Routes  │◀──── Scoring Engine
│  (Vite dev) │     │  /api/v2/... │    (3-layer ensemble)
└─────────────┘     └──────────────┘
```

### Database Schema (key tables)

- `users` — User accounts
- `items` — TMDB catalog (movie/tv/anime) with popularity scores
- `watch_history` — What each user watched, with ratings
- `user_ratings` — Explicit 1–10 ratings (overrides watch history rating)
- `dismissed_items` — Items user rejected (with TTL)
- `taste_profiles` — Pre-computed genre + keyword weights per user
- `genres` / `keywords` / `item_genres` / `item_keywords` — Taxonomy

## Development Status

**Phase 4 COMPLETE ✅**

- [x] Project scaffolding (23-table schema, Express, migrations)
- [x] TMDB catalog pipeline (206+ items, genre assignments, disk-cached API client)
- [x] Scoring engine (3-layer ensemble with rating weights)
- [x] Feedback system (dismissals, explicit ratings, profile rebuild)
- [x] Keyword sync & keyword-weighted scoring
- [x] Fuzzy title resolver (Plex → TMDB mapping)
- [x] Multi-user collaborative filtering
- [x] Rich frontend (6 tabs, themes, responsive)

## License

MIT. Do whatever you want with it. It's just mediocre code anyway.

---

*Built with mild frustration at existing recommendation systems that over-promise and under-deliver.*
