# Browser Word Filter

## 1. Goal

Create an open-source Chrome/Firefox extension that locally hides webpage content containing configured words.

The initial default configuration contains:

```text
Trump
```

The filtering engine itself must be generic and support arbitrary user-configured words.

### Core properties

* Local-only processing.
* No backend.
* No telemetry.
* No analytics.
* No external API calls.
* Chrome + Firefox.
* Apache License 2.0.
* Automated tests.
* Automated GitHub Actions verification.
* Reproducible extension builds.
* Minimal installation steps.

---

# 2. Repository Quality Bar

The repository should be something a developer can clone and understand in under five minutes.

```text
browser-word-filter/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── extension/
│   ├── manifest.json
│   ├── content.js
│   ├── styles.css
│   ├── options.html
│   ├── options.js
│   ├── options.css
│   └── icons/
│       ├── 16.png
│       ├── 48.png
│       └── 128.png
│
├── test/
│   ├── matcher.test.js
│   ├── filter.test.js
│   ├── dom.test.js
│   └── fixtures/
│       ├── static.html
│       └── dynamic.html
│
├── scripts/
│   ├── build.mjs
│   └── validate.mjs
│
├── package.json
├── package-lock.json
├── eslint.config.js
├── vitest.config.js
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── LICENSE
├── NOTICE
└── .gitignore
```

Avoid a framework unless it provides a concrete benefit. Plain JavaScript is sufficient for the MVP.

---

# 3. Technology

## Runtime

* JavaScript
* WebExtensions API
* Manifest V3
* CSS
* DOM APIs
* `MutationObserver`

## Development

* Node.js LTS
* npm
* Vitest
* ESLint

No bundler is required unless it materially simplifies cross-browser packaging.

---

# 4. Extension Architecture

```text
                    ┌─────────────────────┐
                    │    Options page     │
                    │                     │
                    │  enabled            │
                    │  word list          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ extension.storage   │
                    └──────────┬──────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────┐
│                       Web page                           │
│                                                          │
│  Content script                                          │
│      │                                                   │
│      ├── load configuration                               │
│      ├── scan DOM                                        │
│      ├── match text                                      │
│      ├── select content boundary                         │
│      └── hide element                                    │
│                                                          │
│                 MutationObserver                         │
│                         │                                │
│                         └──────> scan added content      │
└──────────────────────────────────────────────────────────┘
```

There should be no remote component.

---

# 5. Matching Semantics

The initial matcher is intentionally simple.

`Trump` matches:

```text
Trump
trump
TRUMP
Trump's
```

It should not match:

```text
trumped
trumper
trumpet
```

Use case-insensitive whole-word matching.

The matcher must be independently unit-tested.

Example API:

```js
matchesWord(text, words)
```

and:

```js
createMatcher(words)
```

User-supplied terms must be escaped before being incorporated into regular expressions.

---

# 6. DOM Filtering

The extension should:

1. Find matching text nodes.
2. Ignore non-visible/non-content nodes.
3. Identify an appropriate containing element.
4. Hide that element.
5. Avoid repeatedly processing the same element.

Candidate content boundaries:

```text
article
[role="article"]
section
li
main
```

The implementation should prefer the **smallest useful content boundary**.

If no useful boundary exists, fall back to the immediate element containing the matching text.

Do not blindly hide `body`, `html`, or a large page container merely because a descendant contains a match.

---

# 7. Dynamic Pages

Use `MutationObserver`.

Initial page:

```text
DOMContentLoaded
        ↓
initial scan
```

Later content:

```text
DOM mutation
     ↓
MutationObserver
     ↓
added subtree
     ↓
scan only that subtree
```

Do not repeatedly scan the entire document.

Mutation processing should be batched where necessary to avoid pathological behavior on highly dynamic sites.

---

# 8. Hidden State

Use a CSS class:

```css
.word-filter-hidden {
  display: none !important;
}
```

Never permanently rewrite or delete page content.

The DOM should remain recoverable if filtering is disabled or the extension is removed.

The extension should mark processed elements using either a class or an internal mechanism rather than maintaining an unbounded JavaScript array of DOM references.

---

# 9. Configuration

Default:

```json
{
  "enabled": true,
  "words": ["Trump"]
}
```

The options UI should initially contain:

```text
Word Filter

[x] Enabled

Words

Trump
[ Remove ]

[ Add word ]

[ Save ]
```

The engine must not contain hard-coded political logic.

