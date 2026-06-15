---
id: deploy
title: "Deploy Command"
sources:
  - packages/core/src/commands/deploy.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Deploy Command

## Overview

The `deploy` command deploys packages to Cloudflare infrastructure using `wrangler`. It only operates on packages typed `webui` or `api` — all other package types are non-deployable.

## Deployment Strategies by Type

| Package Type | Wrangler Command | Target |
|--------------|-----------------|--------|
| `webui` | `wrangler pages deploy dist` | Cloudflare Pages |
| `api` | `wrangler deploy` | Cloudflare Workers |

## Targeting

### All deployable packages (default)

```bash
proman deploy
```

Filters `proman.yaml` packages to those with `type: webui` or `type: api`, then deploys each in order.

### Single package (`--package`)

```bash
proman deploy --package @shazhou/my-app
```

Validates:
1. Package exists in config
2. Package type is `webui` or `api` (throws otherwise with a clear message)

## Environment Support

The `--env` flag is passed through to wrangler for environment-specific deploys (e.g., `staging`):

```bash
proman deploy --env staging
# → wrangler pages deploy dist --env staging
# → wrangler deploy --env staging
```

## Execution

Each package is deployed from its own directory (`resolve(cwd, pkg.path)`). The command uses `pnpm exec wrangler` to invoke the locally-installed wrangler binary, and `runOrThrow` to fail fast on non-zero exit codes.

## Options

```typescript
type DeployCommandOptions = {
  cwd: string       // monorepo root
  pkg?: string      // optional: deploy only this package
  env?: string      // optional: wrangler environment
  spawn?: SpawnFn   // injectable for testing
}
```

## Design Notes

- **Minimal logic** — the deploy command is a thin dispatcher to wrangler. No build step, no pre-checks (assumes `proman build` was already run).
- **Type guard** — explicitly rejects attempts to deploy `lib` or `cli` packages rather than silently skipping them.
- **Sequential** — packages deploy one at a time in config order (no parallelism).