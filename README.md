# @shazhou/proman

Project manager CLI for TypeScript monorepos — build, test, lint, format, publish.

## Install

```bash
pnpm add -D @shazhou/proman
```

## Commands

| Command | Description |
|---------|-------------|
| `proman build` | Build each package by type (tsc/vite). Cleans dist + tsbuildinfo before build. |
| `proman test` | Run tests (vitest) |
| `proman check` | Lint with biome |
| `proman format` | Format with biome |
| `proman bump` | Bump package versions (from changesets or --type) |
| `proman publish` | Full release pipeline: build → test → check → publish → changelog → tag → push |
| `proman deploy` | Deploy webui/api packages (wrangler) |

## Configuration

Create `proman.yaml` in your project root:

```yaml
packages:
  - name: '@myorg/core'
    path: packages/core
    type: lib           # lib | cli | api | webui
  - name: '@myorg/cli'
    path: packages/cli
    type: cli

release:
  access: public        # npm access level
  gitTagPrefix: 'v'     # git tag prefix (default: 'v')
```

## Requirements

- **pnpm** (only supported package manager)
- **Node.js** ≥ 18

### Peer Dependencies

Install what you use:

```bash
pnpm add -D @biomejs/biome typescript vitest   # required for check/format, build, test
pnpm add -D vite                                # if you have webui packages
pnpm add -D wrangler                            # if you use deploy
```
