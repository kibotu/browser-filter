/**
 * Settings model: defaults, normalisation, and storage persistence.
 * Storage shape: { settings: { enabled: boolean, words: string[] } }
 */
(function (global) {
  'use strict';

  const COMPAT = function () { return global.WordFilterCompat; };

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    words: Object.freeze(['Trump']),
  });

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

  global.WordFilterConfig = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
  };
})(globalThis);
