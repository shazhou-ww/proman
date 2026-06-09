---
'@shazhou/proman': minor
---

feat: proman link — local package linking command

Add `proman link` and `proman unlink` commands that automate local package linking workflow based on `pnpm link`:

- **`proman link`** (provider mode): Link current package globally
- **`proman link <package>`** (consumer mode): Link package from global registry
- **`proman link --status`**: Show currently linked packages
- **`proman unlink`**: Unlink all linked packages
- **`proman unlink <package>`**: Unlink specific package

Features:
- Build verification before linking (provider mode)
- Dependency validation (consumer mode)
- Symlink detection for status reporting
- Automatic restore from registry on unlink
