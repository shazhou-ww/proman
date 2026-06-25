import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load-config.js'
import { createGitOps, type GitOps } from '../utils/git.js'
import {
  createNpmRunner,
  defaultRegistryFetch,
  defaultSpawn,
  type NpmRegistryFetch,
  type NpmRunner,
  type SpawnFn,
} from '../utils/npm.js'
import { smokeTest } from '../utils/smoke-test.js'

export type { GitOps } from '../utils/git.js'
export type { NpmRunner } from '../utils/npm.js'

export type PublishOptions = {
  skipTests?: boolean
  skipSmoke?: boolean
  cwd?: string
  git?: GitOps
  npm?: NpmRunner
  registryFetch?: NpmRegistryFetch
  spawn?: SpawnFn
}

const AUTHOR = '小橘 <xiaoju@shazhou.work>'

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

function isRcVersion(version: string): boolean {
  return /-rc\.\d+$/.test(version)
}

const ALREADY_PUBLISHED_RE =
  /cannot publish over the previously published versions|you cannot publish over the previously published version/i

function isAlreadyPublished(message: string): boolean {
  return ALREADY_PUBLISHED_RE.test(message)
}

/**
 * Publish all packages. Reads each package's version from its own package.json.
 * build → test → check → smoke test tarball → publish → commit → tag → push
 */
export async function publish(opts: PublishOptions = {}): Promise<void> {
  const { skipTests = false, skipSmoke = false } = opts
  const cwd = opts.cwd ?? process.cwd()
  const git = opts.git ?? createGitOps(cwd)
  const fetchVersions = opts.registryFetch ?? defaultRegistryFetch
  const spawn = opts.spawn ?? defaultSpawn

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

    // Pre-check: skip if already published on registry
    const existingVersions = await fetchVersions(entry.name)
    if (existingVersions.includes(version)) {
      console.log(`⏭ skipped ${entry.name}@${version} (already published)`)
      continue
    }

    // Smoke test: validate package before publishing
    if (!skipSmoke) {
      try {
        // Build workspace package map for symlink resolution
        const workspacePackages: Record<string, string> = {}
        for (const pkg of cfg.packages) {
          workspacePackages[pkg.name] = resolve(cwd, pkg.path)
        }
        await smokeTest(pkgDir, spawn, workspacePackages)
      } catch (err) {
        const message = (err as Error).message
        const published = publishablePackages.slice(0, i).map((p) => p.name)
        const remaining = publishablePackages.slice(i + 1).map((p) => p.name)
        const msg =
          `smoke test failed for ${entry.name}: ${message}\n` +
          `  published: ${published.join(', ') || '(none)'}\n` +
          `  unpublished: ${[entry.name, ...remaining].join(', ')}`
        throw new Error(msg)
      }
    }

    try {
      await npm.publish(pkgDir, { tag: publishTag, ...(access ? { access } : {}) })
      console.log(`✓ published ${entry.name}@${version}`)
    } catch (err) {
      const message = (err as Error).message
      // Fallback: catch the error in case of race condition
      if (isAlreadyPublished(message)) {
        console.log(`⏭ skipped ${entry.name}@${version} (already published)`)
        continue
      }
      const published = publishablePackages.slice(0, i).map((p) => p.name)
      const remaining = publishablePackages.slice(i + 1).map((p) => p.name)
      const msg =
        `publish failed for ${entry.name}: ${message}\n` +
        `  published: ${published.join(', ') || '(none)'}\n` +
        `  unpublished: ${[entry.name, ...remaining].join(', ')}`
      throw new Error(msg)
    }
  }

  // Commit + tag + push all publishable packages
  // Changelog generation and changeset cleanup are now bump's responsibility (issue #74)
  const tagPrefix = cfg.release?.gitTagPrefix ?? 'v'
  const bumpedVersions = Object.entries(versions)

  // The release-commit is skipped when the working tree is already clean.
  // In the uwf split-role release workflow the `bumper` role commits + merges
  // the version bump via release PR *before* `publish` runs, so by the time we
  // get here there is nothing left to commit. Forcing a commit then fails with
  // "nothing to commit" and — fatally — aborts before the tag step, leaving the
  // npm publish (irreversible, already done above) without a git tag. Guarding
  // on isCleanTree() makes the commit best-effort while tags/push always run.
  await git.addAll()
  if (await git.isCleanTree()) {
    console.log('⏭ skipped release commit (working tree clean — bump already committed)')
  } else {
    const commitVersion = bumpedVersions[0]?.[1] ?? 'unknown'
    await git.commit(`release: v${commitVersion}`, AUTHOR)
  }

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
