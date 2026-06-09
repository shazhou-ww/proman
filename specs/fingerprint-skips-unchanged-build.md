---
scenario: "Build skips unchanged packages via fingerprint cache"
feature: build
tags: [fingerprint, skip, cache]
---

## Given
- Package A was previously built successfully
- `src/**/*.ts`, `package.json`, and `tsconfig.json` are unchanged since last successful build
- Fingerprint cache exists at `.proman/build/@scope-a.fingerprint`

## When
- `proman build` runs (without `--force`)

## Then
- Package A build is skipped
- Logs `⏭ build: @scope/a (unchanged)`
- Other changed packages still build normally
