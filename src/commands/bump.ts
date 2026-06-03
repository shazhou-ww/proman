import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load-config.ts'
import { readChangesets } from '../utils/changeset.ts'
import { bumpVersion, inferBump } from '../utils/version.ts'

export type BumpOptions = {
  type?: 'major' | 'minor' | 'patch'
  cwd?: string
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

async function writeJson(path: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
}

/**
 * Bump all package versions. If --type is given, use it; otherwise infer from changesets.
 * Returns the new version string.
 */
export async function bump(opts: BumpOptions = {}): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const cfg = loadConfig(cwd)

  const firstPkg = cfg.packages[0]
  if (!firstPkg) throw new Error('no packages configured')
  const firstPkgPath = resolve(cwd, firstPkg.path, 'package.json')
  const firstJson = await readJson(firstPkgPath)
  const current = firstJson.version as string
  if (!current) throw new Error(`missing version in ${firstPkgPath}`)

  let bumpType: 'major' | 'minor' | 'patch'
  if (opts.type) {
    bumpType = opts.type
  } else {
    const changesets = await readChangesets(cwd)
    if (changesets.length === 0) {
      throw new Error('no --type specified and no pending changesets found')
    }
    const fixed = cfg.changeset?.fixed === true
    const inferred = inferBump(changesets, fixed)
    if (inferred === null) {
      throw new Error('no inferable bump from changeset entries')
    }
    bumpType = inferred
  }

  const version = bumpVersion(current, bumpType)

  for (const pkg of cfg.packages) {
    const pkgPath = resolve(cwd, pkg.path, 'package.json')
    const json = await readJson(pkgPath)
    json.version = version
    await writeJson(pkgPath, json)
  }

  return version
}
