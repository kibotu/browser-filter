/**
 * Case-insensitive whole-word matching against a configured word list.
 *
 * "Trump" matches "Trump", "trump", "TRUMP" and "Trump's", but not
 * "trumped", "trumper" or "trumpet". User terms are regex-escaped.
 */
(function (global) {
  'use strict';

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeWords(words) {
    if (!Array.isArray(words)) return [];
    const out = [];
    words.forEach(function (word) {
      if (typeof word !== 'string') return;
      const trimmed = word.trim();
      if (trimmed) out.push(trimmed);
    });
    return out;
  }

  /**
   * Boundaries use Unicode letter/number classes, so "trumpé" is one word
   * and does not match. Possessives and punctuation do not block a match
   * because apostrophes and spaces count as boundaries.
   */
  function buildPattern(words) {
    const terms = normalizeWords(words).map(escapeRegExp);
    if (terms.length === 0) return null;
    const source = terms
      .map(function (term) {
        return '(?:^|[^\\p{L}\\p{N}_])' + term + '(?:[^\\p{L}\\p{N}_]|$)';
      })
      .join('|');
    return new RegExp(source, 'iu');
  }

  function createMatcher(words) {
    const pattern = buildPattern(words);
    if (!pattern) return function () { return false; };
    return function matches(text) {
      if (typeof text !== 'string' || text.length === 0) return false;
      return pattern.test(text);
    };
  }

  function matchesWord(text, words) {
    return createMatcher(words)(text);
  }

  global.WordFilterMatcher = {
    escapeRegExp: escapeRegExp,
    normalizeWords: normalizeWords,
    createMatcher: createMatcher,
    matchesWord: matchesWord,
  };
})(globalThis);