The default word is configuration, not filtering logic.

Use extension storage rather than `window.localStorage`. Chrome's extension Storage API is specifically intended for persistent extension state and is accessible from extension contexts including content scripts.

---

# 10. Browser Compatibility

Use a small compatibility wrapper where Chrome/Firefox APIs differ.

Prefer:

```js
browser
```

where supported, with a minimal fallback to:

```js
chrome
```

Do not duplicate the filtering implementation for each browser.

The repository should produce:

```text
dist/
├── chrome/
│   └── browser-word-filter-chrome.zip
└── firefox/
    └── browser-word-filter-firefox.zip
```

The build script should validate manifests before creating archives.

---

# 11. Permissions

Request the minimum permissions necessary.

Do not request:

* tabs
* cookies
* browsing history
* bookmarks
* downloads
* account information
* network access
* unnecessary host permissions

The extension requires page access because its purpose is to inspect and modify webpage DOM content.

Keep permissions explicit and documented in the README.

Chrome's extension manifest uses `content_scripts` to specify scripts that execute on matching pages.

---

# 12. Test Strategy

Testing is a P0 requirement.

## Unit tests

### Matcher

Test:

* exact match;
* lowercase;
* uppercase;
* mixed case;
* punctuation;
* word boundaries;
* multiple words;
* regex metacharacters;
* empty configuration;
* invalid/empty terms.

Example:

```text
"Trump announced..."       → match
"TRUMP announced..."       → match
"trump announced..."       → match
"trumped the opponent"     → no match
"trumpet player"           → no match
```

## DOM tests

Test:

* matching text gets hidden;
* non-matching text remains visible;
* nested matching text;
* multiple matches;
* multiple independent articles;
* already-hidden elements;
* scripts/styles ignored;
* no accidental `<body>` hiding.

## Mutation tests

Test:

1. Create page.
2. Start observer.
3. Insert matching element.
4. Flush mutation queue.
5. Assert element becomes hidden.

## Configuration tests

Test:

* default settings;
* loading settings;
* saving settings;
* disabling filtering;
* changing words;
* malformed settings fallback.

---

# 13. Coverage Requirements

Use Vitest coverage.

Minimum thresholds:

```text
Statements: 90%
Branches:   85%
Functions:  90%
Lines:      90%
```

Coverage applies to application code, excluding generated/build artifacts.

A pull request must fail CI if coverage falls below the configured threshold.

Do not chase coverage by writing meaningless tests. The goal is exercising actual filtering behavior.

---

# 14. Static Validation

CI must validate:

* JSON syntax;
* manifest schema;
* JavaScript linting;
* tests;
* coverage;
* extension build;
* generated ZIP files;
* no unexpected network dependencies.

A build failure must produce a non-zero exit code.

---

# 15. GitHub Actions

## `ci.yml`

Run on:

```text
push to main
```

Pull requests are not a trigger; CI runs on `main` after merge.

Pipeline:

```text
checkout
   ↓
setup Node
   ↓
npm ci
   ↓
npm run lint
   ↓
npm test -- --coverage
   ↓
npm run validate
   ↓
npm run build
   ↓
verify generated artifacts
```

CI should run on at least:

```text
ubuntu-latest
```

A matrix across multiple Node LTS versions can be added once the project is stable.

---

# 16. Release Automation

`release.yml` should run when a version tag is pushed (tags use the
bare SemVer form, no `v` prefix):

```text
0.1.0
0.2.0
1.0.0
```

Pipeline:

```text
checkout
   ↓
npm ci
   ↓
tests
   ↓
coverage
   ↓
build Chrome package
   ↓
build Firefox package
   ↓
create GitHub Release
   ↓
attach ZIP artifacts
```

The GitHub release should contain the exact packages users can install manually.

Do not publish an artifact that has not passed the same CI verification as a normal pull request.

---

# 17. README

The README should optimize for immediate success.

Opening section:

```text
# Browser Word Filter

A tiny, local browser extension that hides webpage content
containing configurable words.

No server. No tracking. No analytics.
```

Then immediately:

## Install

### Chrome

1. Download the latest `browser-word-filter-chrome.zip` from Releases.
2. Extract it.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `extension` directory.

### Firefox

