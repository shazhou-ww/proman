---
id: link-unlink
title: "Link/Unlink for Local Development"
sources:
  - packages/core/src/commands/link.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Link/Unlink for Local Development

## Overview

The `link` and `unlink` commands manage local package development workflows using pnpm's global link mechanism. They allow testing packages locally before publishing without modifying the registry.

## Two Modes

### Provider Mode (no package argument)

```bash
proman link
# → pnpm link --global
```

Registers the current package in pnpm's global store so other projects can consume it. Requires:
- `package.json` with a `name` field
- `dist/` folder must exist (enforces "build before link")

### Consumer Mode (with package argument)

```bash
proman link @shazhou/proman-core
# → pnpm link --global @shazhou/proman-core
```

Links a package from the global registry into the current project's `node_modules`. Validates that the package is listed in `dependencies` or `devDependencies` before linking (prevents linking unrelated packages).

## Unlink

### Specific package

```bash
proman unlink @shazhou/proman-core
# → pnpm unlink @shazhou/proman-core
# → pnpm install @shazhou/proman-core  (restore from registry)
```

### All linked packages

```bash
proman unlink
# Scans node_modules for symlinks → unlinks each → pnpm install
```

The "unlink all" flow:
1. Scans `node_modules/` for symlinked directories (including scoped `@scope/` dirs)
2. Reads each symlink's `package.json` for its name
3. Runs `pnpm unlink <name>` for each
4. Runs `pnpm install` to restore all from registry

## Link Status

```bash
proman link --status
```

Reports all symlinked packages in `node_modules/`:

```
Linked packages:
• @shazhou/proman-core → /home/user/proman/packages/core
```

### Symlink Detection Algorithm

Scans `node_modules/` using `lstatSync`:
- If entry is a symlink → reads its `package.json`, resolves the target path
- If entry is a directory starting with `@` → recurses into it (scoped packages)
- Skips entries with invalid/missing `package.json`

## Validation

| Check | When | Error |
|-------|------|-------|
| `package.json` exists | Always | "Missing package.json in ..." |
| `package.json` is valid JSON object | Always | "Invalid package.json ... expected a JSON object" |
| `name` field exists | Provider mode | "package.json ... is missing a 'name' field" |
| `dist/` exists | Provider mode | "No dist/ folder ... Run `proman build` first" |
| Package in deps | Consumer mode | "Package not found in dependencies or devDependencies" |

## Design Notes

- **Restore from registry** — unlink always restores packages via `pnpm install`, ensuring the project returns to a clean registry-based state.
- **Scope-aware scanning** — handles `@scope/package` by recursing into `@`-prefixed directories.
- **No state file** — link status is derived directly from filesystem symlinks, not a separate tracking file.