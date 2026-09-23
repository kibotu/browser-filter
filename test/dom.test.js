import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import '../extension/compat.js';
import '../extension/config.js';
import '../extension/matcher.js';
import '../extension/filter.js';
import '../extension/content.js';
import { createCallbackArea, createEmitter, sleep } from './helpers.js';

const { startContentScript } = globalThis.WordFilterContent;
const { HIDDEN_CLASS, PROCESSED_ATTRIBUTE } = globalThis.WordFilterDOM;

const fixtureBody = new DOMParser().parseFromString(
  readFileSync(path.join(process.cwd(), 'test/fixtures/dynamic.html'), 'utf8'),
  'text/html'
).body.innerHTML;

const isHidden = (element) => element.classList.contains(HIDDEN_CLASS);

// Cards are <article><p>…</p></article>. Granularity is the block that
// holds the match, so the <p> hides and the card shell stays visible.
const paragraph = (card) => card.querySelector('p');

const controllers = [];

async function start(options = {}) {
  const controller = await startContentScript({ document, batchDelay: 0, statsFlushDelay: 0, ...options });
  controllers.push(controller);
  return controller;
}

function insert(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const node = template.content.firstElementChild;
  document.getElementById('feed').append(node);
  return node;
}

const matchingArticle = () => insert('<article><p>Breaking: Trump resigned today</p></article>');
const cleanArticle = () => insert('<article><p>A calm, clean story.</p></article>');

beforeEach(() => {
  document.body.innerHTML = fixtureBody;
});

afterEach(() => {
  while (controllers.length > 0) controllers.pop().stop();
  document.body.innerHTML = '';
});

describe('MutationObserver filtering', () => {
  it('hides matching content inserted after the initial scan', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    await start({ storageArea: area });

    const article = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(article))).toBe(true));
    expect(paragraph(article).hasAttribute(PROCESSED_ATTRIBUTE)).toBe(true);

    const clean = cleanArticle();
    await sleep(30);
    expect(isHidden(paragraph(clean))).toBe(false);

    // Removals and comment insertions schedule no scan and cause no errors.
    clean.remove();
    document.getElementById('feed').append(document.createComment('noise'));
    await sleep(30);
    expect(isHidden(paragraph(article))).toBe(true);
  });

  it('hides an element whose text is changed in place', async () => {
    await start({
      storageArea: createCallbackArea({ settings: { enabled: true, words: ['Trump'] } }),
    });

    const article = insert('<article><p id="story">Initial headline</p></article>');
    await sleep(30);
    expect(isHidden(article.querySelector('#story'))).toBe(false);

    article.querySelector('#story').firstChild.data = 'Trump update landed';
    await vi.waitFor(() => expect(isHidden(article.querySelector('#story'))).toBe(true));
  });

  it('hides an element when a matching text node is appended', async () => {
    await start({
      storageArea: createCallbackArea({ settings: { enabled: true, words: ['Trump'] } }),
    });

    const article = insert('<article><p id="story">Initial headline</p></article>');
    await sleep(30);
    article.querySelector('#story').append(' and Trump too');
    await vi.waitFor(() => expect(isHidden(article.querySelector('#story'))).toBe(true));
  });
});

describe('hide counter', () => {
  it('counts each hidden block and persists the total', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    await start({ storageArea: area });

    matchingArticle();
    await vi.waitFor(() => expect(area.data.stats).toEqual({ hidden: 1 }));

    const second = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(second))).toBe(true));
    await vi.waitFor(() => expect(area.data.stats).toEqual({ hidden: 2 }));

    cleanArticle(); // non-matching content must not count
    await sleep(30);
    expect(area.data.stats).toEqual({ hidden: 2 });
  });

  it('keeps the count when a counter write fails and retries later', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    await start({ storageArea: area });

    const first = matchingArticle();
    await vi.waitFor(() => expect(area.data.stats).toEqual({ hidden: 1 }));

    const originalSet = area.set;
    area.set = () => Promise.reject(new Error('disk full'));

    const second = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(second))).toBe(true));
    await sleep(30);
    expect(area.data.stats).toEqual({ hidden: 1 }); // the write failed

    area.set = originalSet;
    const third = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(third))).toBe(true));
    // 1 already stored + the lost 1 retried + the new 1
    await vi.waitFor(() => expect(area.data.stats).toEqual({ hidden: 3 }));
    expect(isHidden(paragraph(first))).toBe(true);
  });

  it('flushes the pending count when the controller stops', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    const controller = await start({ storageArea: area, statsFlushDelay: 60000 });

    const card = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(card))).toBe(true));
    expect(area.data.stats).toBeUndefined();

    controller.stop();
    await vi.waitFor(() => expect(area.data.stats).toEqual({ hidden: 1 }));
  });

  it('ignores its own counter write instead of re-hiding the page', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    const emitter = createEmitter();
    await start({ api: { storage: { local: area, onChanged: emitter } } });

    const card = matchingArticle();
    await vi.waitFor(() => expect(area.data.stats).toEqual({ hidden: 1 }));

    // Real browsers deliver our own counter write back through onChanged.
    emitter.emit({ stats: { hidden: 1 } });
    await sleep(30);

    expect(area.data.stats).toEqual({ hidden: 1 }); // a re-scan would make it 2
    expect(isHidden(paragraph(card))).toBe(true);
  });
});

