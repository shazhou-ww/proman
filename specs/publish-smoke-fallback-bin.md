---
scenario: "Fallback to node bin --version when no smoke script exists"
feature: publish
tags: [smoke-test, fallback, bin]
---

## Given
- A package has NO `"smoke"` script in its package.json `scripts` field
- The package HAS a `bin` entry in package.json (e.g. `"bin": {"proman": "./dist/cli.js"}`)

## When
- `proman publish` runs the smoke test phase for this package

## Then
- proman falls back to the existing tarball-based smoke test strategy:
  1. Runs `pnpm pack` to create the tarball
  2. Extracts tarball to a temp directory (`package/` subdir)
  3. Symlinks workspace dependencies into node_modules
  4. Runs `pnpm install --prod` in the extracted `package/` dir to install external deps
  5. Executes `node <bin-path> --version` for each bin entry
  6. Cleans up temp directory and tarball
- If any bin command exits non-zero, proman aborts the publish pipeline
- The `pnpm install --prod` step (4) ensures external imports (e.g. `@ocas/cli-kit`)
  resolve at runtime instead of failing with `ERR_MODULE_NOT_FOUND`
