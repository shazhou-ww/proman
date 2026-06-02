import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../config/load-config.ts'
import { type GitOps, createGitOps } from '../utils/git.ts'
import { applyWorkspaceRewrites } from '../utils/workspace.ts'

export type { GitOps } from '../utils/git.ts'

export type ReleasePrepareOptions = {
  version: string
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

export async function releasePrepare(opts: ReleasePrepareOptions): Promise<void> {
  const { version, force = false } = opts
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)

  if (!VERSION_RE.test(version)) {
    throw new Error(`invalid version: '${version}' — expected semver like 0.3.0`)
  }

  const branch = await git.getCurrentBranch()
  if (branch !== 'main') {
    throw new Error(`must be on main branch (current: ${branch})`)
  }

  if (!(await git.isCleanTree())) {
    throw new Error('working tree must be clean')
  }

  if (!force) {
    if (!(await hasPendingChangesets(cwd))) {
      throw new Error('no pending changeset entries found in .changeset/ (use --force to skip)')
    }
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
