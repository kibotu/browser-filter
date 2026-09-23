import { describe, it, expect } from 'vitest';
import '../extension/matcher.js';

const { matchesWord, createMatcher, normalizeWords, escapeRegExp } = globalThis.WordFilterMatcher;

describe('matchesWord — case-insensitive whole-word matching', () => {
  it('matches exact case', () => {
    expect(matchesWord('Trump announced new tariffs.', ['Trump'])).toBe(true);
  });

  it('matches lowercase and uppercase', () => {
    expect(matchesWord('trump announced new tariffs.', ['Trump'])).toBe(true);
    expect(matchesWord('TRUMP ANNOUNCED NEW TARIFFS.', ['Trump'])).toBe(true);
  });

  it('matches mixed case in either direction', () => {
    expect(matchesWord('tRuMp announced.', ['Trump'])).toBe(true);
    expect(matchesWord('Trump announced.', ['trump'])).toBe(true);
  });

  it('matches possessives and surrounding punctuation', () => {
    expect(matchesWord("Trump's team landed.", ['Trump'])).toBe(true);
    expect(matchesWord('(Trump) said so, claimed "trump."', ['Trump'])).toBe(true);
    expect(matchesWord('Vote Trump!', ['Trump'])).toBe(true);
  });

  it('matches word-adjacent punctuation such as hyphens', () => {
    expect(matchesWord('anti-trump rally', ['Trump'])).toBe(true);
    expect(matchesWord('pro-Trump coalition', ['Trump'])).toBe(true);
  });

  it('does not match word extensions', () => {
    expect(matchesWord('they trumped the opponent', ['Trump'])).toBe(false);
    expect(matchesWord('a trumper stance', ['Trump'])).toBe(false);
    expect(matchesWord('the trumpet player', ['Trump'])).toBe(false);
    expect(matchesWord('trumping expectations', ['Trump'])).toBe(false);
  });

  it('does not match when the word is embedded in a longer word', () => {
    expect(matchesWord('atrump is not a word', ['Trump'])).toBe(false);
    expect(matchesWord('the BUS left', ['US'])).toBe(false);
  });

  it('treats accented letters as part of the word', () => {
    expect(matchesWord('trumpé banner', ['Trump'])).toBe(false);
    expect(matchesWord('café Trump opened', ['Trump'])).toBe(true);
  });

  it('matches any of multiple configured words', () => {
    const words = ['Trump', 'Biden'];
    expect(matchesWord('Biden spoke before Trump left.', words)).toBe(true);
    expect(matchesWord('Nothing relevant here.', words)).toBe(false);
  });

  it('escapes regex metacharacters in user terms', () => {
    expect(matchesWord('the price is 100.00 today', ['100.00'])).toBe(true);
    expect(matchesWord('the price is 100400 today', ['100.00'])).toBe(false);
    expect(matchesWord('a+b is literal here', ['a+b'])).toBe(true);
    expect(matchesWord('aab is not the pattern', ['a+b'])).toBe(false);
    expect(matchesWord('cost is 50 usd?', ['usd?'])).toBe(true);
    expect(matchesWord('group (word) inside', ['(word)'])).toBe(true);
  });

  it('never matches with empty or invalid configuration', () => {
    expect(matchesWord('Trump announced', [])).toBe(false);
    expect(matchesWord('Trump announced', undefined)).toBe(false);
    expect(matchesWord('Trump announced', [''])).toBe(false);
    expect(matchesWord('Trump announced', ['   '])).toBe(false);
    expect(matchesWord('Trump announced', [null, 42, {}, ''])).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(matchesWord(null, ['Trump'])).toBe(false);
    expect(matchesWord(undefined, ['Trump'])).toBe(false);
    expect(matchesWord(123, ['Trump'])).toBe(false);
  });

  it('has an empty configuration that matches nothing', () => {
    expect(matchesWord('', [])).toBe(false);
  });
});

describe('createMatcher', () => {
  it('returns a reusable predicate', () => {
    const isMatch = createMatcher(['Trump']);
    expect(isMatch('first Trump mention')).toBe(true);
    expect(isMatch('clean text follows')).toBe(false);
    expect(isMatch('second Trump mention')).toBe(true);
  });

  it('builds a matcher that never matches when configured empty', () => {
    const isMatch = createMatcher(['', '  ']);
    expect(isMatch('Trump')).toBe(false);
  });
});

describe('normalizeWords', () => {
  it('trims and drops non-string and empty entries', () => {
    expect(normalizeWords(['  Trump ', '', '   ', null, 7, 'Biden'])).toEqual(['Trump', 'Biden']);
  });

  it('returns an empty list for non-arrays', () => {
    expect(normalizeWords(undefined)).toEqual([]);
    expect(normalizeWords('Trump')).toEqual([]);
    expect(normalizeWords({ words: ['x'] })).toEqual([]);
  });
});

describe('escapeRegExp', () => {
  it('escapes all special characters', () => {
    const escaped = escapeRegExp('a.b+c*d?e^f$g{h}i(j)k|l[m]n\\o');
    expect(new RegExp(escaped).test('a.b+c*d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(true);
    expect(new RegExp(escaped).test('aXb')).toBe(false);
  });
});
