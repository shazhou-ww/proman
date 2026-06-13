# proman — Shazhou pnpm Monorepo Dev Scaffold

## Overview

proman is the standard development toolchain for Shazhou team pnpm monorepos. It wraps the full lifecycle — building, testing, linting, version bumping, publishing to npm, and deploying to Cloudflare — into a single CLI driven by a `proman.yaml` config file.

**Install:** `pnpm add -g @shazhou/proman`

## When to Use

- Building, testing, or linting a Shazhou monorepo
- Bumping versions (changeset-based or manual)
- Publishing packages to npm with changelog generation
- Deploying webui/api packages via wrangler
- Any dev workflow in a repo that has a `proman.yaml`

## Quick Start

```bash
# Build all packages (tsc for lib/cli, vite for webui)
proman build

# Run tests
proman test

# Lint
proman check

# Bump versions from changesets
proman bump

# Publish (build → test → publish → changelog → git tag → push)
proman publish
```

## Configuration

proman reads `proman.yaml` from the project root. Example:

```yaml
packages:
  - name: "@myorg/core"
    path: packages/core
    type: lib          # lib | cli | webui | api

  - name: "@myorg/web"
    path: packages/web
    type: webui

  - name: "@myorg/api"
    path: packages/api
    type: api

release:
  registry: https://registry.npmjs.org   # default
  access: public                          # public | restricted
  gitTagPrefix: v                         # default: "v"
```

### Package Types

| Type | Build | Deploy |
|------|-------|--------|
| `lib` | `tsc` | n/a |
| `cli` | `tsc` | n/a |
| `webui` | `vite build` | `wrangler pages deploy` |
| `api` | n/a | `wrangler deploy` |

## CLI Reference

### Development

```bash
proman build              # build each package by its type
proman test               # run vitest
proman check              # lint with biome
proman format             # format with biome
```

### Version Management

```bash
proman bump               # apply pending changesets (only bumps mentioned packages)
proman bump --type patch  # force bump ALL packages (major | minor | patch)
```

Changesets live in `.changeset/` and follow the standard changeset format.

**Versioning is always independent.** Each changeset specifies which packages to bump and by how much:

```yaml
---
"@myorg/core": minor
"@myorg/cli": patch
---
Fix core bug and update CLI
```

- `proman bump` (no `--type`): only bumps packages mentioned in changesets; others stay unchanged.
- `proman bump --type patch`: overrides and bumps **all** packages uniformly.
- `proman publish`: only tags packages that were actually bumped.

### Publishing

```bash
proman publish            # full pipeline: build → test → publish → changelog → tag → push
proman publish --skip-tests   # skip the test step
```

The publish pipeline:
1. Runs `proman build`
2. Runs `proman test` (unless `--skip-tests`)
3. Publishes changed packages to the configured registry
4. Generates/updates CHANGELOG.md
5. Creates git tags for bumped packages (`@myorg/core@v1.2.3`)
6. Pushes commits and tags

### Deployment

```bash
proman deploy                       # deploy all webui/api packages
proman deploy --package my-app      # deploy a single package
proman deploy --env staging         # target a wrangler environment
```

## Global Flags

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

## Common Pitfalls

1. **Missing `proman.yaml`** — proman requires this file in the project root. It won't fall back to package.json.
2. **Wrong package type** — `webui` expects vite, `lib`/`cli` expect tsc. Mismatched types cause build failures.
3. **Forgetting changesets** — `proman bump` with no pending changesets is a no-op. Create changesets before bumping.
4. **`workspace:*` in published packages** — proman handles this automatically during publish, converting workspace protocol to real versions.