1. Download the latest Firefox package from Releases.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json`.

Then:

> Open any webpage containing a configured word. Matching content will be hidden automatically.

For development, provide the shortest possible path:

```bash
git clone <repository>
cd browser-word-filter
npm ci
npm test
npm run build
```

Then explain where the generated packages are located.

---

# 18. README Contents

Keep the README concise but complete:

1. What it does
2. Features
3. Installation
4. Development
5. Testing
6. Build
7. Architecture
8. Privacy
9. Permissions
10. Contributing
11. License

Include badges for:

```text
CI
Coverage
License
Latest Release
```

Do not add badges that require external services unless they provide useful information.

---

# 19. Privacy Statement

The repository should explicitly state:

> Filtering happens locally in the browser. The extension does not transmit page contents, URLs, browsing history, or filter results to a server.

That statement must remain true.

If telemetry is ever introduced, the privacy model must be revised before implementation.

---

# 20. Security

`SECURITY.md` should provide:

* supported versions;
* how to report a vulnerability;
* expected response process;
* reminder not to include sensitive information in public issues.

The extension should have no remote code execution, remote configuration, or remotely loaded JavaScript.

---

# 21. Contributing

`CONTRIBUTING.md` should specify:

```text
1. Fork repository.
2. Create branch.
3. npm ci
4. npm test
5. npm run lint
6. npm run build
7. Open pull request.
```

Pull requests should pass all CI checks before merging.

Keep contributions focused and avoid unnecessary dependencies.

---

# 22. Dependency Policy

Keep runtime dependencies at zero if practical.

Development dependencies should be limited to:

* Vitest
* coverage provider
* ESLint
* required ESLint plugins

Run:

```bash
npm audit
```

in CI as informational initially.

Do not make transient advisory database failures block otherwise-valid builds unless the project explicitly adopts that policy.

---

# 23. License

Use Apache License 2.0.

Repository root:

```text
LICENSE
```

containing the complete Apache 2.0 license text.

Add appropriate copyright attribution.

Apache's own guidance recommends including the license text in a `LICENSE` file when applying Apache 2.0.

Include `NOTICE` if required by included third-party material.

All dependencies and assets must have licenses compatible with redistribution.

---

# 24. Versioning

Use Semantic Versioning:

```text
0.1.0
0.1.1
0.2.0
1.0.0
```

Keep `package.json` and extension manifests synchronized.

Prefer one source of truth for the version and generate the manifest version during build if necessary.

---

# 25. Git Hygiene

`.gitignore`:

```text
node_modules/
coverage/
dist/
.DS_Store
*.log
.env
```

Never commit:

* build artifacts;
* local browser profiles;
* credentials;
* API keys;
* screenshots containing private information.

---

# 26. Definition of Done

The repository is release-ready when all of the following are true:

* [ ] Chrome extension works locally.
* [ ] Firefox extension works locally.
* [ ] `Trump` is hidden by default.
* [ ] Matching is case-insensitive.
* [ ] Whole-word semantics work.
* [ ] Dynamic content is filtered.
* [ ] Filtering occurs locally.
* [ ] No runtime network requests exist.
* [ ] Settings are persistent.
* [ ] Word list is configurable.
* [ ] Unit tests exist.
* [ ] DOM tests exist.
* [ ] MutationObserver tests exist.
* [ ] Configuration tests exist.
* [ ] Coverage exceeds configured thresholds.
* [ ] ESLint passes.
* [ ] Manifest validation passes.
* [ ] Chrome package builds successfully.
* [ ] Firefox package builds successfully.
* [ ] GitHub Actions verifies pull requests.
* [ ] GitHub Actions produces release artifacts.
* [ ] README provides minimal installation instructions.
* [ ] SECURITY.md exists.
* [ ] CONTRIBUTING.md exists.
* [ ] CHANGELOG.md exists.
* [ ] Apache 2.0 `LICENSE` exists.
* [ ] Third-party licenses are documented.
* [ ] No secrets are present.
* [ ] Repository contains no unnecessary framework or service dependency.

---

# 27. Engineering Principle

Keep the project deliberately small.

The MVP should solve one problem extremely reliably:

```text
configured word appears in webpage
              ↓
        content disappears
```

Do not prematurely introduce:

* AI;
* semantic analysis;
* OCR;
* per-site integrations;
* cloud services;
* accounts;
* telemetry;
* complex UI;
* browser-specific implementations.

The repository should be easy to audit, easy to fork, easy to test, and easy to remove.

The political meaning of any particular configured word is outside the filtering engine. The software implements a generic local word-filtering mechanism; the default configuration is simply part of the shipped configuration.
