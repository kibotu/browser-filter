/** Shared test doubles. Not a test suite; vitest only collects *.test.js. */

/** Chrome-style callback storage area. */
export function createCallbackArea(initial = {}) {
  const data = { ...initial };
  return {
    get(keys, callback) {
      const result = {};
      for (const key of Object.keys(keys)) {
        result[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : keys[key];
      }
      callback(result);
    },
    set(items, callback) {
      Object.assign(data, items);
      if (callback) callback();
    },
    data,
  };
}

/** Firefox-style promise storage area. */
export function createPromiseArea(initial = {}) {
  const data = { ...initial };
  return {
    get(keys) {
      const result = {};
      for (const key of Object.keys(keys)) {
        result[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : keys[key];
      }
      return Promise.resolve(result);
    },
    set(items) {
      Object.assign(data, items);
      return Promise.resolve();
    },
    data,
  };
}

/** Minimal browser.storage.onChanged stand-in. */
export function createEmitter() {
  const listeners = new Set();
  return {
    addListener(callback) {
      listeners.add(callback);
    },
    removeListener(callback) {
      listeners.delete(callback);
    },
    emit(changes = {}, areaName = 'local') {
      for (const callback of [...listeners]) callback(changes, areaName);
    },
    get size() {
      return listeners.size;
    },
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
