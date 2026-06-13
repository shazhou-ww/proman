---
---

Fix root directory conflicts after monorepo migration. Root src/ directory removed, root package.json marked private and renamed to @shazhou/proman-workspace, bin field removed, and tsconfig.json updated to reference packages/*/src/**/* instead of deleted src/.
