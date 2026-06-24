import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { PackageEntry } from '../config/types.js'

/**
 * Recursively collect files matching glob-like patterns.
 * Supports `**\/*.ext`, `dir/**\/*.ext`, and literal filenames.
 */
function collectFiles(baseDir: string, patterns: string[]): string[] {
  const results: string[] = []

  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue
      if (name === '.proman') continue
      const full = join(dir, name)
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
      } else if (st.isFile()) {
        const rel = relative(baseDir, full)
        if (matchesAny(rel, patterns)) {
          results.push(rel)
        }
      }
    }
  }

  walk(baseDir)
  return results.sort()
}

function matchesAny(relPath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    // Handle patterns with **/ anywhere (e.g. "**/*.ts", "src/**/*.ts")
    const dstarIdx = p.indexOf('**/')
    if (dstarIdx >= 0) {
      const prefix = p.slice(0, dstarIdx) // e.g. "" or "src/"
      const suffix = p.slice(dstarIdx + 3) // e.g. "*.ts"

      // Check prefix: relPath must start with the prefix (if any)
      if (prefix && !relPath.startsWith(prefix)) continue

      // Check suffix: get the part after the prefix match
      const rest = prefix ? relPath.slice(prefix.length) : relPath
      if (suffix.startsWith('*')) {
        // *.ext pattern
        const ext = suffix.slice(1) // e.g. ".ts"
        if (rest.endsWith(ext)) return true
      } else if (rest.endsWith(suffix)) {
        return true
      }
    } else {
      // Exact filename match (e.g. "package.json", "biome.json")
      const base = relPath.split('/').pop() ?? relPath
      if (base === p || relPath === p) return true
    }
  }
  return false
}

/**
 * Hash file contents for a set of glob patterns under a directory.
 * Returns a hex sha256 hash string.
 */
export function hashFiles(dir: string, patterns: string[]): string {
  const files = collectFiles(dir, patterns)
  const hash = createHash('sha256')
  for (const rel of files) {
    hash.update(rel)
    hash.update('\0')
    const content = readFileSync(join(dir, rel))
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

/** Stored fingerprint data (JSON on disk). */
export type StoredFingerprint = {
  /** Source hash for change detection. */
  hash: string
  /** Build output files (relative to dist/), recorded on successful build.
   *  Empty for non-build commands (test/check) — no artifact validation. */
  outputs?: string[]
}

/** Read a stored fingerprint. Returns null if file does not exist or is invalid. */
export function readFingerprint(path: string): StoredFingerprint | null {
  try {
    const raw = readFileSync(path, 'utf-8').trim()
    // v1 JSON format
    const parsed = JSON.parse(raw) as Partial<StoredFingerprint>
    if (typeof parsed.hash !== 'string') return null
    return { hash: parsed.hash, outputs: parsed.outputs }
  } catch {
    return null
  }
}

/** Write a fingerprint, creating parent dirs as needed. */
export function writeFingerprint(path: string, data: StoredFingerprint): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 0) + '\n')
}

/**
 * Recursively list all files under a directory (relative paths, sorted).
 * Used to record build outputs for strict cache validation.
 */
export function listOutputFiles(dir: string): string[] {
  const results: string[] = []
  function walk(d: string, relBase: string): void {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(d, name)
      const rel = relBase ? join(relBase, name) : name
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full, rel)
      } else if (st.isFile()) {
        results.push(rel)
      }
    }
  }
  walk(dir, '')
  return results.sort()
}

/**
 * Compute per-package build fingerprints with dependency propagation.
 * Processes packages in order (assumed topo-sorted in proman.yaml).
 * Each package's fingerprint = hash(own src/** + package.json + tsconfig.json + dep fingerprints).
 */
export function computeBuildFingerprints(
  cwd: string,
  packages: readonly Pick<PackageEntry, 'name' | 'path'>[],
): Map<string, string> {
  // Build dependency map from package.json files
  const depMap = new Map<string, string[]>()
  const pkgNames = new Set(packages.map((p) => p.name))

  for (const pkg of packages) {
    const pkgJsonPath = join(resolve(cwd, pkg.path), 'package.json')
    let deps: string[] = []
    try {
      const json = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>
      }
      if (json.dependencies) {
        deps = Object.keys(json.dependencies).filter((d) => pkgNames.has(d))
      }
    } catch {
      // no package.json or parse error — no deps
    }
    depMap.set(pkg.name, deps)
  }

  const fingerprints = new Map<string, string>()

  for (const pkg of packages) {
    const pkgDir = resolve(cwd, pkg.path)
    // Own file hash
    const ownHash = hashFiles(pkgDir, ['src/**/*.ts', 'package.json', 'tsconfig.json'])

    // Combine with dependency fingerprints
    const hash = createHash('sha256')
    hash.update(ownHash)

    const deps = depMap.get(pkg.name) ?? []
    for (const dep of deps.sort()) {
      const depFp = fingerprints.get(dep) ?? ''
      hash.update(dep)
      hash.update('\0')
      hash.update(depFp)
      hash.update('\0')
    }

    fingerprints.set(pkg.name, hash.digest('hex'))
  }

  return fingerprints
}

/**
 * Compute a root-level fingerprint for test or check commands.
 * - test: all .ts files + package.json (covers src, tests, vitest.config.ts)
 * - check: all .ts files + package.json + biome.json
 */
export function computeRootFingerprint(cwd: string, command: 'test' | 'check'): string {
  const patterns: string[] =
    command === 'test' ? ['**/*.ts', 'package.json'] : ['**/*.ts', 'package.json', 'biome.json']

  return hashFiles(cwd, patterns)
}

/** Convert a package name to a safe filename: @scope/name → @scope-name */
export function pkgNameToFilename(name: string): string {
  return name.replace(/\//g, '-')
}

/**
 * Get the path where a fingerprint file should be stored.
 *
 * Storage strategy differs by command type:
 * - **build**: stores fingerprint at `<pkg>/dist/.build-fingerprint` so that
 *   deleting `dist/` (clean build) automatically invalidates the cache.
 * - **test / check**: stores in `.proman/<command>/` directory, which is
 *   independent of build artifacts and survives `dist/` cleanup.
 *
 * This separation ensures `rm -rf dist` forces a rebuild without
 * accidentally invalidating test/check caches (and vice-versa).
 */
export function fingerprintPath(cwd: string, command: string, pkgName?: string): string {
  if (command === 'build' && pkgName) {
    // For build command, store fingerprint inside package's dist folder
    return join(cwd, 'dist/.build-fingerprint')
  }

  // For test/check commands or when no package name, use .proman directory
  const filename = pkgName ? `${pkgNameToFilename(pkgName)}.fingerprint` : 'root.fingerprint'
  return join(cwd, '.proman', command, filename)
}

/**
 * Check if a build cache is still valid: hash matches AND all recorded outputs exist on disk.
 * If outputs list is missing/empty (e.g. old format or non-build command), returns false
 * to force a rebuild — strict mode, no blind trust.
 */
export function isBuildCacheValid(
  distDir: string,
  stored: StoredFingerprint | null,
  expectedHash: string,
): boolean {
  if (!stored || stored.hash !== expectedHash) return false
  if (!stored.outputs || stored.outputs.length === 0) return false
  return stored.outputs.every((f) => existsSync(join(distDir, f)))
}
