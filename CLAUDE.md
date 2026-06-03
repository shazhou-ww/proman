# CLAUDE.md

## Project

@shazhou/proman — CLI for managing TypeScript monorepos.

## Structure

Single package. Source in `src/`, esbuild bundles to `dist/cli.js`.

## Commands

`bump`, `publish`, `build`, `deploy`, `test`, `check`, `format`

## Tech

- **TypeScript** — strict mode
- **esbuild** — bundles `src/cli.ts` → `dist/cli.js`
- **vitest** — tests

## Dependencies

- **Runtime:** `yaml` (only runtime dependency)
- **Peer (externals in esbuild):** `@biomejs/biome`, `typescript`, `vitest`, `vite`, `wrangler`

## Config

`proman.yaml` in project root. See `src/config/types.ts` for schema.

## Development

```bash
pnpm build    # esbuild bundle
pnpm test     # vitest
```

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- Strict TypeScript (no `any`, no implicit returns)
