/**
 * Settings model: defaults, normalisation, and storage persistence.
 * Storage shape: { settings: { enabled: boolean, words: string[] },
 *                 stats: { hidden: number } }
 */
(function (global) {
  'use strict';

  const COMPAT = function () { return global.WordFilterCompat; };

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    words: Object.freeze(['Trump']),
  });

  const DEFAULT_STATS = Object.freeze({ hidden: 0 });

  /**
   * Coerce any stored/user-provided value into a valid settings object.
   * Malformed input falls back to defaults; a valid but empty word list
   * is preserved (the user may intentionally disable all words).
   */
  function normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const enabled = typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_SETTINGS.enabled;
    let words;
    if (Array.isArray(source.words)) {
      words = [];
      const seen = Object.create(null);
      source.words.forEach(function (word) {
        if (typeof word !== 'string') return;
        const trimmed = word.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        words.push(trimmed);
      });
    } else {
      words = DEFAULT_SETTINGS.words.slice();
    }
    return { enabled: enabled, words: words };
  }

  function loadSettings(storageArea) {
    if (!storageArea) return Promise.resolve(normalizeSettings(null));
    return COMPAT()
      .storageGet(storageArea, { settings: DEFAULT_SETTINGS })
      .then(function (result) {
        return normalizeSettings(result && result.settings);
      });
  }

  function saveSettings(storageArea, settings) {
    const normalized = normalizeSettings(settings);
    return COMPAT()
      .storageSet(storageArea, { settings: normalized })
      .then(function () { return normalized; });
  }

  /** Coerce a stored counter into a non-negative integer. */
  function normalizeStats(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const hidden = source.hidden;
    if (typeof hidden !== 'number' || !Number.isFinite(hidden) || hidden <= 0) {
      return { hidden: DEFAULT_STATS.hidden };
    }
    return { hidden: Math.floor(hidden) };
  }

  function loadStats(storageArea) {
    if (!storageArea) return Promise.resolve(normalizeStats(null));
    return COMPAT()
      .storageGet(storageArea, { stats: DEFAULT_STATS })
      .then(function (result) {
        return normalizeStats(result && result.stats);
      });
  }

  /**
   * Add delta to the persisted hide total; resolves with the new total.
   * Non-positive deltas resolve without writing.
   */
  function addHidden(storageArea, delta) {
    if (!storageArea) return Promise.resolve(normalizeStats(null));
    const bump = typeof delta === 'number' && Number.isFinite(delta) && delta > 0 ? Math.floor(delta) : 0;
    return loadStats(storageArea).then(function (stats) {
      if (bump === 0) return stats;
      const next = { hidden: stats.hidden + bump };
      return COMPAT()
        .storageSet(storageArea, { stats: next })
        .then(function () { return next; });
    });
  }

  global.WordFilterConfig = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_STATS: DEFAULT_STATS,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadStats: loadStats,
    addHidden: addHidden,
  };
})(globalThis);
