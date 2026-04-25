# 🎬 Mediocre Recommendation Engine

> **Self-hosted, open-source recommendation system** — faster than Trakt/AniList, cross-domain (anime/TV/movie), fully user-controlled.

**Repository:** `/root/projects/mediocre/` on `your-server-ip`
**Database:** SQLite at `./data/mediocre.db` (WAL mode, 64MB cache)
**Stack:** Node.js + Express + better-sqlite3 + TMDB API
**Status:** 🔧 **Active Development — Phase 4 COMPLETE ✅**

---

## Architecture Overview

### 3-Layer Ensemble Algorithm (IMPLEMENTED)

| Layer | What it does | Weight | Status |
|-------|-------------|--------|--------|
| **Content Filtering** | Genre/keyword/taste profile matching with recency weighting | 50% | ✅ Built |
| **Collaborative Filtering** | Jaccard user similarity from watch history overlap | 30% | ✅ Built (multi-user) |
| **Popularity/Recency** | TMDB popularity log-norm × release year decay | 20% | ✅ Built |

### Performance Strategy
- All scoring **pre-computed in background jobs** / on-demand via API
- User requests served from **SQLite cache** (**<50ms response —实测 18-40ms**)
- No external API calls on the hot path
- Full score breakdowns persisted per recommendation (transparency/debuggable)

---

## Project Status

### ✅ Phase 1: Project Scaffolding — COMPLETE
- 23-table SQLite schema (migration-based)
- Express server skeleton with health check
- Dotenv configuration
- WAL mode, FK constraints, FTS5 full-text search

### ✅ Phase 2: TMDB Catalog Pipeline — COMPLETE
- **206 items synced** (107 movies, 99 TV, 27 anime auto-detected)
- **487 genre assignments** across 15 categories
- Disk-cached TMDB API client with rate limiting
- Anime detection heuristic (genre 16 + JA/KO/ZH origin + keywords)
- Title resolver with 5-stage fuzzy matching
- Backfill job for stub enrichment

### ✅ Phase 3: Plex Integration — COMPLETE
- **86 watch events imported** for Ganyu (85/86 auto-matched to TMDB)
- Full OAuth PIN flow (no hardcoded tokens)
- Multi-user support (`--user`, `--all` flags)
- XML-first parsing (Plex lies about content-type)
- Per-library history scan strategy (Plex 1.43+ compatible)
- Auto-create missing items + backfill on import
- **Plex Server:** Avalon at `http://your-plex-server:32400`

### ✅ Phase 4: Recommendation Scoring Engine — COMPLETE 🎭

#### Files Built

| File | Lines | Purpose |
|------|-------|---------|
| `server/lib/scoring.js` | 322 | Core 3-layer algorithm (taste profile, content/collab/pop scoring, ensemble) |
| `server/services/recommender.js` | 400 | Orchestrator: data loading → profiling → scoring → categorizing → persisting |
| `server/jobs/generateRecs.js` | 170 | CLI entrypoint (`--user`, `--dry-run`, `--json`) |
| `server/routes/recommendations.js` | 172 | 5 REST endpoints with pagination & breakdowns |

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/recommendations/:user` | Paginated recommendations (default: for_you category) |
| GET | `/api/v2/recommendations/:user/:category` | Category-filtered (movies/tv/anime/trending/hidden_gems) |
| POST | `/api/v2/recommendations/:user/generate` | Trigger full regeneration |
| GET | `/api/v2/recommendations/:user/profile` | Taste profile with genre breakdown |
| DELETE | `/api/v2/recommendations/:user` | Clear cached recommendations |

#### Live Results (Ganyu)

```
Taste Profile:
  Items Watched:    86
  Unique Genres:    16
  Anime Affinity:   5%
  Movie/TV Split:   77% / 23%
  Top Genres:       Animation(100) → Action(72) → Comedy(68) → Adventure(61) → Drama(61)

