import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../extension/compat.js';
import '../extension/config.js';
import { createCallbackArea, createPromiseArea } from './helpers.js';

const { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings } = globalThis.WordFilterConfig;
const compat = globalThis.WordFilterCompat;

describe('defaults', () => {
  it('ships enabled=true with the word "Trump"', () => {
    expect(DEFAULT_SETTINGS).toEqual({ enabled: true, words: ['Trump'] });
  });

  it('is frozen so callers cannot mutate shipped defaults', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.words)).toBe(true);
  });

  it('returns defaults for null input', () => {
    expect(normalizeSettings(null)).toEqual({ enabled: true, words: ['Trump'] });
  });

  it('returns defaults for non-object input', () => {
    expect(normalizeSettings('garbage')).toEqual({ enabled: true, words: ['Trump'] });
    expect(normalizeSettings([1, 2])).toEqual({ enabled: true, words: ['Trump'] });
    expect(normalizeSettings(42)).toEqual({ enabled: true, words: ['Trump'] });
  });
});

describe('normalizeSettings', () => {
  it('preserves a disabled flag', () => {
    expect(normalizeSettings({ enabled: false, words: ['X'] })).toEqual({ enabled: false, words: ['X'] });
  });

  it('falls back to the default flag for non-boolean values', () => {
    expect(normalizeSettings({ enabled: 'yes', words: ['X'] }).enabled).toBe(true);
    expect(normalizeSettings({ words: ['X'] }).enabled).toBe(true);
  });

  it('falls back to default words when the list is malformed', () => {
    expect(normalizeSettings({ enabled: true, words: 'Trump' }).words).toEqual(['Trump']);
    expect(normalizeSettings({ enabled: true }).words).toEqual(['Trump']);
    expect(normalizeSettings({ enabled: true, words: { 0: 'x' } }).words).toEqual(['Trump']);
  });

  it('keeps an intentionally empty word list', () => {
    expect(normalizeSettings({ enabled: true, words: [] })).toEqual({ enabled: true, words: [] });
  });

  it('trims, drops junk entries, and deduplicates case-insensitively', () => {
    const result = normalizeSettings({
      enabled: true,
      words: ['  trump ', 'Biden', '', '   ', null, 7, 'TRUMP', 'biden '],
    });
    expect(result.words).toEqual(['trump', 'Biden']);
  });
});

describe('loadSettings', () => {
  it('returns defaults when there is no storage area', async () => {
    await expect(loadSettings(null)).resolves.toEqual({ enabled: true, words: ['Trump'] });
    await expect(loadSettings(undefined)).resolves.toEqual({ enabled: true, words: ['Trump'] });
  });

  it('loads stored settings through a callback-style area', async () => {
    const area = createCallbackArea({ settings: { enabled: false, words: ['Musk'] } });
    await expect(loadSettings(area)).resolves.toEqual({ enabled: false, words: ['Musk'] });
  });

  it('falls back to defaults when nothing is stored', async () => {
    const area = createCallbackArea();
    await expect(loadSettings(area)).resolves.toEqual({ enabled: true, words: ['Trump'] });
  });

  it('normalises malformed stored values', async () => {
    const area = createCallbackArea({ settings: 'broken' });
    await expect(loadSettings(area)).resolves.toEqual({ enabled: true, words: ['Trump'] });
  });

  it('loads through a promise-style area', async () => {
    const area = createPromiseArea({ settings: { enabled: false, words: ['Musk'] } });
    await expect(loadSettings(area)).resolves.toEqual({ enabled: false, words: ['Musk'] });
  });

  it('propagates storage failures', async () => {
    const area = { get: () => Promise.reject(new Error('io error')) };
    await expect(loadSettings(area)).rejects.toThrow('io error');
  });

  it('propagates synchronous storage failures', async () => {
    const area = { get: () => { throw new Error('sync failure'); } };
    await expect(loadSettings(area)).rejects.toThrow('sync failure');
  });
});

