# @shazhou/proman

Project manager CLI for TypeScript monorepos — build, test, check, format, publish.

Proman is itself a monorepo consisting of:
- `@shazhou/proman-core` — Core library with config loader, utils, and command logic
- `@shazhou/proman` — CLI that delegates to core

## Install

```bash
pnpm add -D @shazhou/proman
```

## Quick Start

Create a new monorepo:

```bash
pnpm dlx @shazhou/proman init my-project
cd my-project
pnpm install
pnpm run build
```

This scaffolds a ready-to-use monorepo with two example packages (core library + CLI).

## Commands

| Command | Description |
|---------|-------------|
| `proman init [dir]` | Scaffold a new monorepo (default: current directory) |
| `proman build` | Build each package by type (tsc/vite). Cleans dist + tsbuildinfo before build. |
| `proman test` | Run tests (vitest) |
| `proman check` | Lint with biome |
| `proman format` | Format with biome |
| `proman link [package]` | Link local package for development (see Link section) |
| `proman unlink [package]` | Unlink and restore packages from registry |
| `proman bump` | Bump package versions (from changesets or --type), generate CHANGELOG.md, delete consumed changesets |
| `proman publish` | Full release pipeline: build → test → check → smoke test tarball → publish → tag → push |
| `proman deploy` | Deploy webui/api packages (wrangler) |

### Deploy

Deploy webui (Cloudflare Pages) and api (Cloudflare Workers) packages via wrangler.

```bash
proman deploy                    # deploy all webui/api packages
proman deploy --package @myorg/web  # deploy a single package
proman deploy --env staging      # deploy to a specific wrangler environment
```

| Flag | Description |
|------|-------------|
| `--package <name>` | Deploy only the named package (must be type webui or api) |
| `--env <env>` | Wrangler environment to deploy to (e.g. staging, production) |

### Init

Scaffold a new monorepo with a working example structure:

```bash
proman init my-project    # creates my-project/ with full monorepo structure
proman init               # scaffolds in current directory
```

The generated monorepo includes:
- **packages/core** — Example library package with TypeScript + vitest
- **packages/cli** — Example CLI package that depends on core
- **Root config** — proman.yaml, pnpm-workspace.yaml, biome.json, tsconfig.json
- **Ready to run** — All build/test/check/format scripts work out of the box

After init:
```bash
cd my-project      # if you used a directory argument
pnpm install       # install dependencies
proman build       # build all packages
proman test        # run tests
```

### Link

Link local packages for development testing using `pnpm link` under the hood.

**Provider mode** (in the package to be linked):
```bash
cd packages/my-lib
proman link              # link current package globally (requires built artifacts)
```

**Consumer mode** (in the project using the package):
```bash
proman link @myorg/my-lib   # link package from global registry
proman link --status         # show currently linked packages
```

**Unlink**:
```bash
proman unlink               # unlink all linked packages and restore from registry
proman unlink @myorg/my-lib # unlink specific package
```

**Notes:**
- Provider mode checks for build artifacts (dist/) before linking
- Consumer mode validates that the package is in dependencies or devDependencies
- `--status` shows symlinked packages and their source paths
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
