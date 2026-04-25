# 😐 Mediocre

> **A self-hosted media recommendation engine. It's not bad, it's just... mediocre.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mediocre is a fast, self-hosted recommendation system that learns what you like from your watch history and suggests what to watch next. Cross-domain (movies, TV, anime), served from SQLite in **under 50ms**.

## Why "Mediocre"?

Because every recommendation app promises to change your life. This one just gives you solid suggestions and gets out of your way. No gamification, no social feeds, no dark patterns. Just... adequate recommendations. 😐

## What It Actually Does

- **Learns your taste** from watch history + explicit ratings (1–10)
- **3-Layer Ensemble Scoring Engine:**
  - **Content Filtering (50%)** — Genre & keyword matching weighted by your ratings
  - **Collaborative Filtering (30%)** — User similarity from watch history overlap
  - **Popularity/Recency (20%)** — TMDB popularity × release year decay
- **Keyword-aware recommendations** — Syncs TMDB keywords for finer-grained taste profiles
- **Feedback loop** — Dismiss items you don't want, rate what you've watched, profile rebuilds instantly
- **Auto-detects anime** — Genre heuristics + origin language detection
- **Fuzzy title matching** — Levenshtein distance resolver for catalog mapping
- **Rich web UI** — 6 tabs (For You, Movies, TV, Anime, Trending, Hidden Gems), themable accents, localStorage persistence
- **Import from anywhere:**
  - **Plex** — Watch history import with library scanning
  - **AniList** — Anime list sync (improves anime recommendations significantly)
  - **Trakt** — Movie/TV watch history & ratings sync
- **Overseerr/Seerr integration** — Request media directly to your Overseerr or Seerr instance from Mediocre's UI

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express (ESM) |
| Database | SQLite via `better-sqlite3` (WAL mode, 64MB cache) |
| Frontend | React 18 + Vite |
| Catalog | TMDB API (synced locally, no API calls on hot path) |
| Media Server | **Plex** (Jellyfin not supported — I don't run one to test it) |
| External Lists | AniList API, Trakt API |
| Request Proxying | Overseerr / Seerr API |

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
- (Optional) [AniList](https://anilist.co/) account for anime sync
- (Optional) [Trakt](https://trakt.tv/) account for watch history import
- (Optional) [Overseerr](https://overseerr.dev/) or [Seerr](https://seerr.dev/) instance for requesting

### Install

```bash
git clone https://github.com/kaishi00/mediocre.git
cd mediocre

# Server
cd server
npm install
cp ../.env.example .env   # Edit with your keys & URLs
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
# Required
TMDB_API_KEY=your_tmdb_key_here
PLEX_URL=http://localhost:32400
PLEX_TOKEN=your_plex_token_here

# Optional - external list imports
ANILIST_TOKEN=your_anilist_token
TRAKT_CLIENT_ID=your_trakt_client_id
TRAKT_CLIENT_SECRET=your_trakt_client_secret
TRAKT_ACCESS_TOKEN=your_trakt_access_token

# Optional - Overseerr/Seerr request proxy
OVERSEERR_URL=https://overseerr.example.com
OVERSEERR_API_KEY=your_overseerr_key
SEERR_URL=https://seerr.example.com
SEERR_API_KEY=your_seerr_key

# Optional
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
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Plex    │  │ AniList  │  │  Trakt   │
│  Server  │  │          │  │          │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │              │
     ▼              ▼              ▼
┌─────────────────────────────────────┐
│           Import / Sync Jobs        │
│  (plexImport, anilistSync, trakt)  │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐     ┌──────────────┐
│           SQLite DB                  │     │  TMDB API    │
│  (catalog, history, ratings, taste) │◀────│  (metadata +  │
│                                      │     │   keywords)  │
└──────────────────┬───────────────────┘     └──────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  Scoring Engine  │
         │  (3-layer       │
         │   ensemble)      │
         └────────┬────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌─────────────┐
│  API    │ │Request  │ │  React UI   │
│ Routes  │ │Proxy    │ │(6 tabs,     │
│         │ │→Overseerr│ │ themes)     │
└─────────┘ └─────────┘ └─────────────┘
```

### Database Schema (key tables)

- `items` — TMDB catalog (movie/tv/anime) with popularity scores
- `watch_history` — What you watched, with ratings
- `user_ratings` — Explicit 1–10 ratings (overrides watch history rating)
- `dismissed_items` — Items you rejected (with TTL)
- `taste_profiles` — Pre-computed genre + keyword weights
- `genres` / `keywords` / `item_genres` / `item_keywords` — Taxonomy

## Recommendation Engine Settings

All configuration is done from the **Settings → Recommendations** panel in the UI — no config files to edit for tuning.

### Catalogue & Scoring

| Setting | Options | Default |
|---------|---------|---------|
| **Catalogue Size** | Lean (~500) · Standard (~1000) · Generous (~2000) | Standard |
| **Max Items** | Number of top results per scoring pass | 100+ |

### Taste Profile Filters

Narrow recommendations by **themes** (genres) and **languages**. Select multiple to build your taste profile — the engine weights matches against your selected preferences.

**Supported themes:** Anime, Animation, Comedy, Crime, Documentary, Drama, Adventure, Fantasy, Horror, Kids, Music, Mystery, Romance, Science Fiction, TV Movie, Thriller, Western

**Supported languages:** English, Japanese, Korean, Chinese, Cantonese, French, Spanish, German, Italian, Portuguese, Czech, Swedish, Danish, Polish, Norwegian, Icelandic, Gaelic, Hindi, Thai

### Results Distribution

Control how many items appear in each tab via **Results Per Tab**:

| Tab | Default | Description |
|-----|---------|-------------|
| **For You** | 50 | Personalized ensemble-scored recommendations |
| **Movies** | 50 | Top scored films |
| **TV Shows** | 50 | Top scored series |
| **Anime Movies** | 100 | Top scored anime films (higher default — catalogue is smaller) |
| **Anime Series** | 100 | Top scored anime series (higher default — catalogue is smaller) |
| **Trending** | 50 | TMDB popularity-sorted fresh picks |
| **Hidden Gems** | 50 | Lower-popularity high-scored discoveries |

### Type Balance

**Type Ratio** slider balances movie vs. TV show results across all tabs. Drag to favor one format over the other based on your viewing habits.

### Sync

The **Sync ID** tracks your last full profile rebuild. Re-sync anytime after importing new watch history or changing ratings — the engine rebuilds your taste profile from scratch using all available data.

## Development Status

**Phase 4 COMPLETE ✅**

- [x] Project scaffolding (23-table schema, Express, migrations)
- [x] TMDB catalog pipeline (200+ items, genre assignments, disk-cached API client)
- [x] Scoring engine (3-layer ensemble with rating weights)
- [x] Feedback system (dismissals, explicit ratings, profile rebuild)
- [x] Keyword sync & keyword-weighted scoring
- [x] Fuzzy title resolver (catalog matching)
- [x] Plex + AniList + Trakt import/sync
- [x] Overseerr/Seerr request integration
- [x] Rich frontend (6 tabs, themes, responsive)

## License

MIT. Do whatever you want with it. It's just mediocre code anyway.

---

*Built with mild frustration at existing recommendation systems that over-promise and under-deliver.*