Scoring Performance:
  Candidates Scored: 124
  Generation Time:   18-40ms ⚡
  Recommendations:    173 stored (6 categories)
  Top Score:          0.5202
  Average Score:      0.362

Top 5 For You:
  1. The Super Mario Galaxy Movie  (0.52) — Animation/Action perfect match
  2. GOAT                           (0.51) — Action/Comedy
  3. Avatar Aang: The Last Airbender (0.49) — Animation/Fantasy
  4. Hoppers                        (0.48) — Comedy
  5. Project Hail Mary              (0.47) — Sci-Fi/Drama

Top Anime:
  → Solo Leveling • Girlfriend Girlfriend • Frieren • JUJUTSU KAISEN • Hell's Paradise
```

---

### 🔄 NEXT UP

#### Phase 5: Web Frontend
- React SPA consuming `/api/v2/recommendations/*` endpoints
- "For You" tab with category navigation
- Recommendation cards with score breakdown tooltips
- Preference controls (genre weights, obscurity slider, domain mix)
- Dismissal flow ("not interested" / "already watched")

#### Phase 6: Multi-User Expansion
- Import Ariel & Giselle's watch history from Plex
- Enable collaborative filtering between family members
- Per-user preference tuning
- Family-friendly content filtering for kids' profiles

#### Phase 7: Automation
- Nightly cron job to regenerate recommendations
- Webhook on Plex watch event → incremental profile update
- TMDB catalog sync scheduler (weekly)

---

## Data Sources (Tiered Importers)

| Tier | Source | Type | Status |
|------|--------|------|--------|
| 1 | Plex API (OAuth PIN flow) | Auto, real-time | ✅ **COMPLETE** |
| 2 | Netflix CSV export | Manual upload | ⏳ Planned |
| 2 | Disney+ export | Manual upload | ⏳ Planned |
| 2 | Trakt history dump | Manual upload | ⏳ Planned |
| 2 | AniList/MAL export | Manual upload | ⏳ Planned |

---

## Environment (.env)
```
TMDB_API_KEY=346d58...3023  ✅ Active
PLEX_TOKEN=(OAuth)           ✅ Active (Ganyu account)
```

---

## Bugs Fixed This Session
1. **config.js dotenv path** — `../../.env` → `../.env`
2. **TMDB TV field names** — TV uses `name`/`original_name`, movies use `title`
3. **Plex `/status/history` removed** — switched to per-library scan strategy
4. **Plex header vs URL params** — X-Plex-* headers must be HTTP headers, not query params
5. **Plex `format=json` returns empty** — XML-only response despite JSON content-type header
6. **XML parser regex** — `[\\s\\S]*?` fails in write pipeline; use `[^]*?`
7. **TitleResolver call signature** — pass `{title, media_type}` object, not string
8. **findOrCreateItemId lookup-only** — fixed to actually create stub items
9. **Variable scope** — `plexUser` → `dbUserId` in importHistoryForUser
10. **User lookup case sensitivity** — added `COLLATE NOCASE`
11. **Table name mismatch** — `watch_history` not `user_events`
12. **Route ordering** — `/:user/profile` must precede `/:user/:category`
13. **SQL `OFFSET?` typo** — missing space caused all rows to return rank=1

---

## Key Technical Decisions
- **SQLite over PostgreSQL**: Single-user instance, simpler ops, still fast with WAL
- **Disk cache over Redis**: Avoids infra dependency, JSON files fine for TMDB rate limits
- **Pre-computed scores over real-time**: **18-40ms实测** vs 5-30s API-chaining
- **better-sqlite3 over sequelize**: Synchronous API, no ORM bloat, full SQL control
- **ESM imports only**: Modern Node.js, clean dependency tree
- **Plex OAuth PIN flow**: Official auth, no hardcoded credentials
- **XML-first parsing**: Plex API lies about content-type; custom parser handles both
- **Taste profile recency weighting**: Linear decay over 365 days, completed = 1.5x weight
- **Genre normalization**: Scores normalized 0-1 before ensemble combination
