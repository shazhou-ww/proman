---
scenario: "Build makes bin entries executable after compilation"
feature: build
tags: [chmod, bin, cli]
---

## Given
- A package has a `bin` field in package.json (string or object)

## When
- `proman build` completes for that package

## Then
- All bin target files get `chmod 755`
- Missing bin targets do not crash
- Packages without bin field are unaffected
