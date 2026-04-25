/**
 * Plex API Client
 * Handles authentication, library scanning, and watch history retrieval.
 * Plex returns XML even when requesting JSON - we parse with regex.
 */

export class PlexClient {
  constructor(options = {}) {
    this.url = options.url || process.env.PLEX_URL || 'http://localhost:32400';
    this.token = options.token || process.env.PLEX_TOKEN;
    this.headers = {
      'X-Plex-Token': this.token,
      'Accept': 'application/json' // Plex ignores this but we try anyway
    };
  }

  /**
   * Base query method - handles both JSON and XML responses
   */
  async query(path, params = {}) {
    const url = new URL(`${this.url}${path}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const res = await fetch(url.toString(), {
      headers: this.headers
    });

    if (!res.ok) {
      throw new Error(`Plex API error: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();

    // Plex often returns XML with content-type text/xml even if we asked for JSON
    // Try JSON first, fall back to XML parser
    try {
      return JSON.parse(text);
    } catch (e) {
      return this._parseXmlResponse(text);
    }
  }

  /**
   * Simple regex-based XML parser for Plex responses.
   * Handles attributes on tags, but not nested text content.
   * Returns object with arrays per tag name.
   */
  _parseXmlResponse(xml) {
    const result = {};

    // Match opening tags with attributes: <TagName attr="value" ...>
    const tagRegex = /<(\w+)\s([^>]*?)>/g;
    let match;

    while ((match = tagRegex.exec(xml)) !== null) {
      const tagName = match[1];
      const attrsStr = match[2];

      const attrs = {};
      // Extract attributes: key="value"
      const attrRegex = /(\w[\w-]*)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }

      if (!result[tagName]) {
        result[tagName] = [];
      }
      result[tagName].push(attrs);
    }

    return result;
  }

  /**
   * Get all libraries on this server
   */
  async getLibraries() {
    const data = await this.query('/library/sections');
    // Plex XML response: <MediaContainer><Directory ...> (libraries)
    const directories = data.Directory || [];
    return directories.map(dir => ({
      key: dir.key,
      title: dir.title,
      type: dir.type,
      agent: dir.agent,
      scanner: dir.scanner,
      language: dir.language,
      composite: dir.composite
    }));
  }

  /**
   * Get contents of a library (paginated)
   * @param {string} libraryKey - The library section key
   * @param {Object} options - { page, size, sort, filter }
   */
  async getLibraryContents(libraryKey, options = {}) {
    const params = {
      ...options,
      // Ensure we get everything
      includeGuids: 1,
      includeMeta: 1
    };

    const data = await query(`/library/sections/${libraryKey}/all`, params);
    const items = data.Video || data.Directory || [];
    return items.map(this._parseItem);
  }

  /**
   * Parse a Plex item (Video or Directory) into a normalized object
   */
  _parseItem(attrs) {
    return {
      ratingKey: attrs.ratingKey,
      key: attrs.key,
      guid: attrs.guid,
      type: attrs.type,
      title: attrs.title,
      titleSort: attrs.titleSort,
      originalTitle: attrs.originalTitle,
      studio: attrs.studio,
      tagline: attrs.tagline,
      summary: attrs.summary,
      rating: parseFloat(attrs.rating) || null,
      ratingCount: parseInt(attrs.ratingCount) || null,
      audienceRating: parseFloat(attrs.audienceRating) || null,
      audienceRatingCount: parseInt(attrs.audienceRatingCount) || null,
      userRating: parseFloat(attrs.userRating) || null,
      viewCount: parseInt(attrs.viewCount) || 0,
      lastViewedAt: attrs.lastViewedAt ? parseInt(attrs.lastViewedAt) : null,
      year: parseInt(attrs.year) || null,
      thumb: attrs.thumb,
      art: attrs.art,
      duration: parseInt(attrs.duration) || null,
      originallyAvailableAt: attrs.originallyAvailableAt,
      addedAt: parseInt(attrs.addedAt) || null,
      updatedAt: parseInt(attrs.updatedAt) || null,
      // Media info (could be nested, simplified here)
      media: attrs.media || []
    };
  }

  /**
   * Get all user accounts on this Plex server
   */
  async getUsers() {
    try {
      const data = await query('/accounts');
      const accounts = data.Account || [];
      return accounts.map(acc => ({
        id: parseInt(acc.id),
        uuid: acc.uuid,
        title: acc.title,
        username: acc.username,
        email: acc.email,
        thumb: acc.thumb
      }));
    } catch (e) {
      console.error('Failed to fetch users:', e.message);
      return [];
    }
  }

  /**
   * Get watch history for a library (items sorted by lastViewedAt desc)
   */
  async getWatchHistory(libraryKey) {
    // Get all items in the library
    const allItems = await this.getLibraryContents(libraryKey, {
      sort: 'lastViewedAt:desc',
      // Only get items that have been viewed (lastViewedAt is set)
    });

    // Filter to only watched items
    const watched = allItems.filter(item => item.lastViewedAt !== null);
    return watched;
  }

  /**
   * OAuth PIN flow (for reference/implementation if needed)
   */
  async createPin() {
    const res = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        'X-Plex-Product': 'SeerrV2',
        'X-Plex-Client-Identifier': 'seerrv2-engine',
        'X-Plex-Version': '1.0'
      }
    });
    const data = await res.json();
    return data;
  }

  getAuthUrl(pin) {
    return `https://app.plex.tv/auth#?code=${pin.code}`;
  }

  async pollForToken(pinId) {
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`);
      const data = await res.json();
      if (data.authToken) {
        return data.authToken;
      }
    }
    throw new Error('Timeout waiting for Plex authorization');
  }

  /**
   * Simple sleep utility
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Helper to allow using query without this
async function query(path, params = {}) {
  // This wrapper would need an instance, but we'll create a temp one
  // In practice, use PlexClient instance directly
  throw new Error('Use PlexClient instance method: client.query()');
}
