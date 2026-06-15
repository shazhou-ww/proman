---
id: cli-dispatch
title: "CLI Command Dispatch Architecture"
sources:
  - packages/cli/src/cli.ts
  - packages/core/src/commands/index.ts
  - packages/core/src/index.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# CLI Command Dispatch Architecture

## Two-Package Boundary

proman splits into two packages with a strict separation:

| Layer | Package | Role |
|-------|---------|------|
| **CLI** | `@shazhou/proman` (`packages/cli/`) | argv parsing, output formatting, process lifecycle |
| **Core** | `@shazhou/proman-core` (`packages/core/`) | Pure command logic, config loading, utilities |

The CLI never contains business logic. Core never reads `process.argv` or writes to stdout directly (callers handle output). This makes core functions unit-testable without spawning a process.

## Entry Point

`packages/cli/src/cli.ts` is the single entry point, bundled by esbuild into `dist/cli.js`. It:

1. Reads its own `package.json` for version display
2. Defines a `HELP_TEXT` constant covering all commands
3. Calls `main(process.argv.slice(2))` at the module level (guarded by `import.meta.main`)

## Dispatch Pattern

The dispatcher is a flat `if`-chain in `main()`, matching `argv[0]` against known command strings:

```typescript
async function main(argv: string[]): Promise<void> {
  const cmd = argv[0]
  if (cmd === 'bump') { ... }
  if (cmd === 'publish') { ... }
  // ...
  throw new Error(`unknown command: ${cmd}`)
}
```

Key properties:
- **No framework** — no yargs, commander, or arg-parsing library. Manual `for`-loop parsers per command.
- **Flat routing** — single level of `if` statements; no command registry or plugin system.
- **Subcommands** — `cards` and `prompt` use a second-level `argv[1]` match for their sub-operations.
- **Early return** — each branch returns after delegating, so order doesn't matter for correctness.
- **Unknown = throw** — unrecognized commands fall through to a final `throw`, caught by the top-level `.catch()` that writes to stderr and exits 1.

## Argument Parsers

Each command has a dedicated `parseXxxArgs()` function exported from `cli.ts`:

| Function | Flags handled |
|----------|---------------|
| `parseBumpArgs` | `--type major|minor|patch` |
| `parsePublishArgs` | `--skip-tests`, `--skip-smoke` |
| `parseDeployArgs` | `--package <name>`, `--env <env>` |
| `parseDevArgs` | `--force` |
| `parseLinkArgs` | `--status`, positional `<package>` |
| `parseCardsQueryArgs` | `--sources <files...>`, `--tag`, `--id` |

All parsers throw on unknown flags (strict parsing). They return plain typed objects consumed by the corresponding core function.

## Core Exports

`@shazhou/proman-core` exposes commands via a barrel re-export chain:

```
packages/core/src/commands/bump.ts   ──┐
packages/core/src/commands/dev.ts    ──┤
packages/core/src/commands/publish.ts──┼─→ commands/index.ts ─→ src/index.ts
packages/core/src/commands/cards.ts  ──┤
...                                    ──┘
```

Every command function takes a single options object and returns a `Promise`. The CLI maps parsed argv to the appropriate options shape, then `await`s the core function.

## CI-Aware Behavior

The CLI checks `process.env.CI` and forces `--force` semantics (bypasses fingerprint cache) when running in CI. This is applied transparently at the CLI layer before calling core functions like `build`, `runTests`, and `check`.

## Error Handling

```typescript
main(process.argv.slice(2)).catch((err: Error) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
```

Core functions throw on failure. The CLI catches at the top level, writes the error message to stderr, and exits with code 1. No stack traces in production output.