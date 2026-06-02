import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadConfig } from '../config/load-config.ts'
import { readChangesets } from '../utils/changeset.ts'
import { type GitOps, createGitOps } from '../utils/git.ts'
import { bumpVersion, inferBump, parseTagVersion } from '../utils/version.ts'
import { applyWorkspaceRewrites } from '../utils/workspace.ts'

export type { GitOps } from '../utils/git.ts'

export type ReleasePrepareOptions = {
  version?: string
  from?: string
  patch?: boolean
  force?: boolean
  cwd?: string
  git?: GitOps
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.+-]+)?$/

const AUTHOR = '小橘 <xiaoju@shazhou.work>'

async function hasPendingChangesets(cwd: string): Promise<boolean> {
  const dir = join(cwd, '.changeset')
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return false
  }
  return entries.some((name) => {
    if (!name.endsWith('.md')) return false
    if (name === 'config.md') return false
    return true
  })
}

async function readCurrentVersion(cwd: string): Promise<string> {
  const cfg = await loadConfig(cwd)
  const first = cfg.packages[0]
  if (!first) {
    throw new Error('cannot read current version: no packages configured')
  }
  const pkgPath = resolve(cwd, first.path, 'package.json')
  let text: string
  try {
    text = await readFile(pkgPath, 'utf8')
  } catch (err) {
    throw new Error(`cannot read package.json at ${pkgPath}: ${(err as Error).message}`)
  }
  const parsed = JSON.parse(text) as { version?: string }
  if (!parsed.version) {
    throw new Error(`missing version in ${pkgPath}`)
  }
  return parsed.version
}

export async function releasePrepare(opts: ReleasePrepareOptions): Promise<void> {
  const { from, patch = false, force = false } = opts
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)

  // Argument-level validation (no disk/git mutations)
  if (patch && !from) {
    throw new Error('--patch requires --from <tag>')
  }
  if (from && !patch && opts.version === undefined) {
    throw new Error('--from requires either --patch or --version <ver>')
  }
  if (patch && opts.version !== undefined && !from) {
    throw new Error('--patch cannot be combined with --version unless --from is provided')
  }

  // Validate explicit version format up-front if provided
  if (opts.version !== undefined && !VERSION_RE.test(opts.version)) {
    throw new Error(`invalid version: '${opts.version}' — expected semver like 0.3.0`)
  }

  // Hotfix path
  if (from) {
    if (!(await git.tagExists(from))) {
      throw new Error(`tag ${from} not found`)
    }
    if (!(await git.isCleanTree())) {
      throw new Error('working tree must be clean')
    }
    const baseVersion = parseTagVersion(from)
    const version = opts.version ?? bumpVersion(baseVersion, 'patch')
    const releaseBranch = `release/${version}`
    if (await git.branchExists(releaseBranch)) {
      throw new Error(`branch ${releaseBranch} already exists`)
    }
    const cfg = await loadConfig(cwd)
    await git.checkoutNewBranchFrom(releaseBranch, from)
    await applyWorkspaceRewrites(cwd, cfg.packages)
    await git.addAll()
    await git.commit(`release: prepare v${version}`, AUTHOR)
    await git.push(releaseBranch)
    return
  }

  // Non-hotfix path: must be on main, clean tree
  const branch = await git.getCurrentBranch()
  if (branch !== 'main') {
    throw new Error(`must be on main branch (current: ${branch})`)
  }

  if (!(await git.isCleanTree())) {
    throw new Error('working tree must be clean')
  }

  // Determine effective version
  let version: string
  if (opts.version !== undefined) {
    version = opts.version
    if (!force) {
      if (!(await hasPendingChangesets(cwd))) {
        throw new Error('no pending changeset entries found in .changeset/ (use --force to skip)')
      }
    }
  } else {
    // Auto-infer
    const changesets = await readChangesets(cwd)
    if (changesets.length === 0) {
      throw new Error('no pending changeset entries found in .changeset/ (use --force to skip)')
    }
    const cfg = await loadConfig(cwd)
    const fixed = cfg.changeset?.fixed === true
    const bump = inferBump(changesets, fixed)
    if (bump === null) {
      throw new Error('no inferable bump from changeset entries')
    }
    const current = await readCurrentVersion(cwd)
    version = bumpVersion(current, bump)
  }

  if (!VERSION_RE.test(version)) {
    throw new Error(`invalid version: '${version}' — expected semver like 0.3.0`)
  }

  const releaseBranch = `release/${version}`
  if (await git.branchExists(releaseBranch)) {
    throw new Error(`branch ${releaseBranch} already exists`)
  }

  const cfg = await loadConfig(cwd)

  await git.checkoutNewBranch(releaseBranch)
  await applyWorkspaceRewrites(cwd, cfg.packages)
  await git.addAll()
  await git.commit(`release: prepare v${version}`, AUTHOR)
  await git.push(releaseBranch)
}
