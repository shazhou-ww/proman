---
'@shazhou/proman': patch
---

refactor: consolidate runOrThrow helper

Export `runOrThrow` from `src/utils/npm.ts` and remove duplicate definitions from command files (`link.ts`, `deploy.ts`, `dev.ts`). This internal refactor eliminates code duplication with no user-facing changes.
