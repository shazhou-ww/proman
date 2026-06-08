---
scenario: "Build dispatches tsc per package in topological order"
feature: build
tags: [tsc, package-order]
---

## Given
- A monorepo with multiple packages defined in proman.yaml
- Packages have type: node-runtime, pnpm, or webui

## When
- `proman build` runs

## Then
- Each package builds via `pnpm exec tsc --build` (node-runtime, pnpm) or `pnpm exec vite build` (webui)
- Build order follows proman.yaml declaration order (assumed topo-sorted)
- dist/ and tsbuildinfo are cleaned before each package build
