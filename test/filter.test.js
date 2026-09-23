import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import '../extension/matcher.js';
import '../extension/filter.js';

const { createMatcher } = globalThis.WordFilterMatcher;
const { scanRoot, clearAll, hideElement, findHideTarget, HIDDEN_CLASS, PROCESSED_ATTRIBUTE } =
  globalThis.WordFilterDOM;

const fixture = readFileSync(path.join(process.cwd(), 'test/fixtures/static.html'), 'utf8');

const isHidden = (element) => element.classList.contains(HIDDEN_CLASS);
const isMarked = (element) => element.hasAttribute(PROCESSED_ATTRIBUTE);

function loadFixture() {
  const doc = new DOMParser().parseFromString(fixture, 'text/html');
  return doc;
}

function find(doc, selector) {
  const element = doc.querySelector(selector);
  if (!element) throw new Error(`fixture element not found: ${selector}`);
  return element;
}

describe('scanRoot on a static page', () => {
  let doc;
  let hiddenCount;

  beforeEach(() => {
    doc = loadFixture();
    hiddenCount = scanRoot(doc, createMatcher(['Trump']));
  });

  it('hides exactly the matching content boundaries', () => {
    expect(hiddenCount).toBe(5);
    expect(isHidden(find(doc, '#matching-article h2'))).toBe(true);
    expect(isHidden(find(doc, '#nested-match p'))).toBe(true);
    expect(isHidden(find(doc, '#matching-list-item'))).toBe(true);
    expect(isHidden(find(doc, '#inner-section p'))).toBe(true);
    expect(isHidden(find(doc, '#bare-match'))).toBe(true);
  });

  it('keeps the container of a matching block visible', () => {
    expect(isHidden(find(doc, '#matching-article'))).toBe(false);
    expect(isHidden(find(doc, '#nested-match'))).toBe(false);
    expect(isHidden(find(doc, '#inner-section'))).toBe(false);
    expect(isHidden(find(doc, '#section-boundary'))).toBe(false);
  });

  it('keeps non-matching content visible', () => {
    expect(isHidden(find(doc, '#clean-article'))).toBe(false);
    expect(isHidden(find(doc, '#nested-clean'))).toBe(false);
    expect(isHidden(find(doc, '#clean-list-item'))).toBe(false);
    expect(isHidden(find(doc, '#section-boundary'))).toBe(false);
    expect(isHidden(find(doc, '#list-section'))).toBe(false);
  });

  it('prefers the smallest useful boundary (block over section over article)', () => {
    expect(isHidden(find(doc, '#matching-list-item'))).toBe(true);
    expect(isHidden(find(doc, '#list-section'))).toBe(false);

    expect(isHidden(find(doc, '#inner-section p'))).toBe(true);
    expect(isHidden(find(doc, '#inner-section'))).toBe(false);
    const article = find(doc, '#section-boundary');
    expect(isHidden(article)).toBe(false);
    expect(article.querySelector('#inner-section + p').textContent).toContain('Rest of the article');
  });

  it('falls back to the immediate containing element', () => {
    const bare = find(doc, '#bare-match');
    expect(bare.parentElement).toBe(doc.body);
    expect(isHidden(bare)).toBe(true);
  });

  it('never hides body or html for direct body text', () => {
    expect(isHidden(doc.body)).toBe(false);
    expect(isHidden(doc.documentElement)).toBe(false);
    expect(isMarked(doc.body)).toBe(false);
    const bodyText = [...doc.body.childNodes].find(
      (node) => node.nodeType === 3 && node.nodeValue.includes('direct text')
    );
    expect(bodyText).toBeDefined();
  });

  it('ignores script, style, title and head content', () => {
    for (const selector of ['script', 'style', 'title']) {
      const element = find(doc, selector);
      expect(isHidden(element)).toBe(false);
      expect(isMarked(element)).toBe(false);
    }
    expect(isHidden(doc.head)).toBe(false);
  });

  it('marks hidden elements as processed for idempotent scans', () => {
    expect(isMarked(find(doc, '#matching-article h2'))).toBe(true);
    expect(isMarked(find(doc, '#bare-match'))).toBe(true);
    expect(scanRoot(doc, createMatcher(['Trump']))).toBe(0);
  });

  it('leaves already-hidden elements alone', () => {
    const already = find(doc, '#already-hidden');
    expect(isHidden(already)).toBe(true);
    expect(isMarked(already)).toBe(false);
  });

  it('skips elements the page has hidden itself', () => {
    const pageHidden = find(doc, '#page-hidden');
    expect(isHidden(pageHidden)).toBe(false);
    expect(isMarked(pageHidden)).toBe(false);
  });
});

describe('scanRoot guards', () => {
  it('returns 0 for invalid roots or matchers', () => {
    const doc = loadFixture();
    expect(scanRoot(null, () => true)).toBe(0);
    expect(scanRoot(doc, null)).toBe(0);
    expect(scanRoot(undefined, undefined)).toBe(0);
  });

  it('does nothing when no words are configured', () => {
    const doc = loadFixture();
    expect(scanRoot(doc, createMatcher([]))).toBe(0);
  });
});

