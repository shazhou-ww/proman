---
"@shazhou/proman": minor
---

feat: fingerprint-based skip for build/test/check

When running `proman build`, `proman test`, or `proman check`, a content-based
fingerprint is computed from source files. If the fingerprint matches a previous
successful run, execution is skipped.

- **build**: per-package fingerprints with dependency propagation (changing `core`
  invalidates `fs` and `cli`)
- **test**: root-level fingerprint covering `src/**`, `tests/**`, `package.json`
- **check**: root-level fingerprint covering `src/**`, `tests/**`, `biome.json`,
  `package.json`

New `--force` flag forces execution even when fingerprints match.
`CI=true` environment variable also forces execution (never skip in CI).

Fingerprint files are stored in `.proman/` (added to `.gitignore`).
