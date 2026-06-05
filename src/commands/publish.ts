import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load-config.ts'
import {
  buildChangelogEntry,
  type Changeset,
  prependChangelog,
  readChangesets,
} from '../utils/changeset.ts'
import { createGitOps, type GitOps } from '../utils/git.ts'
import { createNpmRunner, type NpmRunner } from '../utils/npm.ts'

export type { GitOps } from '../utils/git.ts'
export type { NpmRunner } from '../utils/npm.ts'

export type PublishOptions = {
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

/**
 * Publish all packages. Reads each package's version from its own package.json.
 * build → test → check → publish → changelog → commit → tag → push
 */
export async function publish(opts: PublishOptions = {}): Promise<void> {
  const { skipTests = false } = opts
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)
  const now = opts.now ?? (() => new Date())

  const cfg = loadConfig(cwd)
  const npm = opts.npm ?? createNpmRunner(cwd)

  // Separate publishable (non-private) from private packages
  type PkgJsonInfo = { version: string; private?: boolean }
  const pkgJsonMap: Record<string, PkgJsonInfo> = {}
  for (const pkg of cfg.packages) {
    const pkgPath = resolve(cwd, pkg.path, 'package.json')
    const json = await readJson(pkgPath)
    const version = json.version as string
    if (!version) throw new Error(`missing version in ${pkgPath}`)
    pkgJsonMap[pkg.name] = { version, private: json.private === true }
  }

  const publishablePackages = cfg.packages.filter(
    (pkg) => pkg.private !== true && pkgJsonMap[pkg.name]?.private !== true,
  )

  // Read each publishable package's version
  const versions: Record<string, string> = {}
  for (const pkg of publishablePackages) {
    versions[pkg.name] = pkgJsonMap[pkg.name]?.version as string
  }

  // Build + test + check
  await npm.install()
  await npm.build()
  console.log('✓ build')
  if (!skipTests) {
    await npm.test()
    console.log('✓ test')
  }
  await npm.check()
  console.log('✓ check')

  // Log skipped private packages
  for (const pkg of cfg.packages) {
    if (pkg.private === true || pkgJsonMap[pkg.name]?.private === true) {
      console.log(`⏭ skipped ${pkg.name} (private)`)
    }
  }

  // Publish each publishable package
  const access = cfg.release?.access
  for (let i = 0; i < publishablePackages.length; i++) {
    const entry = publishablePackages[i]
    const version = versions[entry.name] as string
    const isRc = isRcVersion(version)
    const publishTag = isRc ? 'rc' : 'latest'
    const pkgDir = resolve(cwd, entry.path)
    try {
      await npm.publish(pkgDir, { tag: publishTag, ...(access ? { access } : {}) })
      console.log(`✓ published ${entry.name}@${version}`)
    } catch (err) {
      const published = publishablePackages.slice(0, i).map((p) => p.name)
      const remaining = publishablePackages.slice(i + 1).map((p) => p.name)
      const msg =
        `publish failed for ${entry.name}: ${(err as Error).message}\n` +
        `  published: ${published.join(', ') || '(none)'}\n` +
        `  unpublished: ${[entry.name, ...remaining].join(', ')}`
      throw new Error(msg)
    }
  }

  // Determine which packages were bumped (from changesets)
  const changesets = await readChangesets(cwd)
  const publishablePkgNames = new Set(publishablePackages.map((p) => p.name))
  const bumpedPackages = new Set<string>()
  if (changesets.length > 0) {
    for (const cs of changesets) {
      for (const pkg of Object.keys(cs.packages)) {
        if (publishablePkgNames.has(pkg)) bumpedPackages.add(pkg)
      }
    }
  }
  // If no changesets (e.g. manual --type bump), treat all publishable packages as bumped
  if (bumpedPackages.size === 0) {
    for (const pkg of publishablePackages) bumpedPackages.add(pkg.name)
  }

  // Changelog (skip for RC versions)
  const hasRc = Object.values(versions).some(isRcVersion)
  if (!hasRc && changesets.length > 0) {
    const date = formatDate(now())
    const byPackage: Record<string, Changeset[]> = {}
    for (const cs of changesets) {
      for (const pkg of Object.keys(cs.packages)) {
        if (!publishablePkgNames.has(pkg)) continue
        const arr = byPackage[pkg] ?? []
        arr.push(cs)
        byPackage[pkg] = arr
      }
    }

    for (const pkg of publishablePackages) {
      const list = byPackage[pkg.name]
      if (!list || list.length === 0) continue
      const version = versions[pkg.name] as string
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

  // Commit + tag + push (only tag bumped publishable packages)
  await git.addAll()

  const tagPrefix = cfg.release?.gitTagPrefix ?? 'v'
  const bumpedVersions = Object.entries(versions).filter(([name]) => bumpedPackages.has(name))

  const commitVersion = bumpedVersions[0]?.[1] ?? 'unknown'
  await git.commit(`release: v${commitVersion}`, AUTHOR)

  for (const [pkgName, version] of bumpedVersions) {
    const tagName = `${pkgName}@${tagPrefix}${version}`
    await git.tag(tagName, `Release ${pkgName}@${version}`)
  }
  await git.pushTags()
  await git.push('main')
  for (const [pkgName, version] of bumpedVersions) {
    console.log(`✓ tagged ${pkgName}@${tagPrefix}${version}`)
  }
  console.log(`✓ pushed`)
}
