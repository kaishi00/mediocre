     1|import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
     2|
     3|// ─── Constants ───────────────────────────────────────────────────
     4|const TABS = ['for_you', 'movies', 'tv', 'anime', 'trending', 'hidden_gems'];
     5|const MAX_AUTO_CHAIN = 3;
     6|const DISMISSED_TTL = 24 * 60 * 60 * 1000;
     7|
     8|const ACCENT_HUES = { amber: 65, violet: 295, teal: 195, rose: 10, lime: 130 };
     9|const DEFAULTS = { variant: 'bold', accent: 'amber', bg: 'ink', hover: 'panel', shelves: true, cardMin: 170 };
    10|
    11|const API_BASE = '/api/v2/recommendations/ganyu';
    12|
    13|// ─── Persistence utils ───────────────────────────────────────────
    14|function loadTweaks() {
    15|  try {
    16|    const raw = localStorage.getItem('mediocre_tweaks');
    17|    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    18|  } catch { return { ...DEFAULTS }; }
    19|}
    20|
    21|function getDismissed(tab) {
    22|  try {
    23|    const raw = localStorage.getItem(`mediocre_dismissed_${tab}`);
    24|    if (!raw) return new Set();
    25|    const parsed = JSON.parse(raw);
    26|    const now = Date.now();
    27|    return new Set(parsed.filter(e => now - e.t < DISMISSED_TTL).map(e => e.id));
    28|  } catch { return new Set(); }
    29|}
    30|
    31|function addDismissed(tab, id) {
    32|  try {
    33|    const raw = localStorage.getItem(`mediocre_dismissed_${tab}`);
    34|    const existing = raw ? JSON.parse(raw) : [];
    35|    existing.push({ id, t: Date.now() });
    36|    localStorage.setItem(`mediocre_dismissed_${tab}`, JSON.stringify(existing));
    37|  } catch {}
    38|}
    39|
    40|function getHidden(tab) {
    41|  try {
    42|    const raw = localStorage.getItem(`mediocre_hidden_${tab}`);
    43|    return raw ? new Set(JSON.parse(raw)) : new Set();
    44|  } catch { return new Set(); }
    45|}
    46|
    47|function addHidden(tab, id) {
    48|  try {
    49|    const hidden = getHidden(tab);
    50|    hidden.add(id);
    51|    localStorage.setItem(`mediocre_hidden_${tab}`, JSON.stringify([...hidden]));
    52|  } catch {}
    53|}
    54|
    55|function getItemUrl(item) {
    56|  if (item.tmdbId)
    57|    return `https://www.themoviedb.org/${item.mediaType === 'movie' ? 'movie' : 'tv'}/${item.tmdbId}`;
    58|  return null;
    59|}
    60|
    61|function hashHue(str) {
    62|  let h = 0;
    63|  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    64|  return h;
    65|}
    66|
    67|// ─── Icons ───────────────────────────────────────────────────────
    68|const Icon = ({ d, size = 16, fill = false, stroke = 1.5, ...rest }) => (
    69|  <svg width={size} height={size} viewBox="0 0 24 24"
    70|    fill={fill ? 'currentColor' : 'none'}
    71|    stroke="currentColor" strokeWidth={stroke}
    72|    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    73|    <path d={d} />
    74|  </svg>
    75|);
    76|
    77|const Icons = {
    78|  film:     (p) => <Icon d="M4 4h16v16H4z M4 9h16 M4 15h16 M8 4v16 M16 4v16" {...p} />,
    79|  tv:       (p) => <Icon d="M3 6h18v12H3z M8 21h8 M12 18v3" {...p} />,
    80|  sparkle:  (p) => <Icon d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z M19 3v3 M17.5 4.5h3" {...p} />,
    81|  refresh:  (p) => <Icon d="M3 12a9 9 0 0 1 15.3-6.3L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15.3 6.3L3 16 M3 21v-5h5" {...p} />,
    82|  search:   (p) => <Icon d="M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-4.3-4.3" {...p} />,
    83|  plus:     (p) => <Icon d="M12 5v14 M5 12h14" {...p} />,
    84|  check:    (p) => <Icon d="M5 12l5 5L20 7" {...p} />,
    85|  clock:    (p) => <Icon d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20 M12 7v5l3 3" {...p} />,
    86|  x:        (p) => <Icon d="M6 6l12 12 M6 18L18 6" {...p} />,
    87|  link:     (p) => <Icon d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" {...p} />,
    88|  star:     (p) => <Icon d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z" {...p} fill />,
    89|  chev:     (p) => <Icon d="M9 6l6 6-6 6" {...p} />,
    90|  settings: (p) => <Icon d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...p} />,
    91|};
    92|
    93|// ─── Sidebar ─────────────────────────────────────────────────────
    94|function Sidebar({ activeTab, onTab, onRefresh, counts, tweaks }) {
    95|  return (
    96|    <aside className="side">
    97|      <div className="side-brand">
    98|        <div className="side-mark">
    99|          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
   100|            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
   101|            <circle cx="12" cy="12" r="4" fill="currentColor"/>
   102|            <circle cx="18" cy="7" r="1.5" fill="currentColor"/>
   103|          </svg>
   104|        </div>
   105|        <div className="side-wordmark">
   106|          <div className="side-word">seerr</div>
   107|          <div className="side-sub">v2 · recommendations</div>
   108|        </div>
   109|      </div>
   110|
   111|      <div className="side-group">
   112|        <div className="side-label">Discover</div>
   113|        <button className={`side-item ${activeTab === 'for_you' ? 'on' : ''}`} onClick={() => onTab('for_you')}>
   114|          <Icons.sparkle size={16}/> <span>For You</span>
   115|          <em className="side-count">{counts.for_you}</em>
   116|        </button>
   117|        <button className={`side-item ${activeTab === 'movies' ? 'on' : ''}`} onClick={() => onTab('movies')}>
   118|          <Icons.film size={16}/> <span>Movies</span>
   119|          <em className="side-count">{counts.movies}</em>
   120|        </button>
   121|        <button className={`side-item ${activeTab === 'tv' ? 'on' : ''}`} onClick={() => onTab('tv')}>
   122|          <Icons.tv size={16}/> <span>TV Shows</span>
   123|          <em className="side-count">{counts.tv}</em>
   124|        </button>
   125|        <button className={`side-item ${activeTab === 'anime' ? 'on' : ''}`} onClick={() => onTab('anime')}>
   126|          <Icons.sparkle size={16}/> <span>Anime</span>
   127|          <em className="side-count">{counts.anime}</em>
   128|        </button>
   129|        <button className={`side-item ${activeTab === 'trending' ? 'on' : ''}`} onClick={() => onTab('trending')}>
   130|          <Icons.sparkle size={16}/> <span>Trending</span>
   131|          <em className="side-count">{counts.trending}</em>
   132|        </button>
   133|        <button className={`side-item ${activeTab === 'hidden_gems' ? 'on' : ''}`} onClick={() => onTab('hidden_gems')}>
   134|          <Icons.sparkle size={16}/> <span>Hidden Gems</span>
   135|          <em className="side-count">{counts.hidden_gems}</em>
   136|        </button>
   137|      </div>
   138|
   139|      <div className="side-spacer"/>
   140|
   141|      <div className="side-foot">
   142|        <button className="side-foot-btn" onClick={onRefresh} title="Refresh recommendations">
   143|          <Icons.refresh size={14}/> <span>Refresh</span>
   144|        </button>
   145|        <div className="side-foot-user">
   146|          <div className="side-foot-avatar">G</div>
   147|          <div>
   148|            <div className="side-foot-name">Ganyu</div>
   149|            <div className="side-foot-sub">{tweaks.variant === 'bold' ? 'Bold' : 'Refined'} theme</div>
   150|          </div>
   151|        </div>
   152|      </div>
   153|    </aside>
   154|  );
   155|}
   156|
   157|// ─── TopBar ──────────────────────────────────────────────────────
   158|function TopBar({ activeTab, query, onQuery, density, onDensity, onOpenTweaks }) {
   159|  const titles = { for_you: 'For You', movies: 'Movies', tv: 'TV Shows', anime: 'Anime', trending: 'Trending', hidden_gems: 'Hidden Gems' };
   160|  const subs = {
   161|    for_you: 'Personalized picks from the Mediocre recommendation engine',
   162|    movies: 'Movie recommendations tuned to your taste profile',
   163|    tv: 'TV show recommendations based on your viewing history',
   164|    anime: 'Anime recommendations from the Mediocre engine',
   165|    trending: 'Currently popular titles you might have missed',
   166|    hidden_gems: 'Underrated titles that deserve your attention',
   167|  };
   168|  return (
   169|    <header className="top">
   170|      <div className="top-head">
   171|        <div className="top-crumb">Discover <span className="top-sep">/</span> <strong>{titles[activeTab]}</strong></div>
   172|        <h1 className="top-title">{titles[activeTab]}</h1>
   173|        <p className="top-sub">{subs[activeTab]}</p>
   174|      </div>
   175|      <div className="top-actions">
   176|        <div className="top-search">
   177|          <Icons.search size={14}/>
   178|          <input
   179|            value={query}
   180|            onChange={e => onQuery(e.target.value)}
   181|            placeholder="Filter this list…"
   182|          />
   183|        </div>
   184|        <div className="top-toggle">
   185|          <button className={density === 'compact' ? 'on' : ''} onClick={() => onDensity('compact')} title="Compact">
   186|            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
   187|              <rect x="3" y="3" width="8" height="8" rx="1"/>
   188|              <rect x="13" y="3" width="8" height="8" rx="1"/>
   189|              <rect x="3" y="13" width="8" height="8" rx="1"/>
   190|              <rect x="13" y="13" width="8" height="8" rx="1"/>
   191|            </svg>
   192|          </button>
   193|          <button className={density === 'cozy' ? 'on' : ''} onClick={() => onDensity('cozy')} title="Cozy">
   194|            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
   195|              <rect x="3" y="3" width="6" height="18" rx="1"/>
   196|              <rect x="10" y="3" width="6" height="18" rx="1"/>
   197|              <rect x="17" y="3" width="4" height="18" rx="1"/>
   198|            </svg>
   199|          </button>
   200|          <button className={density === 'comfy' ? 'on' : ''} onClick={() => onDensity('comfy')} title="Comfortable">
   201|            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
   202|              <rect x="3" y="3" width="8" height="18" rx="1"/>
   203|              <rect x="13" y="3" width="8" height="18" rx="1"/>
   204|            </svg>
   205|          </button>
   206|        </div>
   207|        <button className="top-icon-btn" title="Tweaks" onClick={onOpenTweaks}><Icons.settings size={16}/></button>
   208|      </div>
   209|    </header>
   210|  );
   211|}
   212|
   213|// ─── Hero (bold variant) ─────────────────────────────────────────
   214|function Hero({ item, onRequest, onWatched, requesting, reqSuccess }) {
   215|  if (!item) return null;
   216|  return (
   217|    <div className="hero">
   218|      {item.backdropUrl
   219|        ? <div className="hero-bg" style={{ backgroundImage: `url("${item.backdropUrl}")` }}/>
   220|        : <div className="hero-bg" style={{ background: `oklch(0.28 0.12 ${hashHue(item.title)})` }}/>
   221|      }
   222|      <div className="hero-scrim"/>
   223|      <div className="hero-body">
   224|        <div className="hero-eyebrow">
   225|          <span className="hero-chip">Top pick for you</span>
   226|          <span className="hero-dot"/>
   227|          <span className="hero-match">via {item.source}</span>
   228|        </div>
   229|        <h2 className="hero-title">{item.title}</h2>
   230|        <div className="hero-meta">
   231|          <span>{item.year}</span>
   232|          {item.rating > 0 && <>
   233|            <span className="hero-dot"/>
   234|            <span className="hero-rating"><Icons.star size={12}/> {item.rating}</span>
   235|          </>}
   236|          {item.score !== undefined && item.score !== null && (
   237|            <>
   238|              <span className="hero-dot"/>
   239|              <span className="hero-match">{Math.round(item.score * 100)}% match</span>
   240|            </>
   241|          )}
   242|          {item.genres?.length > 0 && <>
   243|            <span className="hero-dot"/>
   244|            <span>{item.genres.slice(0, 3).join(' · ')}</span>
   245|          </>}
   246|        </div>
   247|        {item.overview && <p className="hero-overview">{item.overview}</p>}
   248|        <div className="hero-actions">
   249|          <button
   250|            className="btn btn-primary btn-lg"
   251|            disabled={requesting || reqSuccess || item.requested}
   252|            onClick={() => onRequest(item)}
   253|          >
   254|            {reqSuccess ? <><Icons.check size={14}/> Requested</>
   255|              : item.requested ? <><Icons.clock size={14}/> Pending</>
   256|              : <><Icons.plus size={14}/> Request</>}
   257|          </button>
   258|          <button className="btn btn-ghost btn-lg" onClick={() => onWatched(item)}>
   259|            <Icons.check size={14}/> Mark watched
   260|          </button>
   261|        </div>
   262|      </div>
   263|    </div>
   264|  );
   265|}
   266|
   267|// ─── Card ────────────────────────────────────────────────────────
   268|function Card({ item, onRequest, onWatched, onDismiss, onOpen, requesting, watching, dismissing, reqSuccess }) {
   269|  const accentHue = item.accentHue ?? hashHue(item.title);
   270|  const accent = `oklch(0.62 0.18 ${accentHue})`;
   271|  return (
   272|    <div
   273|      className="card"
   274|      style={{ '--item-accent': accent }}
   275|      onClick={() => onOpen(item)}
   276|    >
   277|      <div className="card-poster">
   278|        {item.posterUrl
   279|          ? <img src={item.posterUrl} alt={item.title} loading="lazy"/>
   280|          : <div className="card-poster-empty">?</div>
   281|        }
   282|        <div className="card-sheen"/>
   283|      </div>
   284|
   285|      <div className="card-foot">
   286|        <div className="card-foot-title">{item.title}</div>
   287|        <div className="card-foot-meta">
   288|          <span>{item.year}</span>
   289|          {item.rating > 0 && <>
   290|            <span className="card-foot-sep">·</span>
   291|            <span className="card-foot-rating"><Icons.star size={10}/> {item.rating}</span>
   292|          </>}
   293|          {item.score !== undefined && item.score !== null && (
   294|            <>
   295|              <span className="card-foot-sep">·</span>
   296|              <span className="card-foot-rating">{Math.round(item.score * 100)}%</span>
   297|            </>
   298|          )}
   299|        </div>
   300|      </div>
   301|
   302|      <div className={`card-source s-${item.source}`}>
   303|        {item.source === 'mediocre' ? 'S' : '?'}
   304|      </div>
   305|
   306|      {item.requested && !reqSuccess && (
   307|        <div className="card-pill pill-pending">
   308|          <Icons.clock size={10}/> Pending
   309|        </div>
   310|      )}
   311|      {reqSuccess && (
   312|        <div className="card-pill pill-done">
   313|          <Icons.check size={10}/> Requested
   314|        </div>
   315|      )}
   316|
   317|      <div className="card-panel">
   318|        <div className="card-panel-inner">
   319|          <div className="card-panel-head">
   320|            <div className="card-panel-title">{item.title}</div>
   321|            <div className="card-panel-meta">
   322|              <span>{item.year}</span>
   323|              {item.runtime && <><span>·</span><span>{item.runtime}m</span></>}
   324|              {item.seasons && <><span>·</span><span>{item.seasons} season{item.seasons > 1 ? 's' : ''}</span></>}
   325|              {item.episodes && <><span>·</span><span>{item.episodes} ep</span></>}
   326|              {item.rating > 0 && <><span>·</span><span className="card-panel-rating"><Icons.star size={10}/> {item.rating}</span></>}
   327|              {item.score !== undefined && item.score !== null && (
   328|                <>
   329|                  <span>·</span>
   330|                  <span className="card-panel-rating">{Math.round(item.score * 100)}% match</span>
   331|                </>
   332|              )}
   333|            </div>
   334|          </div>
   335|          {item.genres?.length > 0 && (
   336|            <div className="card-panel-genres">
   337|              {item.genres.slice(0, 3).map(g => <span key={g} className="card-panel-genre">{g}</span>)}
   338|            </div>
   339|          )}
   340|          {item.overview && <p className="card-panel-overview">{item.overview}</p>}
   341|          <div className="card-panel-source">
   342|            <span className={`card-panel-src-badge s-${item.source}`}>{item.source}</span>
   343|            <span>via Mediocre recommendation engine</span>
   344|          </div>
   345|          <div className="card-panel-actions">
   346|            <button
   347|              className="btn btn-primary btn-sm"
   348|              disabled={requesting || reqSuccess || item.requested || !item.tmdbId}
   349|              onClick={e => { e.stopPropagation(); onRequest(item); }}
   350|            >
   351|              {requesting ? '…'
   352|                : reqSuccess ? <><Icons.check size={13}/> Requested</>
   353|                : item.requested ? <><Icons.clock size={13}/> Pending</>
   354|                : <><Icons.plus size={13}/> Request</>}
   355|            </button>
   356|            <button
   357|              className="btn btn-ghost btn-sm"
   358|              disabled={watching}
   359|              onClick={e => { e.stopPropagation(); onWatched(item); }}
   360|              title="Mark watched"
   361|            >
   362|              <Icons.check size={13}/>
   363|            </button>
   364|            <button
   365|              className="btn btn-ghost btn-sm"
   366|              disabled={dismissing}
   367|              onClick={e => { e.stopPropagation(); onDismiss(item); }}
   368|              title="Not interested"
   369|            >
   370|              <Icons.x size={13}/>
   371|            </button>
   372|          </div>
   373|        </div>
   374|      </div>
   375|    </div>
   376|  );
   377|}
   378|
   379|// ─── Shelf (bold variant) ─────────────────────────────────────────
   380|function Shelf({ title, subtitle, items, cardProps }) {
   381|  const ref = useRef(null);
   382|  const scroll = (dir) => {
   383|    if (!ref.current) return;
   384|    ref.current.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
   385|  };
   386|  return (
   387|    <section className="shelf">
   388|      <div className="shelf-head">
   389|        <div>
   390|          <h3 className="shelf-title">{title}</h3>
   391|          <p className="shelf-sub">{subtitle}</p>
   392|        </div>
   393|        <div className="shelf-nav">
   394|          <button onClick={() => scroll(-1)}><Icons.chev size={14} style={{ transform: 'rotate(180deg)' }}/></button>
   395|          <button onClick={() => scroll(1)}><Icons.chev size={14}/></button>
   396|        </div>
   397|      </div>
   398|      <div className="shelf-track" ref={ref}>
   399|        {items.map(item => (
   400|          <div className="shelf-cell" key={item.id}>
   401|            <Card
   402|              item={item}
   403|              onRequest={cardProps.onRequest}
   404|              onWatched={cardProps.onWatched}
   405|              onDismiss={cardProps.onDismiss}
   406|              onOpen={cardProps.onOpen}
   407|              requesting={cardProps.requesting?.[item.id]}
   408|              watching={cardProps.watching?.[item.id]}
   409|              dismissing={cardProps.dismissing?.[item.id]}
   410|              reqSuccess={cardProps.reqSuccess?.[item.id]}
   411|            />
   412|          </div>
   413|        ))}
   414|      </div>
   415|    </section>
   416|  );
   417|}
   418|
   419|// ─── RatingPicker (5-star modal) ─────────────────────────────────
   420|function RatingPicker({ item, action, onConfirm, onSkip, onCancel }) {
   421|  const [hover, setHover] = useState(0);
   422|  const [committed, setCommitted] = useState(0);
   423|  const display = hover || committed;
   424|  const stars = [1, 2, 3, 4, 5];
   425|
   426|  const handleClick = (val) => {
   427|    setCommitted(val);
   428|    setTimeout(() => onConfirm(val * 2), 150); // convert to 1–10 scale
   429|  };
   430|
   431|  return (
   432|    <div className="modal-backdrop" onClick={onCancel}>
   433|      <div className="modal" onClick={e => e.stopPropagation()}>
   434|        <div className="modal-eyebrow">{action === 'watched' ? 'You watched' : 'Not interested in'}</div>
   435|        <div className="modal-title">{item.title}</div>
   436|        <div className="modal-sub">
   437|          {action === 'watched'
   438|            ? 'Rate it so we can tune your recommendations'
   439|            : 'How bad was it? (optional)'}
   440|        </div>
   441|        <div className="rating" onMouseLeave={() => setHover(0)}>
   442|          {stars.map(i => {
   443|            const leftVal = i - 0.5;
   444|            const rightVal = i;
   445|            const leftLit = display >= leftVal;
   446|            const rightLit = display >= rightVal;
   447|            return (
   448|              <div key={i} className="rating-star-wrap">
   449|                <div className="rating-halves">
   450|                  <button
   451|                    className="rating-half"
   452|                    onMouseEnter={() => setHover(leftVal)}
   453|                    onClick={() => handleClick(leftVal)}
   454|                  />
   455|                  <button
   456|                    className="rating-half"
   457|                    onMouseEnter={() => setHover(rightVal)}
   458|                    onClick={() => handleClick(rightVal)}
   459|                  />
   460|                </div>
   461|                <svg className="rating-glyph" viewBox="0 0 24 24" width="40" height="40" aria-hidden>
   462|                  <defs>
   463|                    <clipPath id={`clp-${i}`}><rect x="0" y="0" width="12" height="24"/></clipPath>
   464|                  </defs>
   465|                  <path className="rating-bg" d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z"/>
   466|                  {leftLit && <path className="rating-fg" clipPath={`url(#clp-${i})`} d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z"/>}
   467|                  {rightLit && <path className="rating-fg" d="M12 2l3 7 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4L1.5 9.6 9 9z"/>}
   468|                </svg>
   469|              </div>
   470|            );
   471|          })}
   472|        </div>
   473|        <div className="rating-value">{display ? `${display.toFixed(1)} / 5` : 'Hover to rate'}</div>
   474|        <div className="modal-actions">
   475|          <button className="btn btn-ghost" onClick={onSkip}>Skip rating</button>
   476|          <button className="btn btn-primary" onClick={onCancel}>Close</button>
   477|        </div>
   478|      </div>
   479|    </div>
   480|  );
   481|}
   482|
   483|// ─── DetailDrawer ────────────────────────────────────────────────
   484|function DetailDrawer({ item, onClose, onRequest, onWatched, onDismiss, requesting, reqSuccess }) {
   485|  useEffect(() => {
   486|    const onEsc = (e) => e.key === 'Escape' && onClose();
   487|    document.addEventListener('keydown', onEsc);
   488|    return () => document.removeEventListener('keydown', onEsc);
   489|  }, [onClose]);
   490|
   491|  if (!item) return null;
   492|  const extUrl = getItemUrl(item);
   493|
   494|  return (
   495|    <div className="drawer-backdrop" onClick={onClose}>
   496|      <div className="drawer" onClick={e => e.stopPropagation()}>
   497|        {item.backdropUrl
   498|          ? <div className="drawer-bg" style={{ backgroundImage: `url("${item.backdropUrl}")` }}/>
   499|          : <div className="drawer-bg" style={{ background: `oklch(0.25 0.1 ${hashHue(item.title)})` }}/>
   500|        }
   501|