import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnFn } from './npm.js'

type PackageJson = {
  name: string
  version: string
  bin?: string | Record<string, string>
}

/**
 * Smoke test a package tarball by extracting it and running bin commands.
 * Validates that the packaged artifact actually works before publishing.
 */
export async function smokeTestTarball(pkgDir: string, spawn: SpawnFn): Promise<void> {
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

    // Step 3: Test each bin entry
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
    // Step 4: Always clean up temp directory and tarball
    await rm(testDir, { recursive: true, force: true })
    await rm(join(pkgDir, tarballName), { force: true })
  }
}
