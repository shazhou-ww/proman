---
'@shazhou/proman-core': patch
'@shazhou/proman': patch
---

Update release workflow for monorepo and fix smoke test workspace deps

**release.yaml v2**: Updated for monorepo structure — uses `proman bump` and
`proman publish` instead of raw `npm version`/`pnpm publish`. Preflight checks
all packages' versions on npm. Publisher verifies `workspace:*` was resolved
correctly after publish.

**smoke-test**: `smokeTestTarball` now accepts `workspacePackages` map and
symlinks workspace dependencies into extracted tarball's `node_modules/`,
fixing smoke test failure for packages with workspace deps (e.g. CLI → core).

**smoke-test parse fix**: Extract `.tgz` filename from pnpm pack verbose output
via regex instead of treating entire stdout as filename.

**docs**: Renamed `lint` → `check` across all documentation and pre-push hook.
