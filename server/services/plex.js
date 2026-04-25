     1|/**
     2| * Plex API Client
     3| * Handles authentication, library scanning, and watch history retrieval.
     4| * Plex returns XML even when requesting JSON - we parse with regex.
     5| */
     6|
     7|export class PlexClient {
     8|  constructor(options = {}) {
     9|    this.url = options.url || process.env.PLEX_URL || 'http://localhost:32400';
    10|    this.token = options.token || process.env.PLEX_TOKEN;
    11|    this.headers = {
    12|      'X-Plex-Token': this.token,
    13|      'Accept': 'application/json' // Plex ignores this but we try anyway
    14|    };
    15|  }
    16|
    17|  /**
    18|   * Base query method - handles both JSON and XML responses
    19|   */
    20|  async query(path, params = {}) {
    21|    const url = new URL(`${this.url}${path}`);
    22|    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    23|
    24|    const res = await fetch(url.toString(), {
    25|      headers: this.headers
    26|    });
    27|
    28|    if (!res.ok) {
    29|      throw new Error(`Plex API error: ${res.status} ${res.statusText}`);
    30|    }
    31|
    32|    const text = await res.text();
    33|
    34|    // Plex often returns XML with content-type text/xml even if we asked for JSON
    35|    // Try JSON first, fall back to XML parser
    36|    try {
    37|      return JSON.parse(text);
    38|    } catch (e) {
    39|      return this._parseXmlResponse(text);
    40|    }
    41|  }
    42|
    43|  /**
    44|   * Simple regex-based XML parser for Plex responses.
    45|   * Handles attributes on tags, but not nested text content.
    46|   * Returns object with arrays per tag name.
    47|   */
    48|  _parseXmlResponse(xml) {
    49|    const result = {};
    50|
    51|    // Match opening tags with attributes: <TagName attr="value" ...>
    52|    const tagRegex = /<(\w+)\s([^>]*?)>/g;
    53|    let match;
    54|
    55|    while ((match = tagRegex.exec(xml)) !== null) {
    56|      const tagName = match[1];
    57|      const attrsStr = match[2];
    58|
    59|      const attrs = {};
    60|      // Extract attributes: key="value"
    61|      const attrRegex = /(\w[\w-]*)="([^"]*)"/g;
    62|      let attrMatch;
    63|      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
    64|        attrs[attrMatch[1]] = attrMatch[2];
    65|      }
    66|
    67|      if (!result[tagName]) {
    68|        result[tagName] = [];
    69|      }
    70|      result[tagName].push(attrs);
    71|    }
    72|
    73|    return result;
    74|  }
    75|
    76|  /**
    77|   * Get all libraries on this server
    78|   */
    79|  async getLibraries() {
    80|    const data = await this.query('/library/sections');
    81|    // Plex XML response: <MediaContainer><Directory ...> (libraries)
    82|    const directories = data.Directory || [];
    83|    return directories.map(dir => ({
    84|      key: dir.key,
    85|      title: dir.title,
    86|      type: dir.type,
    87|      agent: dir.agent,
    88|      scanner: dir.scanner,
    89|      language: dir.language,
    90|      composite: dir.composite
    91|    }));
    92|  }
    93|
    94|  /**
    95|   * Get contents of a library (paginated)
    96|   * @param {string} libraryKey - The library section key
    97|   * @param {Object} options - { page, size, sort, filter }
    98|   */
    99|  async getLibraryContents(libraryKey, options = {}) {
   100|    const params = {
   101|      ...options,
   102|      // Ensure we get everything
   103|      includeGuids: 1,
   104|      includeMeta: 1
   105|    };
   106|
   107|    const data = await query(`/library/sections/${libraryKey}/all`, params);
   108|    const items = data.Video || data.Directory || [];
   109|    return items.map(this._parseItem);
   110|  }
   111|
   112|  /**
   113|   * Parse a Plex item (Video or Directory) into a normalized object
   114|   */
   115|  _parseItem(attrs) {
   116|    return {
   117|      ratingKey: attrs.ratingKey,
   118|      key: attrs.key,
   119|      guid: attrs.guid,
   120|      type: attrs.type,
   121|      title: attrs.title,
   122|      titleSort: attrs.titleSort,
   123|      originalTitle: attrs.originalTitle,
   124|      studio: attrs.studio,
   125|      tagline: attrs.tagline,
   126|      summary: attrs.summary,
   127|      rating: parseFloat(attrs.rating) || null,
   128|      ratingCount: parseInt(attrs.ratingCount) || null,
   129|      audienceRating: parseFloat(attrs.audienceRating) || null,
   130|      audienceRatingCount: parseInt(attrs.audienceRatingCount) || null,
   131|      userRating: parseFloat(attrs.userRating) || null,
   132|      viewCount: parseInt(attrs.viewCount) || 0,
   133|      lastViewedAt: attrs.lastViewedAt ? parseInt(attrs.lastViewedAt) : null,
   134|      year: parseInt(attrs.year) || null,
   135|      thumb: attrs.thumb,
   136|      art: attrs.art,
   137|      duration: parseInt(attrs.duration) || null,
   138|      originallyAvailableAt: attrs.originallyAvailableAt,
   139|      addedAt: parseInt(attrs.addedAt) || null,
   140|      updatedAt: parseInt(attrs.updatedAt) || null,
   141|      // Media info (could be nested, simplified here)
   142|      media: attrs.media || []
   143|    };
   144|  }
   145|
   146|  /**
   147|   * Get all user accounts on this Plex server
   148|   */
   149|  async getUsers() {
   150|    try {
   151|      const data = await query('/accounts');
   152|      const accounts = data.Account || [];
   153|      return accounts.map(acc => ({
   154|        id: parseInt(acc.id),
   155|        uuid: acc.uuid,
   156|        title: acc.title,
   157|        username: acc.username,
   158|        email: acc.email,
   159|        thumb: acc.thumb
   160|      }));
   161|    } catch (e) {
   162|      console.error('Failed to fetch users:', e.message);
   163|      return [];
   164|    }
   165|  }
   166|
   167|  /**
   168|   * Get watch history for a library (items sorted by lastViewedAt desc)
   169|   */
   170|  async getWatchHistory(libraryKey) {
   171|    // Get all items in the library
   172|    const allItems = await this.getLibraryContents(libraryKey, {
   173|      sort: 'lastViewedAt:desc',
   174|      // Only get items that have been viewed (lastViewedAt is set)
   175|    });
   176|
   177|    // Filter to only watched items
   178|    const watched = allItems.filter(item => item.lastViewedAt !== null);
   179|    return watched;
   180|  }
   181|
   182|  /**
   183|   * OAuth PIN flow (for reference/implementation if needed)
   184|   */
   185|  async createPin() {
   186|    const res = await fetch('https://plex.tv/api/v2/pins', {
   187|      method: 'POST',
   188|      headers: {
   189|        'X-Plex-Product': 'Mediocre',
   190|        'X-Plex-Client-Identifier': 'mediocre-engine',
   191|        'X-Plex-Version': '1.0'
   192|      }
   193|    });
   194|    const data = await res.json();
   195|    return data;
   196|  }
   197|
   198|  getAuthUrl(pin) {
   199|    return `https://app.plex.tv/auth#?code=${pin.code}`;
   200|  }
   201|
   202|  async pollForToken(pinId) {
   203|    for (let i = 0; i < 30; i++) {
   204|      await sleep(2000);
   205|      const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`);
   206|      const data = await res.json();
   207|      if (data.authToken) {
   208|        return data.authToken;
   209|      }
   210|    }
   211|    throw new Error('Timeout waiting for Plex authorization');
   212|  }
   213|
   214|  /**
   215|   * Simple sleep utility
   216|   */
   217|  static sleep(ms) {
   218|    return new Promise(resolve => setTimeout(resolve, ms));
   219|  }
   220|}
   221|
   222|// Helper to allow using query without this
   223|async function query(path, params = {}) {
   224|  // This wrapper would need an instance, but we'll create a temp one
   225|  // In practice, use PlexClient instance directly
   226|  throw new Error('Use PlexClient instance method: client.query()');
   227|}
   228|