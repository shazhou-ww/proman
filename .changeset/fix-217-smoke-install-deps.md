---
"@shazhou/proman-core": patch
---

fix(publish): install production dependencies before running bin in tarball smoke test

The tarball smoke test (`smokeTestTarball`) extracted the package and symlinked
workspace dependencies, but never installed external (registry) dependencies. CLI
bins importing packages like `@ocas/cli-kit` failed at runtime with
`ERR_MODULE_NOT_FOUND`. The fix runs `pnpm install --prod` in the extracted
`package/` directory after the workspace-symlink step and before executing any
`node <bin> --version`. A non-zero install exit aborts the smoke test before the
bin runs (and before `npm publish`), with cleanup still handled in `finally`.
