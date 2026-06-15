---
id: config-system
title: "Config Loading and Validation"
sources:
  - packages/core/src/config/types.ts
  - packages/core/src/config/load-config.ts
  - packages/core/src/config/validate-config.ts
  - packages/core/src/config/index.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Config Loading and Validation

## Overview

proman is configured by a single `proman.yaml` file at the monorepo root. The config system follows a strict **load → validate → defaults** pipeline that produces a fully-typed `PromanConfig` object consumed by all commands.

## Type Schema

```typescript
type PackageType = 'lib' | 'cli' | 'webui' | 'api'

type PackageEntry = {
  name: string       // npm package name (e.g. "@shazhou/proman-core")
  path: string       // relative path from repo root (e.g. "packages/core")
  type: PackageType  // determines build/deploy strategy
  private?: boolean  // if true, excluded from publish
}

type ReleaseConfig = {
  registry?: string       // npm registry URL
  access?: 'public' | 'restricted'
  gitTagPrefix?: string   // prefix for git tags (e.g. "v")
}

type PromanConfig = {
  packages: PackageEntry[]
  release?: ReleaseConfig
}
```

The `PackageType` is the key discriminant — it drives strategy selection in `build`, `deploy`, `check`, and `format` commands:

| Type | Build | Deploy | Use case |
|------|-------|--------|----------|
| `lib` | `tsc` | — | Library packages |
| `cli` | esbuild | — | CLI executables |
| `webui` | vite | Cloudflare Pages | Frontend apps |
| `api` | — | Cloudflare Workers | API services |

## Loading Pipeline

`loadConfig(cwd?)` in `load-config.ts`:

1. **Resolve path** — `resolve(cwd, 'proman.yaml')`. Throws if file doesn't exist.
2. **Parse YAML** — uses the `yaml` package (only runtime dependency of core).
3. **Validate** — calls `validateConfig(raw)` which returns typed `PromanConfig` or throws.
4. **Apply defaults** — fills in missing release settings.

```
proman.yaml → yaml.parse() → validateConfig() → applyDefaults() → PromanConfig
```

## Validation Strategy

`validateConfig()` is a **pure function** — no side effects, no mutations, no defaults. It:

- Verifies the top-level value is a plain object
- Requires `packages` to be a non-empty array
- Validates each package entry individually (name, path required; type defaults to `'lib'` if omitted; private must be boolean if present)
- Validates `release` section if present (registry, access, gitTagPrefix field types)
- Returns a fresh typed object (never returns the input reference)

All validation errors use a consistent `"Invalid proman config: ..."` prefix for grep-ability.

## Defaults

Applied after validation in `applyDefaults()`:

| Field | Default |
|-------|---------|
| `release.registry` | `https://registry.npmjs.org` |
| `release.gitTagPrefix` | `v` |
| `release.access` | not set (npm decides based on scope) |

## Module Boundary

The `config/index.ts` barrel exports:
- `loadConfig` — the full pipeline (for command consumers)
- `validateConfig` — the pure validator (for testing, or validation-only use)
- All types: `PackageEntry`, `PackageType`, `PromanConfig`, `ReleaseConfig`

Most commands call `loadConfig()` at the start with no arguments, relying on `process.cwd()` being the monorepo root.

## Design Decisions

- **No schema library** — validation is hand-written for zero dependencies and clear error messages. The config surface is small enough that this stays maintainable.
- **Separation of validation and defaults** — `validateConfig` can be tested with minimal inputs; `applyDefaults` only fills truly optional fields.
- **PackageType as string union** — no enum, avoids TypeScript enum pitfalls while staying strict.