---
id: init-scaffold
title: "Init Scaffolding"
sources:
  - packages/core/src/commands/init.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Init Scaffolding

## Overview

The `init` command scaffolds a complete monorepo from scratch. It generates a fully functional proman-managed project with two packages (core library + CLI), all configuration files, and a sample test — ready for `pnpm install && proman build`.

## Usage

```bash
proman init [dir]   # defaults to current directory
```

Validates the target directory is empty (throws if not). Creates the directory if it doesn't exist.

## Generated Structure

```
<project>/
├── package.json           # root (private, proman scripts)
├── proman.yaml            # package registry
├── pnpm-workspace.yaml    # workspace definition
├── biome.json             # linter/formatter config
├── tsconfig.json          # root with project references
├── .gitignore
└── packages/
    ├── core/
    │   ├── package.json   # @<project>/core (lib)
    │   ├── tsconfig.json  # composite, extends root
    │   └── src/
    │       ├── index.ts       # hello() function
    │       └── index.test.ts  # vitest test
    └── cli/
        ├── package.json   # @<project>/cli (cli, bin entry)
        ├── tsconfig.json  # composite, references core
        └── src/
            ├── cli.ts         # #!/usr/bin/env node, imports core
            └── cli.test.ts    # placeholder test
```

## Package Name Derivation

`toPackageName(dirName)` sanitizes the directory name into a valid npm package name:
- Lowercase only
- Invalid chars (`[^a-z0-9._-]`) → hyphens
- Strip leading `.`, `_`, `-`
- Collapse consecutive hyphens
- Enforce 214-char npm limit
- Fallback to `'my-project'` if empty

The project name becomes the scope: `@<project>/core`, `@<project>/cli`.

## Root Configuration

### `package.json`
- `private: true` (not publishable)
- `type: "module"` (ESM)
- Scripts delegate to proman: `build`, `test`, `check`, `format`
- DevDependencies: biome, proman, @types/node, typescript, vitest

### `proman.yaml`
- Two packages: `@<project>/core` (lib) + `@<project>/cli` (cli)

### `pnpm-workspace.yaml`
- Workspace: `packages/*`
- `allowBuilds: esbuild: true`

### `biome.json`
- Linter: recommended rules
- Formatter: 2-space indent, 100-char line width, single quotes, no semicolons, trailing commas
- Excludes: dist, node_modules, tests/fixtures, .worktrees

### `tsconfig.json`
- ESNext target/module, bundler resolution, strict mode
- Project references to both packages

### `.gitignore`
- `node_modules`, `dist`, `.proman`, `*.tsbuildinfo`

## Package Templates

### Core (lib)
- ESM exports with types (`./dist/index.d.ts` + `./dist/index.js`)
- Composite tsconfig for project references
- `build` script: `tsc --build`
- Starter `hello()` function with vitest test

### CLI
- `bin` entry pointing to `dist/cli.js` (compiled output)
- `workspace:*` dependency on core
- tsconfig with `references: [{ path: '../core' }]`
- Shebang-prefixed `cli.ts` that imports from core

## Post-Init

1. Attempts `pnpm exec biome format --write .` to format generated JSON (silently ignores failures)
2. Prints next steps: `cd <dir>`, `pnpm install`, `proman build`

## Design Notes

- **Opinionated template** — generates one specific monorepo shape (core + cli). No interactive prompts or template variants.
- **Immediate testability** — the generated project has a test from the start, encouraging TDD.
- **Self-referential** — the generated project uses proman itself as a dev dependency.