describe('settings changes propagate from storage', () => {
  function apiWith(area, emitter) {
    return { storage: { local: area, onChanged: emitter } };
  }

  it('disabling restores hidden content and stops filtering', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    const emitter = createEmitter();
    await start({ api: apiWith(area, emitter) });
    expect(emitter.size).toBe(1);

    const first = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(first))).toBe(true));

    area.data.settings = { enabled: false, words: ['Trump'] };
    emitter.emit();

    await vi.waitFor(() => expect(isHidden(paragraph(first))).toBe(false));
    expect(paragraph(first).hasAttribute(PROCESSED_ATTRIBUTE)).toBe(false);

    const second = matchingArticle();
    await sleep(30);
    expect(isHidden(paragraph(second))).toBe(false);
  });

  it('changing the word list restores old matches and applies new ones', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['Trump'] } });
    const emitter = createEmitter();
    await start({ api: apiWith(area, emitter) });

    const trumpArticle = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(trumpArticle))).toBe(true));
    const bidenArticle = insert('<article><p>Biden spoke first.</p></article>');
    await sleep(30);
    expect(isHidden(paragraph(bidenArticle))).toBe(false);

    area.data.settings = { enabled: true, words: ['Biden'] };
    emitter.emit();

    await vi.waitFor(() => expect(isHidden(paragraph(bidenArticle))).toBe(true));
    expect(isHidden(paragraph(trumpArticle))).toBe(false);
  });

  it('stop() removes the storage listener and disconnects the observer', async () => {
    const emitter = createEmitter();
    const controller = await start({
      api: apiWith(createCallbackArea({ settings: { enabled: true, words: ['Trump'] } }), emitter),
    });

    // A queued batch must be cancelled by stop(), not run after it.
    const article = matchingArticle();
    await Promise.resolve(); // observer microtask runs, flush gets scheduled
    controller.stop();
    expect(emitter.size).toBe(0);

    await sleep(30);
    expect(isHidden(paragraph(article))).toBe(false);
  });
});

describe('configuration fallbacks', () => {
  it('uses default settings when storage is unavailable', async () => {
    await start({ api: {}, storageArea: null });

    const article = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(article))).toBe(true));
  });

  it('uses default settings when the storage read fails', async () => {
    await start({
      storageArea: { get: () => Promise.reject(new Error('io error')) },
    });

    const article = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(article))).toBe(true));
  });

  // Regression: the real bootstrap path passes no options at all; the
  // controller must resolve the document itself, not only startContentScript.
  it('works without an explicit document (real bootstrap path)', async () => {
    const controller = await startContentScript({
      batchDelay: 0,
      storageArea: createCallbackArea({ settings: { enabled: true, words: ['Trump'] } }),
    });
    controllers.push(controller);

    const article = matchingArticle();
    await vi.waitFor(() => expect(isHidden(paragraph(article))).toBe(true));
  });

  it('runs an initial scan at DOMContentLoaded when injected early', async () => {
    const early = matchingArticle(); // present before the content script starts
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });
    try {
      const pending = startContentScript({
        document,
        batchDelay: 0,
        storageArea: createCallbackArea({ settings: { enabled: true, words: ['Trump'] } }),
      });

      await sleep(0);
      expect(isHidden(paragraph(early))).toBe(true); // initial apply does not wait

      document.dispatchEvent(new Event('DOMContentLoaded'));
      const controller = await pending;
      controllers.push(controller);

      const later = matchingArticle();
      await vi.waitFor(() => expect(isHidden(paragraph(later))).toBe(true));
    } finally {
      delete document.readyState;
    }
  });
});
