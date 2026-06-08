---
scenario: "Build failure aborts the pipeline"
feature: build
tags: [error-handling]
---

## Given
- A package has a compilation error

## When
- `proman build` runs

## Then
- The build command throws an error
- Subsequent packages are not built
