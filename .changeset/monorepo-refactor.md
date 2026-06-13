---
'@shazhou/proman-core': minor
'@shazhou/proman': minor
---

Refactor proman into a monorepo with `@shazhou/proman-core` and `@shazhou/proman` packages.

**Breaking**: None - CLI interface remains unchanged

**New packages**:
- `@shazhou/proman-core` - Core library with config loader, utils, and command logic as pure functions for programmatic use
- `@shazhou/proman` - CLI package that parses args and delegates to core functions

**Features**:
- Proman now manages itself as a monorepo (dogfooding)
- Single-package projects work as one-package monorepos (eliminates need for unirepo support)
- Core exports are pure functions with no CLI-specific side effects
- Root `proman.yaml` configures packages array for monorepo management

**Migration**: Users only need to upgrade the `@shazhou/proman` CLI package. The core package is automatically installed as a dependency.
