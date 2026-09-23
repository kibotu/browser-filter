# Browser Word Filter

A tiny, local browser extension that hides webpage content
containing configurable words.

No server. No tracking. No analytics.

[![CI](https://github.com/kibotu/browser-filter/actions/workflows/ci.yml/badge.svg)](https://github.com/kibotu/browser-filter/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/kibotu/browser-filter)](https://github.com/kibotu/browser-filter/releases/latest)

## What it does

When a page contains a configured word (default: `Trump`), the extension
hides the smallest useful piece of content around it — an `article`,
`section`, `li`, or `main` — and keeps doing so for content added later
by dynamic pages. Non-matching content is untouched.

## Features

- Local-only processing: everything runs in your browser.
- Configurable word list with a small options page.
- Case-insensitive whole-word matching (`Trump` matches `Trump's`, not `trumpet`).
- Dynamic content filtering via `MutationObserver`.
- Reversible: hidden content is marked with a CSS class, never deleted.
- Chrome and Firefox from one codebase (Manifest V3).
- Zero runtime dependencies, automated tests, reproducible builds.

## Install

### Chrome

1. Download the latest `browser-word-filter-chrome.zip` from [Releases](https://github.com/kibotu/browser-filter/releases/latest).
2. Extract it.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `extension` directory.

### Firefox

1. Download the latest `browser-word-filter-firefox.zip` from [Releases](https://github.com/kibotu/browser-filter/releases/latest).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` inside the extracted `extension` directory.

Open any webpage containing a configured word. Matching content will be
hidden automatically. Change the word list via the extension's
options page.

## Development

```bash
git clone https://github.com/kibotu/browser-filter.git
cd browser-filter
npm ci
npm test
npm run build
```

Generated packages appear in:

```text
dist/
├── chrome/
│   └── browser-word-filter-chrome.zip
└── firefox/
    └── browser-word-filter-firefox.zip
```

To try the extension locally, load `extension/` unpacked (Chrome) or
temporary (Firefox) — no build required.

### Scripts

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run lint`      | ESLint over all JavaScript                     |
| `npm test`          | Vitest unit, DOM, mutation, and config tests   |
| `npm run coverage`  | Tests with coverage thresholds enforced       |
| `npm run validate`  | JSON, manifest schema, source hygiene, ZIPs    |
| `npm run build`     | Reproducible Chrome + Firefox archives         |
| `npm run icons`     | Regenerate extension icons (no dependencies)   |

## Testing

Vitest with jsdom. Coverage thresholds are enforced and CI fails below
them:

```text
Statements: 90%   Branches: 85%   Functions: 90%   Lines: 90%
```

Current results are comfortably above these; run `npm run coverage`
for the report.

## Build

`npm run build` validates the manifest, stamps the version from
`package.json` (the single source of truth), and writes both archives.
The build is reproducible: fixed timestamps, sorted entries, no
nondeterministic inputs — two builds of the same tree are
byte-identical.

## Architecture

```text
options page ──> extension.storage <── content script
                                        ├── scan DOM
                                        ├── match text (whole-word)
                                        ├── pick smallest boundary
                                        │   (article / section / li / main)
                                        └── add .word-filter-hidden
                                        MutationObserver ──> scan added subtrees
```

| File                | Role                                              |
| ------------------- | ------------------------------------------------- |
| `extension/matcher.js` | Whole-word, case-insensitive matching         |
| `extension/filter.js`  | DOM scan, content boundaries, hide/restore     |
| `extension/content.js` | Orchestration: settings, observer, batching    |
| `extension/config.js`  | Defaults, normalisation, persistence           |
| `extension/compat.js`  | `browser`/`chrome` + callback/promise wrapper  |
| `extension/options.js` | Options page UI                                |

## Privacy

Filtering happens locally in the browser. The extension does not
transmit page contents, URLs, browsing history, or filter results to a
server.

There is no backend, no telemetry, no analytics, and no remote code.
The build fails if shipped sources gain a network call, `eval`, or
page-storage access.

## Permissions

| Permission               | Why                                                        |
| ------------------------ | ---------------------------------------------------------- |
| `storage`                | Persist your settings (`enabled` flag and word list).      |
| Content scripts on `http://*/*`, `https://*/*` | The extension's purpose is to inspect and modify webpage DOM content. |

Not requested: `tabs`, `cookies`, browsing history, bookmarks,
downloads, account information, host permissions, network access.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Keep it small, keep it local,
avoid unnecessary dependencies.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
