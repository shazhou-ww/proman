---
scenario: "Proman runs its own tests using proman test command"
feature: test
tags: [dogfooding, monorepo, self-bootstrap]
---

## Given
- `proman.yaml` exists at repo root
- Both packages have vitest configured
- Test files exist in `packages/core/src/**/*.test.ts` and `packages/cli/src/**/*.test.ts`

## When
- Run test command:
  ```bash
  proman test
  ```

## Then
- Tests run for both core and cli packages
- Vitest is invoked per package
- Test results are aggregated and displayed
- Exit code is 0 if all tests pass
- Exit code is non-zero if any test fails
