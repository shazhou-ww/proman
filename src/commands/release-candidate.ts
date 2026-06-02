import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load-config.ts'
import { type GitOps, createGitOps } from '../utils/git.ts'
import {
  type NpmRegistryFetch,
  type NpmRunner,
  createNpmRunner,
  defaultRegistryFetch,
  formatRcVersion,
  nextRcNumber,
  parseReleaseBranch,
} from '../utils/npm.ts'

export type { GitOps } from '../utils/git.ts'
export type { NpmRegistryFetch, NpmRunner } from '../utils/npm.ts'

export type ReleaseCandidateOptions = {
  cwd?: string
  git?: GitOps
  npm?: NpmRunner
  registryFetch?: NpmRegistryFetch
}

const AUTHOR = '小橘 <xiaoju@shazhou.work>'

async function updatePackageVersion(pkgJsonPath: string, newVersion: string): Promise<void> {
  const text = await readFile(pkgJsonPath, 'utf8')
  const json = JSON.parse(text) as Record<string, unknown>
  json.version = newVersion
  await writeFile(pkgJsonPath, `${JSON.stringify(json, null, 2)}\n`)
}

export async function releaseCandidate(opts: ReleaseCandidateOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)
  const registryFetch = opts.registryFetch ?? defaultRegistryFetch

  const branch = await git.getCurrentBranch()
  if (!branch.startsWith('release/')) {
    throw new Error(`must be on a release/* branch (current: ${branch})`)
  }
  const baseVersion = parseReleaseBranch(branch)

  if (!(await git.isCleanTree())) {
    throw new Error('working tree must be clean')
  }

  const cfg = await loadConfig(cwd)
  const firstPkg = cfg.packages[0]
  if (!firstPkg) throw new Error('config has no packages')

  const existing = await registryFetch(firstPkg.name)
  const n = nextRcNumber({ baseVersion, existing })
  const rcVersion = formatRcVersion(baseVersion, n)

  const pkgJsonPaths = cfg.packages.map((p) => resolve(cwd, p.path, 'package.json'))
  for (const p of pkgJsonPaths) {
    await updatePackageVersion(p, rcVersion)
  }

  const npm = opts.npm ?? createNpmRunner(cfg.runtime, cwd)
  await npm.install()
  await npm.build()
  await npm.test()
  await npm.check()

  const access = cfg.release?.access
  for (let i = 0; i < cfg.packages.length; i++) {
    const entry = cfg.packages[i] as { name: string; path: string }
    const pkgDir = resolve(cwd, entry.path)
    try {
      await npm.publish(pkgDir, { tag: 'rc', ...(access ? { access } : {}) })
    } catch (err) {
      const published = cfg.packages.slice(0, i).map((p) => p.name)
      const failed = entry.name
      const remaining = cfg.packages.slice(i + 1).map((p) => p.name)
      const msg =
        `publish failed for ${failed}: ${(err as Error).message}\n` +
        `  published: ${published.join(', ') || '(none)'}\n` +
        `  unpublished: ${[failed, ...remaining].join(', ')}`
      throw new Error(msg)
    }
  }

  await git.addAll()
  await git.commit(`release: v${rcVersion}`, AUTHOR)
  await git.push(branch)
}
