# CLAUDE.md

## Project

@shazhou/proman — CLI for managing TypeScript monorepos.

## Structure

Monorepo with two packages:
- `packages/core/` — @shazhou/proman-core (library)
- `packages/cli/` — @shazhou/proman (CLI)

Core contains config loader, utils, and command logic as pure functions.
CLI parses args and delegates to core functions.

## Commands

`bump`, `publish`, `build`, `deploy`, `test`, `check`, `format`

## Tech

- **TypeScript** — strict mode
- **Core:** TypeScript compilation (`tsc`)
- **CLI:** esbuild bundles `packages/cli/src/cli.ts` → `packages/cli/dist/cli.js`
- **vitest** — tests

## Dependencies

- **Core runtime:** `yaml` (only runtime dependency)
- **Core peer:** `@biomejs/biome`, `typescript`, `vitest`, `vite`, `wrangler`
- **CLI runtime:** `@shazhou/proman-core` (workspace dependency)
- **CLI peer:** same as core

## Config

`proman.yaml` at repo root. See `packages/core/src/config/types.ts` for schema.

## Development

```bash
pnpm build    # builds core then cli
pnpm test     # runs tests in both packages
```

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- Strict TypeScript (no `any`, no implicit returns)
