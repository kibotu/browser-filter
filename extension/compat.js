/**
 * Minimal browser/Chrome API compatibility layer.
 * Prefers `browser`, falls back to `chrome`, and normalises callback-style
 * and promise-style extension APIs to promises.
 */
(function (global) {
  'use strict';

  function getExtensionApi() {
    if (global.browser) return global.browser;
    if (global.chrome) return global.chrome;
    return null;
  }

  function getStorageArea(api) {
    const resolved = api || getExtensionApi();
    if (resolved && resolved.storage && resolved.storage.local) return resolved.storage.local;
    return null;
  }

  /**
   * Invoke an extension API method and settle exactly once, whether the API
   * reports through a trailing callback, a returned promise, or a sync throw.
   */
  function callApi(fn, receiver, args) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      function settle(kind, value) {
        if (settled) return;
        settled = true;
        if (kind === 'reject') reject(value);
        else resolve(value);
      }
      let result;
      try {
        result = fn.apply(receiver, args.concat([function (value) { settle('resolve', value); }]));
      } catch (error) {
        settle('reject', error);
        return;
      }
      if (result && typeof result.then === 'function') {
        result.then(
          function (value) { settle('resolve', value); },
          function (error) { settle('reject', error); }
        );
      }
    });
  }

  function storageGet(storageArea, keys) {
    return callApi(storageArea.get, storageArea, [keys]);
  }

  function storageSet(storageArea, items) {
    return callApi(storageArea.set, storageArea, [items]);
  }

  /** Returns a function that removes the listener again. */
  function addStorageChangeListener(api, callback) {
    const resolved = api || getExtensionApi();
    const onChanged = resolved && resolved.storage && resolved.storage.onChanged;
    if (!onChanged || typeof onChanged.addListener !== 'function') return function () {};
    onChanged.addListener(callback);
    if (typeof onChanged.removeListener !== 'function') return function () {};
    return function () { onChanged.removeListener(callback); };
  }

  global.WordFilterCompat = {
    getExtensionApi: getExtensionApi,
    getStorageArea: getStorageArea,
    callApi: callApi,
    storageGet: storageGet,
    storageSet: storageSet,
    addStorageChangeListener: addStorageChangeListener,
  };
})(globalThis);
