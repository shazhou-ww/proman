---
"@shazhou/proman": minor
---

feat: fingerprint-based skip for build/test/check

Add content-hash fingerprinting to `proman build`, `proman test`, and `proman check`.
When source files haven't changed since the last successful run, execution is skipped.

- New `--force` flag to bypass fingerprint cache
- CI environments (`CI=true`) always force-run (never skip)
- Per-package fingerprints for build with dependency propagation
- Root-level fingerprints for test and check
- Fingerprints stored in `.proman/<cmd>/` (already gitignored)
- Fingerprint only written after successful execution (failure = no cache)
