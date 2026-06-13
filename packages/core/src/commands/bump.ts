import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load-config.js'
import {
  buildChangelogEntry,
  type Changeset,
  prependChangelog,
  readChangesets,
} from '../utils/changeset.js'
import { bumpVersion, inferBump } from '../utils/version.js'

export type BumpOptions = {
  type?: 'major' | 'minor' | 'patch'
  cwd?: string
  now?: () => Date
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

async function writeJson(path: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Bump package versions independently.
 * --type: bump all packages with the given type.
 * No --type: infer per-package bumps from changesets; only bump packages mentioned in changesets.
 * Returns a map of package name → new version.
 */
export async function bump(opts: BumpOptions = {}): Promise<Record<string, string>> {
  const cwd = opts.cwd ?? process.cwd()
  const now = opts.now ?? (() => new Date())
  const cfg = loadConfig(cwd)

  const bumped: Record<string, string> = {}

  if (opts.type) {
    // Explicit --type: bump all packages
    for (const pkg of cfg.packages) {
      const pkgPath = resolve(cwd, pkg.path, 'package.json')
      const json = await readJson(pkgPath)
      const current = json.version as string
      if (!current) throw new Error(`missing version in ${pkgPath}`)
      const version = bumpVersion(current, opts.type)
      json.version = version
      await writeJson(pkgPath, json)
      bumped[pkg.name] = version
    }
  } else {
    // Infer from changesets: per-package independent bump
    const changesets = await readChangesets(cwd)
    if (changesets.length === 0) {
      throw new Error('no --type specified and no pending changesets found')
    }
    const bumpMap = inferBump(changesets)
    if (Object.keys(bumpMap).length === 0) {
      throw new Error('no inferable bump from changeset entries')
    }

    const pkgByName = new Map(cfg.packages.map((p) => [p.name, p]))

    for (const [pkgName, bumpType] of Object.entries(bumpMap)) {
      const pkg = pkgByName.get(pkgName)
      if (!pkg) continue // changeset mentions unknown package, skip
      const pkgPath = resolve(cwd, pkg.path, 'package.json')
      const json = await readJson(pkgPath)
      const current = json.version as string
      if (!current) throw new Error(`missing version in ${pkgPath}`)
      const version = bumpVersion(current, bumpType)
      json.version = version
      await writeJson(pkgPath, json)
      bumped[pkgName] = version
    }

    // Generate CHANGELOG.md per bumped package
    const date = formatDate(now())
    const byPackage: Record<string, Changeset[]> = {}
    for (const cs of changesets) {
      for (const pkg of Object.keys(cs.packages)) {
        if (!pkgByName.has(pkg)) continue
        const arr = byPackage[pkg] ?? []
        arr.push(cs)
        byPackage[pkg] = arr
      }
    }

    for (const [pkgName, version] of Object.entries(bumped)) {
      const list = byPackage[pkgName]
      if (!list || list.length === 0) continue
      const pkg = pkgByName.get(pkgName)
      if (!pkg) continue
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

    // Delete consumed changeset files
    for (const cs of changesets) {
      await unlink(cs.file)
    }
  }

  return bumped
}
