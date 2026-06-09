---
scenario: "Build dispatches tsc per package in topological order"
feature: build
tags: [tsc, package-order]
---

## Given
- A monorepo with multiple packages defined in proman.yaml
- Packages have type: lib, cli, webui, or api

## When
- `proman build` runs

## Then
- Each package builds via `pnpm exec tsc --build` (lib, cli, api) or `pnpm exec vite build` (webui)
- Build order follows proman.yaml declaration order (assumed topo-sorted)
- `dist/` directory and `*.tsbuildinfo` files are cleaned before each package's build step