describe('saveSettings', () => {
  it('persists normalised settings and resolves with them', async () => {
    const area = createCallbackArea();
    const saved = await saveSettings(area, { enabled: false, words: [' Trump ', 'x', 'TRUMP'] });
    expect(saved).toEqual({ enabled: false, words: ['Trump', 'x'] });
    expect(area.data.settings).toEqual({ enabled: false, words: ['Trump', 'x'] });
  });

  it('works with a promise-style area', async () => {
    const area = createPromiseArea();
    const saved = await saveSettings(area, { enabled: true, words: ['X'] });
    expect(saved).toEqual({ enabled: true, words: ['X'] });
    expect(area.data.settings).toEqual({ enabled: true, words: ['X'] });
  });

  it('round-trips through loadSettings', async () => {
    const area = createCallbackArea();
    await saveSettings(area, { enabled: false, words: [] });
    await expect(loadSettings(area)).resolves.toEqual({ enabled: false, words: [] });
  });
});

describe('compat wrapper', () => {
  const originals = {};

  beforeEach(() => {
    originals.browser = globalThis.browser;
    originals.chrome = globalThis.chrome;
    delete globalThis.browser;
    delete globalThis.chrome;
  });

  afterEach(() => {
    if (originals.browser === undefined) delete globalThis.browser;
    else globalThis.browser = originals.browser;
    if (originals.chrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originals.chrome;
  });

  it('returns null when no extension API exists', () => {
    expect(compat.getExtensionApi()).toBe(null);
  });

  it('falls back to chrome', () => {
    globalThis.chrome = { storage: {} };
    expect(compat.getExtensionApi()).toBe(globalThis.chrome);
  });

  it('prefers browser over chrome', () => {
    globalThis.browser = { storage: {} };
    globalThis.chrome = { storage: {} };
    expect(compat.getExtensionApi()).toBe(globalThis.browser);
  });

  it('finds the storage area, or null', () => {
    expect(compat.getStorageArea(null)).toBe(null);
    expect(compat.getStorageArea({})).toBe(null);
    const area = { get() {} };
    expect(compat.getStorageArea({ storage: { local: area } })).toBe(area);
  });

  it('resolves callback-style calls exactly once', async () => {
    const value = await compat.callApi(
      (arg, cb) => { cb(arg); },
      null,
      ['callback wins']
    );
    expect(value).toBe('callback wins');
  });

  it('prefers the callback when an API returns both', async () => {
    const value = await compat.callApi(
      (arg, cb) => { cb(arg); return Promise.resolve('promise wins'); },
      null,
      ['first']
    );
    expect(value).toBe('first');
  });

  it('resolves promise-style calls', async () => {
    const value = await compat.callApi(() => Promise.resolve('promised'), null, []);
    expect(value).toBe('promised');
  });

  it('rejects rejected promises', async () => {
    await expect(compat.callApi(() => Promise.reject(new Error('nope')), null, [])).rejects.toThrow('nope');
  });

  it('rejects synchronous throws', async () => {
    await expect(compat.callApi(() => { throw new Error('bang'); }, null, [])).rejects.toThrow('bang');
  });

  it('storageGet/storageSet delegate to the area', async () => {
    const area = createCallbackArea({ settings: { enabled: true, words: ['A'] } });
    await expect(compat.storageGet(area, { settings: null })).resolves.toEqual({
      settings: { enabled: true, words: ['A'] },
    });
    await compat.storageSet(area, { settings: { enabled: false, words: [] } });
    expect(area.data.settings).toEqual({ enabled: false, words: [] });
  });

  it('returns a no-op remover when there is no API', () => {
    const remove = compat.addStorageChangeListener(null, () => {});
    expect(typeof remove).toBe('function');
    expect(() => remove()).not.toThrow();
  });

  it('returns a no-op remover when onChanged only has addListener', () => {
    let added = 0;
    const remove = compat.addStorageChangeListener(
      { storage: { onChanged: { addListener: () => { added += 1; } } } },
      () => {}
    );
    expect(added).toBe(1);
    expect(() => remove()).not.toThrow();
  });

  it('registers and unregisters listeners', () => {
    let calls = 0;
    const listener = { count: 0 };
    const onChanged = {
      listeners: new Set(),
      addListener(cb) { this.listeners.add(cb); },
      removeListener(cb) { this.listeners.delete(cb); },
    };
    const remove = compat.addStorageChangeListener({ storage: { onChanged } }, () => { calls += 1; });
    expect(onChanged.listeners.size).toBe(1);
    remove();
    expect(onChanged.listeners.size).toBe(0);
    expect(calls).toBe(0);
    expect(listener.count).toBe(0);
  });
});
