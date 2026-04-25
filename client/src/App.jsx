import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';

// ─── Constants ───────────────────────────────────────────────────
const TABS = ['for_you', 'movies', 'tv', 'anime', 'trending', 'hidden_gems'];
const MAX_AUTO_CHAIN = 3;
const DISMISSED_TTL = 24 * 60 * 60 * 1000;

const ACCENT_HUES = { amber: 65, violet: 295, teal: 195, rose: 10, lime: 130 };
const DEFAULTS = { variant: 'bold', accent: 'amber', bg: 'ink', hover: 'panel', shelves: true, cardMin: 170 };

const API_BASE = '/api/v2/recommendations/ganyu';

// ─── Persistence utils ───────────────────────────────────────────
function loadTweaks() {
  try {
    const raw = localStorage.getItem('seerrv2_tweaks');
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...DEFAULTS }; }
}

function getDismissed(tab) {
  try {
    const raw = localStorage.getItem(`seerrv2_dismissed_${tab}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const now = Date.now();
    return new Set(parsed.filter(e => now - e.t < DISMISSED_TTL).map(e => e.id));
  } catch { return new Set(); }
}

function addDismissed(tab, id) {
  try {
    const raw = localStorage.getItem(`seerrv2_dismissed_${tab}`);
    const existing = raw ? JSON.parse(raw) : [];
    existing.push({ id, t: Date.now() });
    localStorage.setItem(`seerrv2_dismissed_${tab}`, JSON.stringify(existing));
  } catch {}
}

function getHidden(tab) {
  try {
    const raw = localStorage.getItem(`seerrv2_hidden_${tab}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function addHidden(tab, id) {
  try {
    const hidden = getHidden(tab);
    hidden.add(id);
    localStorage.setItem(`seerrv2_hidden_${tab}`, JSON.stringify([...hidden]));
  } catch {}
}

function getItemUrl(item) {
  if (item.tmdbId)
    return `https://www.themoviedb.org/${item.mediaType === 'movie' ? 'movie' : 'tv'}/${item.tmdbId}`;
  return null;
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

// ─── Icons ───────────────────────────────────────────────────────
const Icon = ({ d, size = 16, fill = false, stroke = 1.5, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d={d} />
  </svg>
);

const Icons = {
  film:     (p) => <Icon d="M4 4h16v16H4z M4 9h16 M4 15h16 M8 4v16 M16 4v16" {...p} />,
  tv:       (p) => <Icon d="M3 6h18v12H3z M8 21h8 M12 18v3" {...p} />,
  sparkle:  (p) => <Icon d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z M19 3v3 M17.5 4.5h3" {...p} />,
  refresh:  (p) => <Icon d="M3 12a9 9 0 0 1 15.3-6.3L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15.3 6.3L3 16 M3 21v-5h5" {...p} />,
  search:   (p) => <Icon d="M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-4.3-4.3" {...p} />,
  plus:     (p) => <Icon d="M12 5v14 M5 12h14" {...p} />,
  check:    (p) => <Icon d="M5 12l5 5L20 7" {...p} />,
  clock:    (p) => <Icon d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20 M12 7v5l3 3" {...p} />,
  x:        (p) => <Icon d="M6 6l12 12 M6 18L18 6" {...p} />,
  link:     (p) => <Icon d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" {...p} />,
  star:     (p) => <Icon d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z" {...p} fill />,
  chev:     (p) => <Icon d="M9 6l6 6-6 6" {...p} />,
  settings: (p) => <Icon d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...p} />,
};

// ─── Sidebar ─────────────────────────────────────────────────────
function Sidebar({ activeTab, onTab, onRefresh, counts, tweaks }) {
  return (
    <aside className="side">
      <div className="side-brand">
        <div className="side-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="12" cy="12" r="4" fill="currentColor"/>
            <circle cx="18" cy="7" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <div className="side-wordmark">
          <div className="side-word">seerr</div>
          <div className="side-sub">v2 · recommendations</div>
        </div>
      </div>

      <div className="side-group">
        <div className="side-label">Discover</div>
        <button className={`side-item ${activeTab === 'for_you' ? 'on' : ''}`} onClick={() => onTab('for_you')}>
          <Icons.sparkle size={16}/> <span>For You</span>
          <em className="side-count">{counts.for_you}</em>
        </button>
        <button className={`side-item ${activeTab === 'movies' ? 'on' : ''}`} onClick={() => onTab('movies')}>
          <Icons.film size={16}/> <span>Movies</span>
          <em className="side-count">{counts.movies}</em>
        </button>
        <button className={`side-item ${activeTab === 'tv' ? 'on' : ''}`} onClick={() => onTab('tv')}>
          <Icons.tv size={16}/> <span>TV Shows</span>
          <em className="side-count">{counts.tv}</em>
        </button>
        <button className={`side-item ${activeTab === 'anime' ? 'on' : ''}`} onClick={() => onTab('anime')}>
          <Icons.sparkle size={16}/> <span>Anime</span>
          <em className="side-count">{counts.anime}</em>
        </button>
        <button className={`side-item ${activeTab === 'trending' ? 'on' : ''}`} onClick={() => onTab('trending')}>
          <Icons.sparkle size={16}/> <span>Trending</span>
          <em className="side-count">{counts.trending}</em>
        </button>
        <button className={`side-item ${activeTab === 'hidden_gems' ? 'on' : ''}`} onClick={() => onTab('hidden_gems')}>
          <Icons.sparkle size={16}/> <span>Hidden Gems</span>
          <em className="side-count">{counts.hidden_gems}</em>
        </button>
      </div>

      <div className="side-spacer"/>

      <div className="side-foot">
        <button className="side-foot-btn" onClick={onRefresh} title="Refresh recommendations">
          <Icons.refresh size={14}/> <span>Refresh</span>
        </button>
        <div className="side-foot-user">
          <div className="side-foot-avatar">G</div>
          <div>
            <div className="side-foot-name">Ganyu</div>
            <div className="side-foot-sub">{tweaks.variant === 'bold' ? 'Bold' : 'Refined'} theme</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────
function TopBar({ activeTab, query, onQuery, density, onDensity, onOpenTweaks }) {
  const titles = { for_you: 'For You', movies: 'Movies', tv: 'TV Shows', anime: 'Anime', trending: 'Trending', hidden_gems: 'Hidden Gems' };
  const subs = {
    for_you: 'Personalized picks from the SeerrV2 recommendation engine',
    movies: 'Movie recommendations tuned to your taste profile',
    tv: 'TV show recommendations based on your viewing history',
    anime: 'Anime recommendations from the SeerrV2 engine',
    trending: 'Currently popular titles you might have missed',
    hidden_gems: 'Underrated titles that deserve your attention',
  };
  return (
    <header className="top">
      <div className="top-head">
        <div className="top-crumb">Discover <span className="top-sep">/</span> <strong>{titles[activeTab]}</strong></div>
        <h1 className="top-title">{titles[activeTab]}</h1>
        <p className="top-sub">{subs[activeTab]}</p>
      </div>
      <div className="top-actions">
        <div className="top-search">
          <Icons.search size={14}/>
          <input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Filter this list…"
          />
        </div>
        <div className="top-toggle">
          <button className={density === 'compact' ? 'on' : ''} onClick={() => onDensity('compact')} title="Compact">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="8" height="8" rx="1"/>
              <rect x="13" y="3" width="8" height="8" rx="1"/>
              <rect x="3" y="13" width="8" height="8" rx="1"/>
              <rect x="13" y="13" width="8" height="8" rx="1"/>
            </svg>
          </button>
          <button className={density === 'cozy' ? 'on' : ''} onClick={() => onDensity('cozy')} title="Cozy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="6" height="18" rx="1"/>
              <rect x="10" y="3" width="6" height="18" rx="1"/>
              <rect x="17" y="3" width="4" height="18" rx="1"/>
            </svg>
          </button>
          <button className={density === 'comfy' ? 'on' : ''} onClick={() => onDensity('comfy')} title="Comfortable">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="8" height="18" rx="1"/>
              <rect x="13" y="3" width="8" height="18" rx="1"/>
            </svg>
          </button>
        </div>
        <button className="top-icon-btn" title="Tweaks" onClick={onOpenTweaks}><Icons.settings size={16}/></button>
      </div>
    </header>
  );
}

// ─── Hero (bold variant) ─────────────────────────────────────────
function Hero({ item, onRequest, onWatched, requesting, reqSuccess }) {
  if (!item) return null;
  return (
    <div className="hero">
      {item.backdropUrl
        ? <div className="hero-bg" style={{ backgroundImage: `url("${item.backdropUrl}")` }}/>
        : <div className="hero-bg" style={{ background: `oklch(0.28 0.12 ${hashHue(item.title)})` }}/>
      }
      <div className="hero-scrim"/>
      <div className="hero-body">
        <div className="hero-eyebrow">
          <span className="hero-chip">Top pick for you</span>
          <span className="hero-dot"/>
          <span className="hero-match">via {item.source}</span>
        </div>
        <h2 className="hero-title">{item.title}</h2>
        <div className="hero-meta">
          <span>{item.year}</span>
          {item.rating > 0 && <>
            <span className="hero-dot"/>
            <span className="hero-rating"><Icons.star size={12}/> {item.rating}</span>
          </>}
          {item.score !== undefined && item.score !== null && (
            <>
              <span className="hero-dot"/>
              <span className="hero-match">{Math.round(item.score * 100)}% match</span>
            </>
          )}
          {item.genres?.length > 0 && <>
            <span className="hero-dot"/>
            <span>{item.genres.slice(0, 3).join(' · ')}</span>
          </>}
        </div>
        {item.overview && <p className="hero-overview">{item.overview}</p>}
        <div className="hero-actions">
          <button
            className="btn btn-primary btn-lg"
            disabled={requesting || reqSuccess || item.requested}
            onClick={() => onRequest(item)}
          >
            {reqSuccess ? <><Icons.check size={14}/> Requested</>
              : item.requested ? <><Icons.clock size={14}/> Pending</>
              : <><Icons.plus size={14}/> Request</>}
          </button>
          <button className="btn btn-ghost btn-lg" onClick={() => onWatched(item)}>
            <Icons.check size={14}/> Mark watched
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────
function Card({ item, onRequest, onWatched, onDismiss, onOpen, requesting, watching, dismissing, reqSuccess }) {
  const accentHue = item.accentHue ?? hashHue(item.title);
  const accent = `oklch(0.62 0.18 ${accentHue})`;
  return (
    <div
      className="card"
      style={{ '--item-accent': accent }}
      onClick={() => onOpen(item)}
    >
      <div className="card-poster">
        {item.posterUrl
          ? <img src={item.posterUrl} alt={item.title} loading="lazy"/>
          : <div className="card-poster-empty">?</div>
        }
        <div className="card-sheen"/>
      </div>

      <div className="card-foot">
        <div className="card-foot-title">{item.title}</div>
        <div className="card-foot-meta">
          <span>{item.year}</span>
          {item.rating > 0 && <>
            <span className="card-foot-sep">·</span>
            <span className="card-foot-rating"><Icons.star size={10}/> {item.rating}</span>
          </>}
          {item.score !== undefined && item.score !== null && (
            <>
              <span className="card-foot-sep">·</span>
              <span className="card-foot-rating">{Math.round(item.score * 100)}%</span>
            </>
          )}
        </div>
      </div>

      <div className={`card-source s-${item.source}`}>
        {item.source === 'seerrv2' ? 'S' : '?'}
      </div>

      {item.requested && !reqSuccess && (
        <div className="card-pill pill-pending">
          <Icons.clock size={10}/> Pending
        </div>
      )}
      {reqSuccess && (
        <div className="card-pill pill-done">
          <Icons.check size={10}/> Requested
        </div>
      )}

      <div className="card-panel">
        <div className="card-panel-inner">
          <div className="card-panel-head">
            <div className="card-panel-title">{item.title}</div>
            <div className="card-panel-meta">
              <span>{item.year}</span>
              {item.runtime && <><span>·</span><span>{item.runtime}m</span></>}
              {item.seasons && <><span>·</span><span>{item.seasons} season{item.seasons > 1 ? 's' : ''}</span></>}
              {item.episodes && <><span>·</span><span>{item.episodes} ep</span></>}
              {item.rating > 0 && <><span>·</span><span className="card-panel-rating"><Icons.star size={10}/> {item.rating}</span></>}
              {item.score !== undefined && item.score !== null && (
                <>
                  <span>·</span>
                  <span className="card-panel-rating">{Math.round(item.score * 100)}% match</span>
                </>
              )}
            </div>
          </div>
          {item.genres?.length > 0 && (
            <div className="card-panel-genres">
              {item.genres.slice(0, 3).map(g => <span key={g} className="card-panel-genre">{g}</span>)}
            </div>
          )}
          {item.overview && <p className="card-panel-overview">{item.overview}</p>}
          <div className="card-panel-source">
            <span className={`card-panel-src-badge s-${item.source}`}>{item.source}</span>
            <span>via SeerrV2 recommendation engine</span>
          </div>
          <div className="card-panel-actions">
            <button
              className="btn btn-primary btn-sm"
              disabled={requesting || reqSuccess || item.requested || !item.tmdbId}
              onClick={e => { e.stopPropagation(); onRequest(item); }}
            >
              {requesting ? '…'
                : reqSuccess ? <><Icons.check size={13}/> Requested</>
                : item.requested ? <><Icons.clock size={13}/> Pending</>
                : <><Icons.plus size={13}/> Request</>}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={watching}
              onClick={e => { e.stopPropagation(); onWatched(item); }}
              title="Mark watched"
            >
              <Icons.check size={13}/>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={dismissing}
              onClick={e => { e.stopPropagation(); onDismiss(item); }}
              title="Not interested"
            >
              <Icons.x size={13}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shelf (bold variant) ─────────────────────────────────────────
function Shelf({ title, subtitle, items, cardProps }) {
  const ref = useRef(null);
  const scroll = (dir) => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <section className="shelf">
      <div className="shelf-head">
        <div>
          <h3 className="shelf-title">{title}</h3>
          <p className="shelf-sub">{subtitle}</p>
        </div>
        <div className="shelf-nav">
          <button onClick={() => scroll(-1)}><Icons.chev size={14} style={{ transform: 'rotate(180deg)' }}/></button>
          <button onClick={() => scroll(1)}><Icons.chev size={14}/></button>
        </div>
      </div>
      <div className="shelf-track" ref={ref}>
        {items.map(item => (
          <div className="shelf-cell" key={item.id}>
            <Card
              item={item}
              onRequest={cardProps.onRequest}
              onWatched={cardProps.onWatched}
              onDismiss={cardProps.onDismiss}
              onOpen={cardProps.onOpen}
              requesting={cardProps.requesting?.[item.id]}
              watching={cardProps.watching?.[item.id]}
              dismissing={cardProps.dismissing?.[item.id]}
              reqSuccess={cardProps.reqSuccess?.[item.id]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── RatingPicker (5-star modal) ─────────────────────────────────
function RatingPicker({ item, action, onConfirm, onSkip, onCancel }) {
  const [hover, setHover] = useState(0);
  const [committed, setCommitted] = useState(0);
  const display = hover || committed;
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (val) => {
    setCommitted(val);
    setTimeout(() => onConfirm(val * 2), 150); // convert to 1–10 scale
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-eyebrow">{action === 'watched' ? 'You watched' : 'Not interested in'}</div>
        <div className="modal-title">{item.title}</div>
        <div className="modal-sub">
          {action === 'watched'
            ? 'Rate it so we can tune your recommendations'
            : 'How bad was it? (optional)'}
        </div>
        <div className="rating" onMouseLeave={() => setHover(0)}>
          {stars.map(i => {
            const leftVal = i - 0.5;
            const rightVal = i;
            const leftLit = display >= leftVal;
            const rightLit = display >= rightVal;
            return (
              <div key={i} className="rating-star-wrap">
                <div className="rating-halves">
                  <button
                    className="rating-half"
                    onMouseEnter={() => setHover(leftVal)}
                    onClick={() => handleClick(leftVal)}
                  />
                  <button
                    className="rating-half"
                    onMouseEnter={() => setHover(rightVal)}
                    onClick={() => handleClick(rightVal)}
                  />
                </div>
                <svg className="rating-glyph" viewBox="0 0 24 24" width="40" height="40" aria-hidden>
                  <defs>
                    <clipPath id={`clp-${i}`}><rect x="0" y="0" width="12" height="24"/></clipPath>
                  </defs>
                  <path className="rating-bg" d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z"/>
                  {leftLit && <path className="rating-fg" clipPath={`url(#clp-${i})`} d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z"/>}
                  {rightLit && <path className="rating-fg" d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z"/>}
                </svg>
              </div>
            );
          })}
        </div>
        <div className="rating-value">{display ? `${display.toFixed(1)} / 5` : 'Hover to rate'}</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onSkip}>Skip rating</button>
          <button className="btn btn-primary" onClick={onCancel}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── DetailDrawer ────────────────────────────────────────────────
function DetailDrawer({ item, onClose, onRequest, onWatched, onDismiss, requesting, reqSuccess }) {
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!item) return null;
  const extUrl = getItemUrl(item);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        {item.backdropUrl
          ? <div className="drawer-bg" style={{ backgroundImage: `url("${item.backdropUrl}")` }}/>
          : <div className="drawer-bg" style={{ background: `oklch(0.25 0.1 ${hashHue(item.title)})` }}/>
        }
        <div className="drawer-scrim"/>
        <button className="drawer-close" onClick={onClose}><Icons.x size={18}/></button>
        <div className="drawer-body">
          <div className="drawer-poster">
            {item.posterUrl
              ? <img src={item.posterUrl} alt=""/>
              : <div style={{ width: '100%', height: '100%', background: `oklch(0.28 0.1 ${hashHue(item.title)})` }}/>
            }
          </div>
          <div className="drawer-info">
            <div className="drawer-eyebrow">
              <span className={`card-panel-src-badge s-${item.source}`}>{item.source}</span>
              <span>Recommended for you</span>
            </div>
            <h2 className="drawer-title">{item.title}</h2>
            <div className="drawer-meta">
              <span>{item.year}</span>
              {item.runtime && <><span>·</span><span>{item.runtime} min</span></>}
              {item.seasons && <><span>·</span><span>{item.seasons} seasons</span></>}
              {item.episodes && <><span>·</span><span>{item.episodes} episodes</span></>}
              {item.rating > 0 && <><span>·</span><span className="drawer-rating"><Icons.star size={12}/> {item.rating}</span></>}
              {item.score !== undefined && item.score !== null && (
                <>
                  <span>·</span>
                  <span className="drawer-rating">{Math.round(item.score * 100)}% match</span>
                </>
              )}
            </div>
            {item.genres?.length > 0 && (
              <div className="drawer-genres">
                {item.genres.map(g => <span key={g} className="drawer-genre">{g}</span>)}
              </div>
            )}
            {item.overview && <p className="drawer-overview">{item.overview}</p>}
            {extUrl && (
              <a href={extUrl} target="_blank" rel="noopener noreferrer" className="drawer-ext-link" onClick={e => e.stopPropagation()}>
                <Icons.link size={13}/> Open on TMDb
              </a>
            )}
            <div className="drawer-actions">
              <button
                className="btn btn-primary btn-lg"
                disabled={requesting || reqSuccess || item.requested || !item.tmdbId}
                onClick={() => onRequest(item)}
              >
                {reqSuccess ? <><Icons.check size={14}/> Requested</>
                  : item.requested ? <><Icons.clock size={14}/> Pending in Overseerr</>
                  : <><Icons.plus size={14}/> Request on Overseerr</>}
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => onWatched(item)}>
                <Icons.check size={14}/> Mark watched
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => onDismiss(item)}>
                <Icons.x size={14}/> Not interested
              </button>
            </div>
            <div className="drawer-why">
              <div className="drawer-why-label">Why you're seeing this</div>
              <div className="drawer-why-reasons">
                <div className="drawer-why-row">
                  <div className="drawer-why-bullet"/>
                  <div>Recommended by the SeerrV2 recommendation engine</div>
                </div>
                {item.breakdown && (
                  <>
                    <div className="drawer-why-row">
                      <div className="drawer-why-bullet"/>
                      <div>Content matching: {Math.round((item.breakdown.content?.score || 0) * 100)}%</div>
                    </div>
                    <div className="drawer-why-row">
                      <div className="drawer-why-bullet"/>
                      <div>Collaborative filtering: {Math.round((item.breakdown.collaborative?.score || 0) * 100)}%</div>
                    </div>
                    <div className="drawer-why-row">
                      <div className="drawer-why-bullet"/>
                      <div>Popularity boost: {Math.round((item.breakdown.popularity?.score || 0) * 100)}%</div>
                    </div>
                    <div className="drawer-why-row">
                      <div className="drawer-why-bullet"/>
                      <div>Overall match score: {Math.round((item.score || 0) * 100)}%</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tweaks panel ─────────────────────────────────────────────────
function Tweaks({ open, onClose, state, setState }) {
  if (!open) return null;
  const update = (k, v) => setState(s => ({ ...s, [k]: v }));
  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <div className="tweaks-title">Tweaks</div>
        <button className="tweaks-close" onClick={onClose}><Icons.x size={14}/></button>
      </div>

      <div className="tweaks-row">
        <div className="tweaks-row-label">Variant</div>
        <div className="seg">
          <button className={state.variant === 'refined' ? 'on' : ''} onClick={() => update('variant', 'refined')}>Refined</button>
          <button className={state.variant === 'bold' ? 'on' : ''} onClick={() => update('variant', 'bold')}>Bold</button>
        </div>
      </div>

      <div className="tweaks-row">
        <div className="tweaks-row-label">Accent</div>
        <div className="swatches">
          {[['amber', 65], ['violet', 295], ['teal', 195], ['rose', 10], ['lime', 130]].map(([name, hue]) => (
            <button
              key={name}
              className={`swatch ${state.accent === name ? 'on' : ''}`}
              style={{ background: `oklch(0.72 0.17 ${hue})`, color: `oklch(0.72 0.17 ${hue})` }}
              onClick={() => update('accent', name)}
              title={name}
            />
          ))}
        </div>
      </div>

      <div className="tweaks-row">
        <div className="tweaks-row-label">Background</div>
        <div className="seg">
          <button className={state.bg === 'ink' ? 'on' : ''} onClick={() => update('bg', 'ink')}>Ink</button>
          <button className={state.bg === 'grain' ? 'on' : ''} onClick={() => update('bg', 'grain')}>Grain</button>
          <button className={state.bg === 'aurora' ? 'on' : ''} onClick={() => update('bg', 'aurora')}>Aurora</button>
        </div>
      </div>

      <div className="tweaks-row">
        <div className="tweaks-row-label">Hover</div>
        <div className="seg">
          <button className={state.hover === 'panel' ? 'on' : ''} onClick={() => update('hover', 'panel')}>Panel</button>
          <button className={state.hover === 'overlay' ? 'on' : ''} onClick={() => update('hover', 'overlay')}>Overlay</button>
          <button className={state.hover === 'lift' ? 'on' : ''} onClick={() => update('hover', 'lift')}>Lift</button>
        </div>
      </div>

      <div className="tweaks-row">
        <div className="tweaks-row-label">Shelves</div>
        <div className="seg">
          <button className={state.shelves ? 'on' : ''} onClick={() => update('shelves', true)}>On</button>
          <button className={!state.shelves ? 'on' : ''} onClick={() => update('shelves', false)}>Off</button>
        </div>
      </div>

      <div className="tweaks-row">
        <div className="tweaks-row-label">Grid size</div>
        <input
          type="range" min="120" max="220" step="10"
          value={state.cardMin}
          onChange={e => update('cardMin', +e.target.value)}
        />
        <div className="tweaks-row-val">{state.cardMin}px</div>
      </div>

      <div className="tweaks-note">Changes persist to localStorage.</div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────
export default function App() {
  const [tweaks, setTweaks] = useState(loadTweaks);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('seerrv2_tab') || 'for_you');
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState('cozy');
  const [detail, setDetail] = useState(null);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [ratingPicker, setRatingPicker] = useState(null);
  const [toast, setToast] = useState(null);

  const [tabState, setTabState] = useState(() => {
    const s = {};
    TABS.forEach(t => { s[t] = { items: [], page: 0, hasMore: true, error: null, fetched: false }; });
    return s;
  });
  const [loadingPage, setLoadingPage] = useState({});
  const [requesting, setRequesting] = useState({});
  const [requestSuccess, setRequestSuccess] = useState({});
  const [watching, setWatching] = useState({});
  const [dismissing, setDismissing] = useState({});

  const scrollPositions = useRef({});
  const sentinelRef = useRef(null);
  const loadingRef = useRef({});
  const gridRef = useRef(null);

  // Persist tweaks
  useEffect(() => {
    localStorage.setItem('seerrv2_tweaks', JSON.stringify(tweaks));
  }, [tweaks]);

  useEffect(() => {
    localStorage.setItem('seerrv2_tab', activeTab);
  }, [activeTab]);

  // Apply theme
  useEffect(() => {
    const hue = ACCENT_HUES[tweaks.accent] ?? 65;
    document.documentElement.style.setProperty('--a-hue', hue);
    document.documentElement.style.setProperty('--card-min', `${tweaks.cardMin}px`);
    document.body.className = `bg-${tweaks.bg} hover-${tweaks.hover}`;
  }, [tweaks]);

  // Transform API item to UI item
  const transformItem = (apiItem) => {
    const score = apiItem.score !== undefined ? apiItem.score : 0;
    return {
      id: apiItem.item_id,
      source: 'seerrv2',
      title: apiItem.title,
      overview: apiItem.overview,
      posterUrl: apiItem.poster_path ? `https://image.tmdb.org/t/p/w500${apiItem.poster_path}` : null,
      backdropUrl: null,
      accentHue: hashHue(apiItem.title),
      rating: apiItem.vote_average || 0,
      year: apiItem.release_date ? apiItem.release_date.substring(0, 4) : null,
      score: score,
      tmdbId: apiItem.tmdb_id,
      mediaType: apiItem.media_type,
      genres: apiItem.genres || [],
      requested: false,
      breakdown: apiItem.breakdown,
    };
  };

  // Fetch logic
  const fetchPage = useCallback(async (tab, pageNum, depth = 0) => {
    const loadKey = `${tab}_${pageNum}`;
    if (loadingRef.current[loadKey]) return;
    loadingRef.current = { ...loadingRef.current, [loadKey]: true };
    setLoadingPage(prev => ({ ...prev, [loadKey]: true }));
    try {
      const res = await fetch(`${API_BASE}/${tab}?page=${pageNum}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const newItems = (json.items || []).map(transformItem);
      const dismissed = getDismissed(tab);
      const hidden = getHidden(tab);
      const visible = newItems.filter(i => !dismissed.has(i.id) && !hidden.has(i.id));
      setTabState(prev => {
        const current = prev[tab] || { items: [], page: 0, hasMore: true };
        const seen = new Set(current.items.map(i => i.id));
        const unique = visible.filter(i => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });
        const effectiveHasMore = json.hasMore && (unique.length > 0 || visible.length === 0);
        return {
          ...prev,
          [tab]: { ...current, items: [...current.items, ...unique], page: pageNum, hasMore: effectiveHasMore, error: null, fetched: true },
        };
      });
      if (visible.length === 0 && json.hasMore && depth < MAX_AUTO_CHAIN) {
        await fetchPage(tab, pageNum + 1, depth + 1);
      }
    } catch (err) {
      setTabState(prev => ({
        ...prev,
        [tab]: { ...(prev[tab] || { items: [], page: 0, hasMore: true }), error: err.message, fetched: true },
      }));
    } finally {
      loadingRef.current = { ...loadingRef.current, [loadKey]: false };
      setLoadingPage(prev => ({ ...prev, [loadKey]: false }));
    }
  }, []);

  useEffect(() => {
    TABS.forEach(tab => { if (!tabState[tab].fetched) fetchPage(tab, 1); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch all remaining pages for every tab (not just the active one)
  useEffect(() => {
    TABS.forEach(tab => {
      const ts = tabState[tab];
      if (!ts.fetched || !ts.hasMore) return;
      const nextPage = (ts.page || 0) + 1;
      if (!loadingRef.current[`${tab}_${nextPage}`]) fetchPage(tab, nextPage);
    });
  }, [tabState, fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const ts = tabState[activeTab];
    if (!ts.hasMore) return;
    const nextPage = (ts.page || 0) + 1;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchPage(activeTab, nextPage); },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, tabState, fetchPage]);

  // Scroll position memory
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPositions.current[activeTab] || 0);
  }, [activeTab]);

  // Card panel flip logic
  const ts = tabState[activeTab] || { items: [], page: 0, hasMore: true, error: null };
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => {
      el.querySelectorAll('.card').forEach(card => {
        const rightSpace = window.innerWidth - card.getBoundingClientRect().right;
        card.classList.toggle('flip-panel', rightSpace < 320);
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [ts.items, tweaks.cardMin]);

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(null), 2400);
  };

  // ── Tab switch ────────────────────────────────────────────────
  const handleTabSwitch = (tab) => {
    scrollPositions.current[activeTab] = window.scrollY;
    setActiveTab(tab);
    setQuery('');
  };

  // ── Refresh ───────────────────────────────────────────────────
  const handleRefresh = async () => {
    loadingRef.current = {};
    setTabState(() => {
      const fresh = {};
      TABS.forEach(t => { fresh[t] = { items: [], page: 0, hasMore: true, error: null, fetched: false }; });
      return fresh;
    });
    // Trigger regeneration
    try {
      await fetch(`${API_BASE}/generate`, { method: 'POST' });
    } catch (e) {
      console.warn('Regeneration trigger failed:', e);
    }
    TABS.forEach(tab => fetchPage(tab, 1));
    showToast('Recommendations refreshed');
  };

  // ── Request ───────────────────────────────────────────────────
  const handleRequest = async (item) => {
    const key = item.id;
    const sourceTab = activeTab;
    if (requesting[key] || requestSuccess[key] || !item.tmdbId) return;
    setRequesting(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType: item.mediaType === 'anime' ? 'tv' : item.mediaType, tmdbId: item.tmdbId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setRequestSuccess(prev => ({ ...prev, [key]: true }));
      setTabState(prev => ({
        ...prev,
        [sourceTab]: {
          ...prev[sourceTab],
          items: prev[sourceTab].items.map(i => i.id === key ? { ...i, requested: true } : i),
        },
      }));
      showToast(`Requested "${item.title}" on Overseerr`);
    } catch (err) {
      showToast(`Request failed: ${err.message}`);
    } finally {
      setRequesting(prev => ({ ...prev, [key]: false }));
    }
  };

  // ── Watched ───────────────────────────────────────────────────
  const handleWatched = (item) => {
    if (watching[item.id]) return;
    setRatingPicker({ item, action: 'watched' });
  };

  const execWatched = async (item, rating) => {
    const key = item.id;
    const sourceTab = activeTab;
    setWatching(prev => ({ ...prev, [key]: true }));
    try {
      const payload = { source: item.source, mediaType: item.mediaType };
      if (item.source === 'seerrv2') payload.tmdbId = item.tmdbId;
      if (rating) payload.rating = rating;
      const res = await fetch('/api/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      addDismissed(sourceTab, key);
      setTabState(prev => ({
        ...prev,
        [sourceTab]: { ...prev[sourceTab], items: prev[sourceTab].items.filter(i => i.id !== key) },
      }));
      setDetail(d => d?.id === key ? null : d);
      showToast(rating ? `Rated "${item.title}" ${rating}/10` : `Marked "${item.title}" watched`);
    } catch (err) {
      showToast(`Watch failed: ${err.message}`);
    } finally {
      setWatching(prev => ({ ...prev, [key]: false }));
    }
  };

  // ── Dismiss ───────────────────────────────────────────────────
  const handleDismiss = (item) => {
    if (dismissing[item.id]) return;
    setRatingPicker({ item, action: 'dismiss' });
  };

  const execDismiss = async (item) => {
    const key = item.id;
    const sourceTab = activeTab;
    setDismissing(prev => ({ ...prev, [key]: true }));
    try {
      await fetch('/api/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'seerrv2', mediaType: item.mediaType, tmdbId: item.tmdbId }),
      });
      addHidden(sourceTab, key);
      setTabState(prev => ({
        ...prev,
        [sourceTab]: { ...prev[sourceTab], items: prev[sourceTab].items.filter(i => i.id !== key) },
      }));
      setDetail(d => d?.id === key ? null : d);
      showToast(`Dismissed "${item.title}"`);
    } catch (err) {
      showToast(`Dismiss failed: ${err.message}`);
    } finally {
      setDismissing(prev => ({ ...prev, [key]: false }));
    }
  };

  // ── Rating confirm ─────────────────────────────────────────────
  const handleRatingConfirm = (rating) => {
    if (!ratingPicker) return;
    const { item, action } = ratingPicker;
    setRatingPicker(null);
    if (action === 'watched') execWatched(item, rating);
    else execDismiss(item);
  };

  // ── Derived state ──────────────────────────────────────────────
  const counts = useMemo(() => ({
    for_you: tabState.for_you.items.length,
    movies: tabState.movies.items.length,
    tv: tabState.tv.items.length,
    anime: tabState.anime.items.length,
    trending: tabState.trending.items.length,
    hidden_gems: tabState.hidden_gems.items.length,
  }), [tabState]);

  const filteredItems = useMemo(() => {
    const list = ts.items;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.genres?.some(g => g.toLowerCase().includes(q))
    );
  }, [ts.items, query]);

  const isLoadingFirst = loadingPage[`${activeTab}_1`] && ts.items.length === 0;
  const isLoadingMore = loadingPage[`${activeTab}_${ts.page + 1}`];

  const isBold = tweaks.variant === 'bold';
  const heroItem = isBold && filteredItems.length > 0 ? filteredItems[0] : null;
  const gridItems = isBold && tweaks.shelves
    ? filteredItems.slice(Math.min(filteredItems.length, 5))
    : (isBold ? filteredItems.slice(1) : filteredItems);

  const cardProps = {
    onRequest: handleRequest,
    onWatched: handleWatched,
    onDismiss: handleDismiss,
    onOpen: setDetail,
    requesting,
    watching,
    dismissing,
    reqSuccess: requestSuccess,
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="app">
      <Sidebar
        activeTab={activeTab}
        onTab={handleTabSwitch}
        onRefresh={handleRefresh}
        counts={counts}
        tweaks={tweaks}
      />

      <main className="main">
        <TopBar
          activeTab={activeTab}
          query={query}
          onQuery={setQuery}
          density={density}
          onDensity={setDensity}
          onOpenTweaks={() => setTweaksOpen(o => !o)}
        />

        {isBold && heroItem && (
          <Hero
            item={heroItem}
            onRequest={handleRequest}
            onWatched={handleWatched}
            requesting={requesting[heroItem.id]}
            reqSuccess={requestSuccess[heroItem.id]}
          />
        )}

        <div className="sec-head">
          <div className="sec-title">{isBold ? 'Everything else' : 'All recommendations'}</div>
          <div className="sec-sub">
            <span className="sec-count">{gridItems.length}</span> · page {ts.page || 1}/∞
          </div>
        </div>

        {isLoadingFirst && (
          <div className="grid">
            {Array.from({ length: 20 }).map((_, i) => <div key={i} className="skel"/>)}
          </div>
        )}

        {ts.error && !isLoadingFirst && (
          <div className="status-msg error">Failed to load: {ts.error}</div>
        )}

        {!isLoadingFirst && !ts.error && ts.fetched && filteredItems.length === 0 && (
          <div className="empty">
            {query ? `No results match "${query}"` : 'No recommendations found.'}
          </div>
        )}

        {gridItems.length > 0 && (
          <div className="grid" ref={gridRef} style={{ '--card-min': { compact: '130px', cozy: '170px', comfy: '210px' }[density] }}>
            {gridItems.map(item => (
              <Card
                key={item.id}
                item={item}
                onRequest={cardProps.onRequest}
                onWatched={cardProps.onWatched}
                onDismiss={cardProps.onDismiss}
                onOpen={cardProps.onOpen}
                requesting={requesting[item.id]}
                watching={watching[item.id]}
                dismissing={dismissing[item.id]}
                reqSuccess={requestSuccess[item.id]}
              />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="sentinel">
          {isLoadingMore && (
            <div className="status-msg"><div className="loading-spinner"/></div>
          )}
          {!ts.hasMore && ts.items.length > 0 && !isLoadingMore && (
            <div className="end-msg">— End of results —</div>
          )}
        </div>
      </main>

      {/* Rating modal */}
      {ratingPicker && (
        <RatingPicker
          item={ratingPicker.item}
          action={ratingPicker.action}
          onConfirm={handleRatingConfirm}
          onSkip={() => handleRatingConfirm(null)}
          onCancel={() => setRatingPicker(null)}
        />
      )}

      {/* Detail drawer */}
      {detail && (
        <DetailDrawer
          item={detail}
          onClose={() => setDetail(null)}
          onRequest={handleRequest}
          onWatched={handleWatched}
          onDismiss={handleDismiss}
          requesting={requesting[detail.id]}
          reqSuccess={requestSuccess[detail.id]}
        />
      )}

      {/* Tweaks panel */}
      <Tweaks open={tweaksOpen} onClose={() => setTweaksOpen(false)} state={tweaks} setState={setTweaks}/>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
