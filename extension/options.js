/**
 * Options page: edit the enabled flag and the word list, persist to
 * extension storage, and show the local hide counter. All storage access
 * goes through config/compat.
 */
(function (global) {
  'use strict';

  function initOptionsPage(root, options) {
    const opts = options || {};
    const compat = opts.compat || global.WordFilterCompat;
    const config = opts.config || global.WordFilterConfig;
    const storageArea = 'storageArea' in opts ? opts.storageArea : compat.getStorageArea(compat.getExtensionApi());
    const doc = root.nodeType === 9 ? root : root.ownerDocument;

    const enabledInput = root.querySelector('#enabled');
    const wordList = root.querySelector('#word-list');
    const newWordInput = root.querySelector('#new-word');
    const addButton = root.querySelector('#add-word');
    const saveButton = root.querySelector('#save');
    const status = root.querySelector('#status');
    const hiddenCount = root.querySelector('#hidden-count');

    let words = [];

    function setStatus(message) {
      status.textContent = message;
    }

    function render() {
      wordList.textContent = '';
      words.forEach(function (word, index) {
        const item = doc.createElement('li');
        const label = doc.createElement('span');
        label.textContent = word;
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.dataset.index = String(index);
        item.append(label, remove);
        wordList.append(item);
      });
    }

    async function renderStats() {
      try {
        const stats = await config.loadStats(storageArea);
        hiddenCount.textContent = String(stats.hidden);
      } catch (_error) {
        hiddenCount.textContent = '—';
      }
    }

    async function load() {
      try {
        const settings = await config.loadSettings(storageArea);
        enabledInput.checked = settings.enabled;
        words = settings.words;
        render();
        await renderStats();
        setStatus('');
        return settings;
      } catch (_error) {
        const fallback = config.normalizeSettings(null);
        enabledInput.checked = fallback.enabled;
        words = fallback.words;
        render();
        await renderStats();
        setStatus('Could not load settings; showing defaults.');
        return fallback;
      }
    }

    wordList.addEventListener('click', function (event) {
      const target = event.target;
      if (!target || target.tagName !== 'BUTTON' || target.dataset.index === undefined) return;
      words.splice(Number(target.dataset.index), 1);
      setStatus('');
      render();
    });

    addButton.addEventListener('click', function () {
      const value = newWordInput.value.trim();
      if (!value) {
        setStatus('Enter a word first.');
        return;
      }
      if (words.some(function (word) { return word.toLowerCase() === value.toLowerCase(); })) {
        setStatus('That word is already in the list.');
        return;
      }
      words.push(value);
      newWordInput.value = '';
      setStatus('');
      render();
    });

    saveButton.addEventListener('click', async function () {
      try {
        const saved = await config.saveSettings(storageArea, {
          enabled: enabledInput.checked,
          words: words,
        });
        words = saved.words;
        render();
        setStatus('Saved.');
      } catch (_error) {
        setStatus('Save failed.');
      }
    });

    load();

    return { load: load, render: render };
  }

  /* v8 ignore next 5 -- platform bootstrap; runs only inside the real options page */
  if (global.WordFilterCompat && global.WordFilterCompat.getExtensionApi()) {
    const scope = global.document.getElementById('word-filter-options') || global.document.body;
    initOptionsPage(scope);
  }

  global.WordFilterOptions = { initOptionsPage: initOptionsPage };
})(globalThis);
