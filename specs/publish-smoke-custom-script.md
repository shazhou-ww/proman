---
scenario: "Use package.json smoke script when available"
feature: publish
tags: [smoke-test, custom-script, e2e]
---

## Given
- A package has a `"smoke"` script in its package.json `scripts` field (e.g. `"scripts": { "smoke": "vitest run __tests__/smoke.test.ts" }`)
- The package may or may not have `bin` entries

## When
- `proman publish` runs the smoke test phase for this package

## Then
- proman detects the `"smoke"` script in package.json
- proman runs `pnpm run smoke` in the package directory (NOT the tarball extraction)
- If `pnpm run smoke` exits with code 0, the smoke test passes and publishing proceeds
- If `pnpm run smoke` exits non-zero, proman aborts the publish pipeline with an error message including the script output
- The old tarball-based `node <bin> --version` strategy is NOT used (custom script takes priority)
