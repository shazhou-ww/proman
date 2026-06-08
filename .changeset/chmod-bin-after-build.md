---
"@shazhou/proman": patch
---

fix: chmod +x bin entries after build

`proman build` now reads each package's `package.json` `bin` field after
building and runs `chmod 755` on the target files. This prevents
`Permission denied` errors when a globally-linked CLI is rebuilt with
`tsc` (which creates new files without preserving the +x permission bit).
