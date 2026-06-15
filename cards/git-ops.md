---
id: git-ops
title: "Git Operations Abstraction"
sources:
  - packages/core/src/utils/git.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Git Operations Abstraction

## Overview

The `GitOps` interface abstracts all git operations behind an async API, enabling testability via dependency injection. The default implementation (`createGitOps`) shells out to the `git` CLI via `execFileSync`.

## Interface

```typescript
type GitOps = {
  getCurrentBranch: () => Promise<string>
  isCleanTree: () => Promise<boolean>
  branchExists: (name: string) => Promise<boolean>
  checkoutNewBranch: (name: string) => Promise<void>
  checkoutNewBranchFrom: (name: string, ref: string) => Promise<void>
  tagExists: (tag: string) => Promise<boolean>
  addAll: () => Promise<void>
  commit: (msg: string, author?: string) => Promise<void>
  push: (branch: string) => Promise<void>
  log: (range?: string) => Promise<string>
  tag: (name: string, message?: string) => Promise<void>
  pushTags: () => Promise<void>
  checkout: (branch: string) => Promise<void>
  merge: (branch: string, opts?: { noFf?: boolean; message?: string }) => Promise<void>
  deleteBranchLocal: (name: string) => Promise<void>
  deleteBranchRemote: (name: string) => Promise<void>
}
```

## Factory: `createGitOps(cwd?)`

Creates a concrete `GitOps` instance bound to a working directory. All operations execute in that `cwd`.

## Implementation Details

### Execution Layer

A private `run(args, cwd)` function wraps `execFileSync('git', args, { cwd })`:
- Returns stdout as a trimmed string
- Throws with a formatted error including the git command and stderr on failure
- Sets `maxBuffer: 10MB` for large log outputs
- Uses `stdio: 'pipe'` to capture output without leaking to terminal

### Notable Operations

| Method | Git command | Notes |
|--------|-------------|-------|
| `getCurrentBranch` | `git branch --show-current` | Returns branch name |
| `isCleanTree` | `git status --porcelain` | Empty output = clean |
| `branchExists` | `git show-ref --verify --quiet refs/heads/<name>` | Exit code check, no throw |
| `tagExists` | `git rev-parse --verify -q refs/tags/<tag>` | Exit code check, no throw |
| `commit` | `git commit -m <msg>` | Supports author override |
| `push` | `git push -u origin <branch>` | Always sets upstream |
| `tag` | `git tag` or `git tag -a -m` | Annotated if message provided |
| `merge` | `git merge [--no-ff] [-m msg] <branch>` | Supports no-ff and message |

### Author Handling

The `commit` method supports an optional author string in `Name <email>` format:

```typescript
// Parses "小橘 <xiaoju@shazhou.work>" into { name, email }
// Sets both git config overrides AND --author flag:
git -c user.name=小橘 -c user.email=xiaoju@shazhou.work commit -m "msg" --author="小橘 <xiaoju@shazhou.work>"
```

This ensures the commit has the correct author even if the system git config differs.

### Boolean Checks (branchExists, tagExists)

These use `try/catch` around `execFileSync` rather than the shared `run()` helper. They return `true` on exit code 0, `false` on any error — treating non-existence as a normal case rather than an exception.

## Usage Pattern

```typescript
// In publish command:
const git = opts.git ?? createGitOps(cwd)
await git.addAll()
await git.commit('release: v1.0.0', AUTHOR)
await git.tag('@shazhou/proman@v1.0.0', 'Release message')
await git.pushTags()
await git.push('main')
```

## Testability

Tests provide a mock `GitOps` object rather than the real implementation, avoiding actual git operations in unit tests. The interface-based design means no filesystem or process spawning is needed for testing command logic.