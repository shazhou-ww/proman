import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load-config.ts'
import {
  type Changeset,
  buildChangelogEntry,
  prependChangelog,
  readChangesets,
} from '../utils/changeset.ts'
import { type GitOps, createGitOps } from '../utils/git.ts'
import { type NpmRunner, createNpmRunner, parseReleaseBranch } from '../utils/npm.ts'

export type { GitOps } from '../utils/git.ts'
export type { NpmRunner } from '../utils/npm.ts'

export type ReleaseFinalizeOptions = {
  cwd?: string
  force?: boolean
  git?: GitOps
  npm?: NpmRunner
  now?: () => Date
}

const AUTHOR = '小橘 <xiaoju@shazhou.work>'

function stripRcSuffix(version: string): string {
  return version.replace(/-rc\.\d+$/, '')
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

async function writeJson(path: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function releaseFinalize(opts: ReleaseFinalizeOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)
  const force = opts.force ?? false
  const now = opts.now ?? (() => new Date())

  // Pre-flight
  const branch = await git.getCurrentBranch()
  if (!branch.startsWith('release/')) {
    throw new Error(`must be on a release/* branch (current: ${branch})`)
  }
  const baseVersion = parseReleaseBranch(branch)
  const formalVersion = stripRcSuffix(baseVersion)

  if (!(await git.isCleanTree())) {
    throw new Error('working tree must be clean')
  }

  const log = await git.log()
  const hasRcCommit = /release: v.*-rc\.\d+/.test(log)
  if (!hasRcCommit) {
    throw new Error('no rc commit found in git log (expected /release: v.*-rc\\.\\d+/)')
  }

  const cfg = await loadConfig(cwd)
  const pkgNames = new Set(cfg.packages.map((p) => p.name))

  // Read changesets
  const changesets = await readChangesets(cwd)
  if (changesets.length === 0 && !force) {
    throw new Error('no changeset files found; use --force to skip CHANGELOG generation')
  }

  // Validate changesets reference known packages
  for (const cs of changesets) {
    for (const pkg of Object.keys(cs.packages)) {
      if (!pkgNames.has(pkg)) {
        throw new Error(`changeset ${cs.file} references unknown package: ${pkg}`)
      }
    }
  }

  const date = formatDate(now())

  // Group changesets by package
  const byPackage: Record<string, Changeset[]> = {}
  for (const cs of changesets) {
    for (const pkg of Object.keys(cs.packages)) {
      const arr = byPackage[pkg] ?? []
      arr.push(cs)
      byPackage[pkg] = arr
    }
  }

  // Write CHANGELOGs
  for (const pkg of cfg.packages) {
    const list = byPackage[pkg.name]
    if (!list || list.length === 0) continue
    const entry = buildChangelogEntry({
      version: formalVersion,
      date,
      bodies: list.map((c) => c.body),
    })
    const path = resolve(cwd, pkg.path, 'CHANGELOG.md')
    let existing: string | null = null
    if (await fileExists(path)) {
      existing = await readFile(path, 'utf8')
    }
    await writeFile(path, prependChangelog(existing, entry))
  }

  // Delete consumed changesets
  for (const cs of changesets) {
    await unlink(cs.file)
  }

  // Bump versions to formal, rewrite internal deps to formal version
  const internalNames = new Set(cfg.packages.map((p) => p.name))
  for (const pkg of cfg.packages) {
    const path = resolve(cwd, pkg.path, 'package.json')
    const json = await readJson(path)
    json.version = formalVersion
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps = json[field] as Record<string, string> | undefined
      if (!deps) continue
      const out: Record<string, string> = {}
      for (const [dep, val] of Object.entries(deps)) {
        if (internalNames.has(dep)) {
          out[dep] = formalVersion
        } else {
          out[dep] = val
        }
      }
      json[field] = out
    }
    await writeJson(path, json)
  }

  // Build pipeline
  const npm = opts.npm ?? createNpmRunner(cfg.runtime, cwd)
  await npm.install()
  await npm.build()
  await npm.test()
  await npm.check()

  // Publish in config order with --tag latest
  const access = cfg.release?.access
  for (let i = 0; i < cfg.packages.length; i++) {
    const entry = cfg.packages[i] as { name: string; path: string }
    const pkgDir = resolve(cwd, entry.path)
    try {
      await npm.publish(pkgDir, { tag: 'latest', ...(access ? { access } : {}) })
    } catch (err) {
      const published = cfg.packages.slice(0, i).map((p) => p.name)
      const remaining = cfg.packages.slice(i + 1).map((p) => p.name)
      const msg =
        `publish failed for ${entry.name}: ${(err as Error).message}\n` +
        `  published: ${published.join(', ') || '(none)'}\n` +
        `  unpublished: ${[entry.name, ...remaining].join(', ')}`
      throw new Error(msg)
    }
  }

  // Commit + push release branch
  await git.addAll()
  await git.commit(`release: v${formalVersion}`, AUTHOR)
  await git.push(branch)

  // Tag + push tags
  const tagPrefix = cfg.release?.gitTagPrefix ?? 'v'
  const tagName = `${tagPrefix}${formalVersion}`
  await git.tag(tagName, `Release ${formalVersion}`)
  await git.pushTags()

  // Checkout main + merge --no-ff
  await git.checkout('main')
  await git.merge(branch, { noFf: true })

  // Restore workspace:* in all package.json on main
  for (const pkg of cfg.packages) {
    const path = resolve(cwd, pkg.path, 'package.json')
    const json = await readJson(path)
    let mutated = false
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps = json[field] as Record<string, string> | undefined
      if (!deps) continue
      const out: Record<string, string> = {}
      for (const [dep, val] of Object.entries(deps)) {
        if (internalNames.has(dep)) {
          out[dep] = 'workspace:*'
          if (val !== 'workspace:*') mutated = true
        } else {
          out[dep] = val
        }
      }
      json[field] = out
    }
    if (mutated) {
      await writeJson(path, json)
    }
  }

  await git.addAll()
  await git.commit('chore: restore workspace:*', AUTHOR)
  await git.push('main')

  // Cleanup release branch
  await git.deleteBranchLocal(branch)
  await git.deleteBranchRemote(branch)
}
