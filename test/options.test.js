import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import '../extension/compat.js';
import '../extension/config.js';
import '../extension/options.js';
import { createCallbackArea } from './helpers.js';

const { initOptionsPage } = globalThis.WordFilterOptions;

const optionsHtml = readFileSync(path.join(process.cwd(), 'extension/options.html'), 'utf8');

function setup(initial = {}) {
  const doc = new DOMParser().parseFromString(optionsHtml, 'text/html');
  const root = doc.getElementById('word-filter-options');
  const area = createCallbackArea(initial);
  const page = initOptionsPage(root, { storageArea: area });
  const $ = (selector) => root.querySelector(selector);
  const items = () => [...root.querySelectorAll('#word-list li')];
  return { root, area, page, $, items };
}

describe('options page', () => {
  it('renders stored settings', async () => {
    const { page, $, items } = setup({ settings: { enabled: false, words: ['Trump', 'Biden'] } });
    await page.load();

    expect($('#enabled').checked).toBe(false);
    expect(items().map((li) => li.querySelector('span').textContent)).toEqual(['Trump', 'Biden']);
    expect(items()[0].querySelector('button').textContent).toBe('Remove');
    expect($('#status').textContent).toBe('');
  });

  it('renders defaults when nothing is stored', async () => {
    const { page, $, items } = setup();
    await page.load();

    expect($('#enabled').checked).toBe(true);
    expect(items()).toHaveLength(1);
    expect(items()[0].querySelector('span').textContent).toBe('Trump');
  });

  it('shows defaults and a notice when loading fails', async () => {
    const doc = new DOMParser().parseFromString(optionsHtml, 'text/html');
    const root = doc.getElementById('word-filter-options');
    const page = initOptionsPage(root, {
      storageArea: { get: () => Promise.reject(new Error('io')) },
    });
    await page.load();

    expect(root.querySelector('#status').textContent).toContain('Could not load settings');
    expect(root.querySelector('#enabled').checked).toBe(true);
    expect(root.querySelectorAll('#word-list li')).toHaveLength(1);
    expect(root.querySelector('#hidden-count').textContent).toBe('—');
  });

  it('shows the persisted hide counter', async () => {
    const { page, $ } = setup({ stats: { hidden: 42 } });
    await page.load();

    expect($('#hidden-count').textContent).toBe('42');
  });

  it('starts the counter at zero when nothing is stored', async () => {
    const { page, $ } = setup();
    await page.load();

    expect($('#hidden-count').textContent).toBe('0');
  });

  it('adds a word from the input', async () => {
    const { page, $, items } = setup();
    await page.load();

    $('#new-word').value = 'Musk';
    $('#add-word').click();

    expect(items()).toHaveLength(2);
    expect(items()[1].querySelector('span').textContent).toBe('Musk');
    expect($('#new-word').value).toBe('');
    expect($('#status').textContent).toBe('');
  });

  it('refuses an empty word', async () => {
    const { page, $, items } = setup();
    await page.load();

    $('#new-word').value = '   ';
    $('#add-word').click();

    expect(items()).toHaveLength(1);
    expect($('#status').textContent).toContain('Enter a word');
  });

  it('refuses a duplicate word regardless of case', async () => {
    const { page, $, items } = setup();
    await page.load();

    $('#new-word').value = 'trump';
    $('#add-word').click();

    expect(items()).toHaveLength(1);
    expect($('#status').textContent).toContain('already');
  });

  it('removes a word via its Remove button', async () => {
    const { page, items } = setup({ settings: { enabled: true, words: ['Trump', 'Biden'] } });
    await page.load();

    items()[0].querySelector('button').click();
    expect(items()).toHaveLength(1);
    expect(items()[0].querySelector('span').textContent).toBe('Biden');

    items()[0].querySelector('span').click(); // label clicks do nothing
    expect(items()).toHaveLength(1);
  });

  it('saves enabled state and word list to storage', async () => {
    const { page, $, items, area } = setup();
    await page.load();

    $('#enabled').checked = false;
    $('#new-word').value = 'Musk';
    $('#add-word').click();
    items()[0].querySelector('button').click(); // drop the default word
    $('#save').click();

    await vi.waitFor(() => expect($('#status').textContent).toBe('Saved.'));
    expect(area.data.settings).toEqual({ enabled: false, words: ['Musk'] });
  });

  it('accepts a document root and falls back to the extension API for storage', async () => {
    const doc = new DOMParser().parseFromString(optionsHtml, 'text/html');
    const page = initOptionsPage(doc); // no options: root is a document, no API in tests

    const settings = await page.load();
    expect(settings).toEqual({ enabled: true, words: ['Trump'] });
    expect(doc.querySelector('#enabled').checked).toBe(true);
    expect(doc.querySelectorAll('#word-list li')).toHaveLength(1);
  });

  it('reports a failed save without crashing', async () => {
    const { page, $, area } = setup();
    await page.load();

    area.set = () => Promise.reject(new Error('disk full'));
    $('#save').click();

    await vi.waitFor(() => expect($('#status').textContent).toBe('Save failed.'));
  });
});
