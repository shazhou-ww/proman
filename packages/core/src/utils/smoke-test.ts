import { mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnFn } from './npm.js'

type PackageJson = {
  name: string
  version: string
  bin?: string | Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
}

/**
 * Map of workspace package names → absolute paths on disk.
 * Used to symlink workspace dependencies into the smoke test directory
 * so bin commands can resolve them without npm install.
 */
export type WorkspacePackages = Record<string, string>

/**
 * Smoke test a package using priority-based strategy:
 * 1. If package.json has a "smoke" script → run `pnpm run smoke`
 * 2. If no smoke script but has bin entries → fallback to tarball strategy
 * 3. If neither → skip entirely
 *
 * @param workspacePackages - Map of workspace package names to their absolute
 *   paths. When provided, workspace dependencies are symlinked into the
 *   extracted tarball's node_modules so bin commands can resolve them.
 */
export async function smokeTest(
  pkgDir: string,
  spawn: SpawnFn,
  workspacePackages?: WorkspacePackages,
): Promise<void> {
  const pkgJsonPath = join(pkgDir, 'package.json')
  const pkgJsonText = await readFile(pkgJsonPath, 'utf8')
  const pkgJson = JSON.parse(pkgJsonText) as PackageJson

  // Priority 1: Use custom smoke script if available
  if (pkgJson.scripts?.smoke) {
    const result = await spawn(['pnpm', 'run', 'smoke'], pkgDir)
    if (result.code !== 0) {
      const errorMsg = result.stderr.trim() || result.stdout.trim()
      throw new Error(`smoke test failed: ${errorMsg || 'non-zero exit code'}`)
    }
    return
  }

  // Priority 2: Fallback to tarball-based bin --version strategy
  // Priority 3: Skip if no bin entries (handled inside smokeTestTarball)
  await smokeTestTarball(pkgDir, spawn, workspacePackages)
}

/**
 * Smoke test a package tarball by extracting it and running bin commands.
 * Validates that the packaged artifact actually works before publishing.
 *
 * @param workspacePackages - Map of workspace package names to their absolute
 *   paths. When provided, workspace dependencies are symlinked into the
 *   extracted tarball's node_modules so bin commands can resolve them.
 */
export async function smokeTestTarball(
  pkgDir: string,
  spawn: SpawnFn,
  workspacePackages?: WorkspacePackages,
): Promise<void> {
  // Read package.json to check for bin entries
  const pkgJsonPath = join(pkgDir, 'package.json')
  const pkgJsonText = await readFile(pkgJsonPath, 'utf8')
  const pkgJson = JSON.parse(pkgJsonText) as PackageJson

  // Skip if no bin entry
  if (!pkgJson.bin) {
    return
  }

  // Normalize bin to Record format
  const binEntries: Record<string, string> =
    typeof pkgJson.bin === 'string' ? { [pkgJson.name]: pkgJson.bin } : pkgJson.bin

  // Skip if bin is empty
  if (Object.keys(binEntries).length === 0) {
    return
  }

  // Step 1: Create tarball with pnpm pack
  const packResult = await spawn(['pnpm', 'pack'], pkgDir)
  if (packResult.code !== 0) {
    throw new Error(`pnpm pack failed: ${packResult.stderr || packResult.stdout}`)
  }

  // pnpm pack outputs verbose info (📦, file list, etc.)
  // Extract the .tgz filename from the output
  const tgzMatch = packResult.stdout.match(/[\w@.-]+\.tgz/)
  if (!tgzMatch) {
    throw new Error(`pnpm pack did not return tarball filename. Output: ${packResult.stdout}`)
  }
  const tarballName = tgzMatch[0]

  // Step 2: Extract tarball to temp directory
  const { mkdtemp } = await import('node:fs/promises')
  const testDir = await mkdtemp(join(tmpdir(), 'proman-smoke-'))

  try {
    // Extract tarball
    const tarballPath = join(pkgDir, tarballName)
    const extractResult = await spawn(['tar', '-xzf', tarballPath, '-C', testDir], pkgDir)
    if (extractResult.code !== 0) {
      throw new Error(`tar extract failed: ${extractResult.stderr}`)
    }

    // pnpm pack creates a 'package/' directory inside the tarball
    const extractedPkgDir = join(testDir, 'package')

    // Step 3: Symlink workspace dependencies into node_modules
    if (workspacePackages) {
      const deps = pkgJson.dependencies ?? {}
      const nodeModulesDir = join(extractedPkgDir, 'node_modules')

      for (const [depName, depPath] of Object.entries(workspacePackages)) {
        if (depName in deps) {
          // Handle scoped packages: @scope/name → node_modules/@scope/name
          const segments = depName.split('/')
          if (segments.length === 2) {
            await mkdir(join(nodeModulesDir, segments[0] as string), { recursive: true })
          } else {
            await mkdir(nodeModulesDir, { recursive: true })
          }
          await symlink(depPath, join(nodeModulesDir, depName), 'dir')
        }
      }
    }

    // Step 4: Test each bin entry
    for (const [binName, binPath] of Object.entries(binEntries)) {
      const binFullPath = join(extractedPkgDir, binPath)
      const binTestResult = await spawn(['node', binFullPath, '--version'], extractedPkgDir)

      if (binTestResult.code !== 0) {
        const errorMsg = binTestResult.stderr.trim() || binTestResult.stdout.trim()
        throw new Error(
          `smoke test failed for bin '${binName}': ${errorMsg || 'non-zero exit code'}`,
        )
      }
    }
  } finally {
    // Step 5: Always clean up temp directory and tarball
    await rm(testDir, { recursive: true, force: true })
    await rm(join(pkgDir, tarballName), { force: true })
  }
}
