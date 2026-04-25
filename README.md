# 😐 Mediocre

<p align="center">
  <strong>A self-hosted media recommendation engine.</strong><br>
  <em>It's not bad. It's just... mediocre.</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Features

- **🎬 Cross-Domain Recommendations** — Anime, TV, and movies all in one feed, with intelligent bridging between domains
- **⚡ Blazing Fast** — Pre-computed scores served from SQLite (<50ms response times)
- **🎛️ User Controls** — Genre filters, obscurity slider (mainstream ↔ hidden gems), domain mixer
- **🔍 Score Transparency** — Every recommendation shows *why* it was recommended
- **🧊 Cold-Start Ready** — Works even with zero watch history using content-based analysis
- **📦 Self-Contained** — No Trakt/AniList dependency. Just Plex/Jellyfin + TMDB
- **🔓 Open Source** — MIT licensed, community bridge mappings via PRs

## Quick Start

### Prerequisites

- Node.js ≥ 18
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free)
- A Plex or Jellyfin server (optional, for watch history import)

### Install

```bash
git clone https://github.com/mediocre-rec/mediocre.git
cd mediocre

# Server
cd server
npm install
cp ../.env.example .env   # Edit with your TMDB API key
npm start

# Client (separate terminal)
cd client
npm install
npm run dev
```

Then open http://localhost:5173 (client dev server proxies to backend at :3000).

### Docker (coming soon)

```bash
# docker-compose.yml — coming in v1.1
```

## Architecture

### 3-Layer Ensemble Algorithm

| Layer | What it does | Weight |
|-------|-------------|--------|
| **Content Filtering** | Genre/keyword/taste profile matching with recency weighting | 50% |
| **Collaborative Filtering** | Jaccard user similarity from watch history overlap | 30% |
| **Popularity/Recency** | TMDB popularity log-norm × release year decay | 20% |

### Performance Strategy

- All scoring **pre-computed** in background jobs / on-demand via API
- User requests served from **SQLite cache** (<50ms response)
- No external API calls on the hot path
- Full score breakdowns persisted per recommendation

## Configuration

All config via environment variables (see [`.env.example`](/.env.example)):

| Variable | Required | Description |
|----------|----------|-------------|
| `TMDB_API_KEY` | ✅ | Your TMDB API key |
| `DB_PATH` | ❌ | Path to SQLite database (`./data/mediocre.db`) |
| `PLEX_URL` | ❌ | Plex server URL (for history import) |
| `PLEX_TOKEN` | ❌ | Plex access token (for history import) |
| `PORT` | ❌ | Server port (`3000`) |

## User Controls

Mediocre puts your users in charge of what they see:

- **Genre Filter** — Multi-select genres to boost or hard-exclude
- **Obscurity Slider** — Mainstream hits ↔ hidden gems
- **Domain Mixer** — Balance anime / TV / movie recommendations
- **Score Breakdown** — See exactly why each item was recommended

## Project Status

**v1.0 — MVP Complete ✅**

- [x] SQLite database schema with full-text search
- [x] TMDB metadata caching & sync
- [x] Content-based scoring engine (Layer 1)
- [x] Collaborative filtering from watch history (Layer 2)
- [x] Popularity/recency scoring (Layer 3)
- [x] REST API with <50ms response times
- [x] React frontend (Vite)
- [x] Plex watch history import
- [x] User controls (genre filter, obscurity slider)

**Roadmap:**

- [ ] Docker Compose deployment
- [ ] Jellyfin support
- [ ] Cross-domain bridge (anime ↔ live-action mappings)
- [ ] Trakt/AniList one-time import
- [ ] Evaluation framework (precision@K testing)
- [ ] Multi-user support UI

## Tech Stack

**Backend:** Node.js · Express · better-sqlite3 · TMDB API  
**Frontend:** React 18 · Vite · Pure CSS  
**Database:** SQLite (WAL mode, FTS5)

## Contributing

PRs welcome! The best places to contribute:

1. **Bridge Mappings** — Add anime↕live-action connections to help cross-domain recs
2. **Genre/Keyword Tuning** — Improve content classification weights
3. **Docker Support** — Help us ship a `docker-compose.yml`
4. **Jellyfin Integration** — Expand beyond Plex

See [`docs/IDEA.md`](docs/IDEA.md) for the full design document and algorithm specification.

## License

[MIT](LICENSE) — Do whatever you want with it. It's mediocre, after all.

---

<p align="center">
  <sub>Made with 👀 by people who couldn't decide what to watch next.</sub>
</p>
