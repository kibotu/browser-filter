/**
 * Content script: load settings, scan the page, then keep filtering
 * dynamically added content through a batched MutationObserver.
 */
(function (global) {
  'use strict';

  const BATCH_DELAY_MS = 50;

  function createContentController(options) {
    // The bootstrap path passes no options; resolve the document here so the
    // controller never observes an undefined target.
    const doc = options.document || global.document;
    const createMatcher = options.createMatcher || global.WordFilterMatcher.createMatcher;
    const scanRoot = options.scanRoot || global.WordFilterDOM.scanRoot;
    const clearAll = options.clearAll || global.WordFilterDOM.clearAll;
    const batchDelay = typeof options.batchDelay === 'number' ? options.batchDelay : BATCH_DELAY_MS;

    let matcher = createMatcher([]);
    let enabled = false;
    let observer = null;
    let pending = new Set();
    let flushTimer = null;

    function flush() {
      flushTimer = null;
      const roots = pending;
      pending = new Set();
      roots.forEach(function (root) {
        scanRoot(root, matcher);
      });
    }

    function scheduleFlush() {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flush, batchDelay);
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
     * reversible.
     */
    function applySettings(settings) {
      const next = settings || {};
      enabled = next.enabled === true;
      matcher = createMatcher(next.words);
      clearAll(doc);
      if (!enabled) {
        stopObserver();
        return;
      }
      scanRoot(doc, matcher);
      startObserver();
    }

    return { applySettings: applySettings, stop: stopObserver };
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
    const controller = createContentController(opts);

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