describe('paragraph granularity', () => {
  // Regression: a rendered README lives in one <article>. Without
  // paragraph-level boundaries a single match hid the entire article.
  it('hides only the matching paragraph, not the whole article', () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body><article class="markdown-body">' +
        '<p>Unrelated intro.</p>' +
        '<p>A mention of trump here.</p>' +
        '<p>Unrelated outro.</p>' +
        '</article></body></html>',
      'text/html'
    );
    const [intro, match, outro] = doc.querySelectorAll('p');
    const article = doc.querySelector('article');

    expect(scanRoot(doc, createMatcher(['trump']))).toBe(1);
    expect(isHidden(match)).toBe(true);
    expect(isHidden(intro)).toBe(false);
    expect(isHidden(outro)).toBe(false);
    expect(isHidden(article)).toBe(false);
  });

  it('hides the matching heading instead of the article around it', () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body><article><h2>Trump announces tariffs</h2>' +
        '<p>Body copy.</p></article></body></html>',
      'text/html'
    );
    expect(scanRoot(doc, createMatcher(['Trump']))).toBe(1);
    expect(isHidden(doc.querySelector('h2'))).toBe(true);
    expect(isHidden(doc.querySelector('p'))).toBe(false);
    expect(isHidden(doc.querySelector('article'))).toBe(false);
  });
});

describe('hideElement', () => {
  it('adds class and processed marker once', () => {
    const doc = loadFixture();
    const article = find(doc, '#clean-article');
    expect(hideElement(article)).toBe(true);
    expect(isHidden(article)).toBe(true);
    expect(isMarked(article)).toBe(true);
    expect(hideElement(article)).toBe(false);
  });
});

describe('findHideTarget', () => {
  let doc;

  beforeEach(() => {
    doc = loadFixture();
  });

  it('returns null for a node without a parent element', () => {
    expect(findHideTarget({ parentElement: null }, doc)).toBe(null);
  });

  it('returns null when the text lives directly in body', () => {
    const text = [...doc.body.childNodes].find((node) => node.nodeType === 3);
    expect(findHideTarget(text, doc)).toBe(null);
  });

  it('selects role="article" boundaries', () => {
    const wrapper = doc.createElement('div');
    wrapper.setAttribute('role', 'article');
    const inner = doc.createElement('div');
    inner.textContent = 'match';
    wrapper.append(inner);
    doc.body.append(wrapper);
    const target = findHideTarget(inner.firstChild, doc);
    expect(target).toBe(wrapper);
  });

  it('selects the paragraph over the article containing it', () => {
    const article = doc.createElement('article');
    const p = doc.createElement('p');
    p.textContent = 'match';
    article.append(p);
    doc.body.append(article);
    expect(findHideTarget(p.firstChild, doc)).toBe(p);
  });

  it('never jumps up to main; falls back to the immediate element', () => {
    const main = doc.createElement('main');
    const div = doc.createElement('div');
    div.textContent = 'match';
    main.append(div);
    doc.body.append(main);
    expect(findHideTarget(div.firstChild, doc)).toBe(div);
  });

  it('returns main itself when the text lives directly in main', () => {
    const main = doc.createElement('main');
    main.append(doc.createTextNode('match'));
    doc.body.append(main);
    expect(findHideTarget(main.firstChild, doc)).toBe(main);
  });
});

describe('clearAll', () => {
  it('restores every hidden element and removes markers', () => {
    const doc = loadFixture();
    scanRoot(doc, createMatcher(['Trump']));
    const cleared = clearAll(doc);
    expect(cleared).toBeGreaterThan(0);
    expect(doc.querySelectorAll(`.${HIDDEN_CLASS}`).length).toBe(0);
    expect(doc.querySelectorAll(`[${PROCESSED_ATTRIBUTE}]`).length).toBe(0);
    expect(isHidden(doc.querySelector('#matching-article h2'))).toBe(false);
  });

  it('clears a root element that is itself marked', () => {
    const doc = loadFixture();
    const article = find(doc, '#matching-article');
    hideElement(article);
    expect(clearAll(article)).toBe(1);
    expect(isHidden(article)).toBe(false);
    expect(isMarked(article)).toBe(false);
  });

  it('returns 0 for roots without querySelectorAll', () => {
    expect(clearAll(null)).toBe(0);
    expect(clearAll({})).toBe(0);
  });
});

describe('visibility handling', () => {
  it('uses checkVisibility when available', () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body><article><p id="t">Trump here</p></article></body></html>',
      'text/html'
    );
    const p = doc.querySelector('#t');
    Object.defineProperty(p, 'checkVisibility', { configurable: true, value: () => false });
    expect(scanRoot(doc, createMatcher(['Trump']))).toBe(0);
    Object.defineProperty(p, 'checkVisibility', { configurable: true, value: () => true });
    expect(scanRoot(doc, createMatcher(['Trump']))).toBe(1);
  });

  it('falls back to an ancestor walk when checkVisibility is unavailable', () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body>' +
        '<article id="visible"><p>Trump visible</p></article>' +
        '<article id="hidden-inline" style="display:none"><p>Trump hidden</p></article>' +
        '<article id="hidden-attr" hidden><p>Trump hidden</p></article>' +
        '</body></html>',
      'text/html'
    );
    for (const element of doc.querySelectorAll('article')) {
      Object.defineProperty(element, 'checkVisibility', { configurable: true, value: undefined });
    }
    expect(scanRoot(doc, createMatcher(['Trump']))).toBe(1);
    expect(isHidden(doc.querySelector('#visible p'))).toBe(true);
    expect(isMarked(doc.querySelector('#hidden-inline p'))).toBe(false);
    expect(isMarked(doc.querySelector('#hidden-attr p'))).toBe(false);
  });
});
