---
'@shazhou/proman': minor
---

feat: implement proman init command to scaffold new monorepos

Add `proman init [dir]` command that generates a ready-to-use pnpm monorepo with:
- Two example packages: @<name>/core (library) and @<name>/cli (binary)
- Pre-configured build/test/check/format scripts
- TypeScript with composite project references
- Biome for linting and formatting
- Vitest for testing
- Example source files and tests that pass out of the box

The generated project is ready to use immediately after `pnpm install && proman build`.
