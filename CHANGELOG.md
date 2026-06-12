# @shazhou/proman

## 0.8.0 (2026-06-12)

### Features

- **proman init** — Scaffold new pnpm monorepos with two example packages, pre-configured build/test/check/format
- **proman link / unlink** — Local package linking workflow based on pnpm link, with build verification and symlink detection

### Fixes

- Add runtime validation to `readPackageJson` in link.ts to reject non-object JSON values
- Fix workflow schema inconsistencies and improve token extraction robustness
- Consolidate `runOrThrow` helper (internal refactor, no user-facing changes)


## v0.7.0 (2026-06-09)

### feat

- Fingerprint-based skip for build/test/check. Adds content-hash fingerprinting to `proman build`, `proman test`, and `proman check`. When source files haven't changed since the last successful run, execution is skipped.
  - New `--force` flag to bypass fingerprint cache
  - CI environments (`CI=true`) always force-run (never skip)
  - Per-package fingerprints for build with dependency propagation
  - Root-level fingerprints for test and check
  - Fingerprints stored in `.proman/<cmd>/` (already gitignored)
  - Fingerprint only written after successful execution (failure = no cache)

## 0.6.4

### fix

- Move CHANGELOG generation and changeset file deletion from publish to bump
- chmod +x bin entries after build — prevents `Permission denied` after tsc rebuild
- Skip private packages during publish (#61, #62)
- Skip already-published packages instead of aborting (#66, #67)

### refactor

- Simplify publish loop, eliminate indexOf reference dependency (#64)

### chore

- Add pre-push hook for lint + test (#63)
