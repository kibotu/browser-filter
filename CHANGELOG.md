# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-09-23

### Fixed

- Content script failed to start with `TypeError: Failed to execute
  'observe' on 'MutationObserver': parameter 1 is not of type 'Node'`,
  leaving pages unfiltered. The controller now resolves `document`
  itself on the real bootstrap path, where no options are passed.
- Startup failures in the content script are now logged to the console
  instead of surfacing only as an unhandled promise rejection.

## [1.0.0] - 2026-09-23

### Changed

- CI runs only on pushes to `main`; pull requests no longer trigger
  workflows.
- Releases are created from unprefixed SemVer tags (`1.0.0`, not
  `v1.0.0`).

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
