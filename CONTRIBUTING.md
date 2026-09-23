# Contributing

Thanks for helping improve Browser Word Filter.

## Workflow

1. Fork the repository.
2. Create a branch.
3. `npm ci`
4. `npm test`
5. `npm run lint`
6. `npm run build`
7. Open a pull request.

Pull requests should pass all CI checks before merging.

## Guidelines

- Keep contributions focused and avoid unnecessary dependencies.
- Runtime dependencies should stay at zero.
- New behavior needs tests; bug fixes need a regression test.
- Coverage thresholds are enforced in CI (statements 90%, branches
  85%, functions 90%, lines 90%). Tests must exercise real behavior —
  do not write tests that only chase numbers.
- The extension must remain fully local: no network calls, no remote
  code, no telemetry. `npm run validate` enforces this.
- Match the existing style: plain JavaScript, no framework, no bundler.

## Reporting issues

Open an issue with reproduction steps, the browser and version, and
what you expected versus what happened. For security issues, see
[SECURITY.md](SECURITY.md) — do not file them publicly.
