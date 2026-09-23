/**
 * Content script: load settings, scan the page, then keep filtering
 * dynamically added content through a batched MutationObserver. Every
 * hidden block is counted and the running total is persisted locally.
 */
(function (global) {
  'use strict';

  const BATCH_DELAY_MS = 50;
  const STATS_FLUSH_DELAY_MS = 1000;

  /** Value comparison for normalised settings snapshots; null never matches. */
  function sameSettings(a, b) {
    if (!b) return false;
    if (a.enabled !== b.enabled || a.words.length !== b.words.length) return false;
    return a.words.every(function (word, index) { return word === b.words[index]; });
  }

  function createContentController(options) {
    // The bootstrap path passes no options; resolve the document here so the
    // controller never observes an undefined target.
    const doc = options.document || global.document;
    const config = options.config || global.WordFilterConfig;
    const storageArea = options.storageArea || null;
    const createMatcher = options.createMatcher || global.WordFilterMatcher.createMatcher;
    const scanRoot = options.scanRoot || global.WordFilterDOM.scanRoot;
    const clearAll = options.clearAll || global.WordFilterDOM.clearAll;
    const batchDelay = typeof options.batchDelay === 'number' ? options.batchDelay : BATCH_DELAY_MS;
    const statsFlushDelay =
      typeof options.statsFlushDelay === 'number' ? options.statsFlushDelay : STATS_FLUSH_DELAY_MS;

    let matcher = createMatcher([]);
    let enabled = false;
    let appliedSettings = null;
    let observer = null;
    let pending = new Set();
    let flushTimer = null;
    let pendingHides = 0;
    let statsTimer = null;

    function flush() {
      flushTimer = null;
      const roots = pending;
      pending = new Set();
      let hidden = 0;
      roots.forEach(function (root) {
        hidden += scanRoot(root, matcher);
      });
      noteHidden(hidden);
    }

    function scheduleFlush() {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flush, batchDelay);
    }

    /** Persist the accumulated hide count, throttled to one write per pause. */
    function flushStats() {
      statsTimer = null;
      const delta = pendingHides;
      pendingHides = 0;
      if (delta <= 0 || !storageArea) return;
      config.addHidden(storageArea, delta).catch(function () {
        pendingHides += delta; // keep the count; the next flush retries it
      });
    }

    function noteHidden(count) {
      if (!count) return;
      pendingHides += count;
      if (statsTimer !== null) return;
      statsTimer = setTimeout(flushStats, statsFlushDelay);
    }

    function handleMutations(mutations) {
      if (!enabled) return;
      mutations.forEach(function (mutation) {
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent) pending.add(parent);
          return;
        }
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) pending.add(node);
          else if (node.nodeType === 3 && node.parentElement) pending.add(node.parentElement);
        });
      });
      if (pending.size > 0) scheduleFlush();
    }

    function startObserver() {
      if (observer) return;
      observer = new global.MutationObserver(handleMutations);
      observer.observe(doc, { childList: true, subtree: true, characterData: true });
    }

    function stopObserver() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending = new Set();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    /**
     * Apply a settings snapshot: restore the page, then re-filter if
     * enabled. Clearing first makes word-list edits and disabling fully
     * reversible. Identical settings are ignored: our own counter writes
     * fire storage.onChanged, and re-applying them would clear and
     * re-hide the page, counting the same content over and over.
     */
    function applySettings(settings) {
      const next = settings || {};
      const snapshot = {
        enabled: next.enabled === true,
        words: Array.isArray(next.words) ? next.words.slice() : [],
      };
      if (sameSettings(snapshot, appliedSettings)) return;
      appliedSettings = snapshot;
      enabled = snapshot.enabled;
      matcher = createMatcher(snapshot.words);
      clearAll(doc);
      if (!enabled) {
        stopObserver();
        return;
      }
      noteHidden(scanRoot(doc, matcher));
      startObserver();
    }

    /** Stop observing and persist whatever the counter still holds. */
    function stop() {
      if (statsTimer !== null) clearTimeout(statsTimer);
      flushStats();
      stopObserver();
    }

    return { applySettings: applySettings, stop: stop };
  }

  function readSettings(config, storageArea) {
    return config.loadSettings(storageArea).catch(function () {
      return config.normalizeSettings(null);
    });
  }

  async function startContentScript(options) {
    const opts = options || {};
    const compat = opts.compat || global.WordFilterCompat;
    const config = opts.config || global.WordFilterConfig;
    const doc = opts.document || global.document;
    const api = 'api' in opts ? opts.api : compat.getExtensionApi();
    const storageArea = 'storageArea' in opts ? opts.storageArea : compat.getStorageArea(api);
    const controller = createContentController({ ...opts, config: config, storageArea: storageArea });

    const settings = await readSettings(config, storageArea);
    controller.applySettings(settings);

    const removeListener = compat.addStorageChangeListener(api, function () {
      readSettings(config, storageArea).then(controller.applySettings);
    });

    // Initial scan now, plus a full scan once the document finishes
    // parsing when the script is injected very early.
    if (doc.readyState === 'loading') {
      await new Promise(function (resolve) {
        doc.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
      controller.applySettings(await readSettings(config, storageArea));
    }

    return {
      applySettings: controller.applySettings,
      stop: function () {
        removeListener();
        controller.stop();
      },
    };
  }

  /* v8 ignore start -- platform bootstrap; runs only inside a real extension */
  function bootstrap() {
    startContentScript().catch(function (error) {
      console.error('browser-word-filter: failed to start', error);
    });
  }

  if (global.WordFilterCompat && global.WordFilterCompat.getExtensionApi()) {
    bootstrap();
  }
  /* v8 ignore stop */

  global.WordFilterContent = {
    createContentController: createContentController,
    startContentScript: startContentScript,
  };
})(globalThis);
