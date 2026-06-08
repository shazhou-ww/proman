---
scenario: "Check command runs biome lint"
feature: check
tags: [biome, lint]
---

## Given
- A monorepo with biome configured

## When
- `proman check` runs

## Then
- Executes `pnpm exec biome check .` at project root
- Throws on non-zero exit code
