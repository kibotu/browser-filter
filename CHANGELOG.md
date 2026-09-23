# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-23

### Added

- Initial release.
- Case-insensitive whole-word filtering with a configurable word list
  (default: `Trump`).
- Smallest-useful-boundary hiding (`article`, `[role="article"]`,
  `section`, `li`, `main`) with a safe fallback; `body`/`html` are never
  hidden.
- Dynamic content filtering through a batched `MutationObserver`.
- Options page: enable/disable toggle, add/remove words, persistent
  storage via `chrome.storage`/`browser.storage`.
- Chrome and Firefox Manifest V3 packages, built reproducibly.
- Vitest suite (matcher, DOM, mutation, configuration, options)
  with enforced coverage thresholds.
- Static validation: manifest schema, source hygiene (no network, no
  remote code), ZIP integrity.
- GitHub Actions CI and tag-driven releases with attached packages.
