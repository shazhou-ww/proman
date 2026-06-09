---
scenario: "Test command runs vitest"
feature: test
tags: [vitest]
---

## Given
- A monorepo with vitest configured

## When
- `proman test` runs

## Then
- Executes `pnpm exec vitest run` at project root
- Throws on non-zero exit code
