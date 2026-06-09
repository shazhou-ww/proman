# @shazhou/proman

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
