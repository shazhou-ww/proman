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
import { type NpmRunner, createNpmRunner } from '../utils/npm.ts'
import { bumpVersion, inferBump } from '../utils/version.ts'

export type { GitOps } from '../utils/git.ts'
export type { NpmRunner } from '../utils/npm.ts'

export type ReleaseOptions = {
  version?: string
  bump?: 'major' | 'minor' | 'patch'
  force?: boolean
  skipTests?: boolean
  cwd?: string
  git?: GitOps
  npm?: NpmRunner
  now?: () => Date
}

const AUTHOR = '小橘 <xiaoju@shazhou.work>'

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

function isRcVersion(version: string): boolean {
  return /-rc\.\d+$/.test(version)
}

export async function release(opts: ReleaseOptions = {}): Promise<void> {
  const { force = false, skipTests = false } = opts
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)
  const now = opts.now ?? (() => new Date())

  // Must be on main, clean tree
  const branch = await git.getCurrentBranch()
  if (branch !== 'main') {
    throw new Error(`must be on main branch (current: ${branch})`)
  }
  if (!(await git.isCleanTree())) {
    throw new Error('working tree must be clean')
  }

  const cfg = loadConfig(cwd)
  const pm = cfg.packageManager ?? 'npm'

  // Determine version
  let version: string
  if (opts.version) {
    version = opts.version
  } else if (opts.bump) {
    const firstPkg = cfg.packages[0]
    if (!firstPkg) throw new Error('no packages configured')
    const pkgPath = resolve(cwd, firstPkg.path, 'package.json')
    const json = await readJson(pkgPath)
    const current = json.version as string
    if (!current) throw new Error(`missing version in ${pkgPath}`)
    version = bumpVersion(current, opts.bump)
  } else {
    // Auto-infer from changesets
    const changesets = await readChangesets(cwd)
    if (changesets.length === 0) {
      throw new Error('no version specified and no pending changesets found (use --version or --bump)')
    }
    const fixed = cfg.changeset?.fixed === true
    const bump = inferBump(changesets, fixed)
    if (bump === null) {
      throw new Error('no inferable bump from changeset entries')
    }
    const firstPkg = cfg.packages[0]
    if (!firstPkg) throw new Error('no packages configured')
    const pkgPath = resolve(cwd, firstPkg.path, 'package.json')
    const json = await readJson(pkgPath)
    const current = json.version as string
    if (!current) throw new Error(`missing version in ${pkgPath}`)
    version = bumpVersion(current, bump)
  }

  const isRc = isRcVersion(version)
  const publishTag = isRc ? 'rc' : 'latest'

  // Bump all package versions
  for (const pkg of cfg.packages) {
    const pkgPath = resolve(cwd, pkg.path, 'package.json')
    const json = await readJson(pkgPath)
    json.version = version
    await writeJson(pkgPath, json)
  }

  // Build + test + check
  const npm = opts.npm ?? createNpmRunner(pm, cwd)
  await npm.install()
  await npm.build()
  if (!skipTests) {
    await npm.test()
  }
  await npm.check()

  // Publish each package
  const access = cfg.release?.access
  for (let i = 0; i < cfg.packages.length; i++) {
    const entry = cfg.packages[i] as { name: string; path: string }
    const pkgDir = resolve(cwd, entry.path)
    try {
      await npm.publish(pkgDir, { tag: publishTag, ...(access ? { access } : {}) })
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

  // Changelog (skip for rc)
  if (!isRc) {
    const changesets = await readChangesets(cwd)
    const pkgNames = new Set(cfg.packages.map((p) => p.name))

    if (changesets.length > 0 || force) {
      const date = formatDate(now())
      const byPackage: Record<string, Changeset[]> = {}
      for (const cs of changesets) {
        for (const pkg of Object.keys(cs.packages)) {
          if (!pkgNames.has(pkg)) continue
          const arr = byPackage[pkg] ?? []
          arr.push(cs)
          byPackage[pkg] = arr
        }
      }

      for (const pkg of cfg.packages) {
        const list = byPackage[pkg.name]
        if (!list || list.length === 0) continue
        const entry = buildChangelogEntry({
          version,
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
    }
  }

  // Commit + tag + push
  await git.addAll()
  await git.commit(`release: v${version}`, AUTHOR)

  const tagPrefix = cfg.release?.gitTagPrefix ?? 'v'
  const tagName = `${tagPrefix}${version}`
  await git.tag(tagName, `Release ${version}`)
  await git.pushTags()
  await git.push('main')
}
