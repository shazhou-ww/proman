---
"@shazhou/proman-core": minor
"@shazhou/proman": minor
---

feat: optimize smoke test strategy — use package.json smoke script when available

Adds priority-based smoke testing:
1. If a package has a "smoke" script in package.json, run `pnpm run smoke`
2. If no smoke script but has bin entries, fallback to tarball `node <bin> --version`
3. If neither, skip smoke testing entirely

Also adds `--skip-smoke` flag to `proman publish` as an escape hatch.
