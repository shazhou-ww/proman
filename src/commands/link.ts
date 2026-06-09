import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defaultSpawn, runOrThrow, type SpawnFn } from '../utils/npm.ts'

export type LinkCommandOptions = {
  cwd: string
  packageName?: string
  spawn?: SpawnFn
}

function readPackageJson(cwd: string): {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error('Not in a package directory')
  }
  const json = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return json
}

function hasDistFolder(cwd: string): boolean {
  const distPath = join(cwd, 'dist')
  return existsSync(distPath)
}

/**
 * Link a package globally (provider mode) or link from global registry (consumer mode)
 */
export async function link(opts: LinkCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)

  // Consumer mode: link specific package from global registry
  if (opts.packageName) {
    const pkg = readPackageJson(cwd)
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (!allDeps[opts.packageName]) {
      throw new Error(`${opts.packageName} is not in dependencies or devDependencies`)
    }

    await runOrThrow(spawn, ['pnpm', 'link', '--global', opts.packageName], cwd)
    console.log(`✓ Linked ${opts.packageName} from global registry`)
    return
  }

  // Provider mode: link current package globally
  const pkg = readPackageJson(cwd)
  if (!pkg.name) {
    throw new Error('Not in a package directory')
  }

  if (!hasDistFolder(cwd)) {
    throw new Error('No build artifacts found. Run `proman build` first.')
  }

  await runOrThrow(spawn, ['pnpm', 'link', '--global'], cwd)
  console.log(`✓ Linked ${pkg.name} globally`)
}

/**
 * Show currently linked packages
 */
export async function linkStatus(opts: Omit<LinkCommandOptions, 'packageName'>): Promise<string> {
  const cwd = resolve(opts.cwd)
  const nodeModulesDir = join(cwd, 'node_modules')

  if (!existsSync(nodeModulesDir)) {
    return 'No linked packages found'
  }

  const linkedPackages: { name: string; target: string }[] = []

  // Scan node_modules for symlinks
  function scanDir(dir: string, prefix = ''): void {
    if (!existsSync(dir)) return

    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      const stat = lstatSync(fullPath)

      // Check if it's a symlink
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(fullPath)
        const resolvedTarget = resolve(dir, target)
        const pkgJsonPath = join(fullPath, 'package.json')

        if (existsSync(pkgJsonPath)) {
          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
            const name = pkgJson.name || `${prefix}${entry}`
            linkedPackages.push({ name, target: resolvedTarget })
          } catch {
            // Invalid package.json, skip
          }
        }
      } else if (stat.isDirectory() && entry.startsWith('@')) {
        // Scan scoped packages
        scanDir(fullPath, `${entry}/`)
      }
    }
  }

  scanDir(nodeModulesDir)

  if (linkedPackages.length === 0) {
    return 'No linked packages found'
  }

  const lines = ['Linked packages:']
  for (const { name, target } of linkedPackages) {
    lines.push(`• ${name} → ${target}`)
  }

  return lines.join('\n')
}

/**
 * Unlink packages (all or specific)
 */
export async function unlink(opts: LinkCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)

  // Unlink specific package
  if (opts.packageName) {
    await runOrThrow(spawn, ['pnpm', 'unlink', opts.packageName], cwd)
    await runOrThrow(spawn, ['pnpm', 'install', opts.packageName], cwd)
    console.log(`✓ Unlinked ${opts.packageName} and restored from registry`)
    return
  }

  // Unlink all packages
  const nodeModulesDir = join(cwd, 'node_modules')

  if (!existsSync(nodeModulesDir)) {
    console.log('No linked packages to unlink')
    return
  }

  const linkedPackages: string[] = []

  // Find all symlinked packages
  function scanDir(dir: string): void {
    if (!existsSync(dir)) return

    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      const stat = lstatSync(fullPath)

      if (stat.isSymbolicLink()) {
        const pkgJsonPath = join(fullPath, 'package.json')
        if (existsSync(pkgJsonPath)) {
          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
            if (pkgJson.name) {
              linkedPackages.push(pkgJson.name)
            }
          } catch {
            // Invalid package.json, skip
          }
        }
      } else if (stat.isDirectory() && entry.startsWith('@')) {
        scanDir(fullPath)
      }
    }
  }

  scanDir(nodeModulesDir)

  if (linkedPackages.length === 0) {
    console.log('No linked packages to unlink')
    return
  }

  // Unlink each package
  for (const pkgName of linkedPackages) {
    await runOrThrow(spawn, ['pnpm', 'unlink', pkgName], cwd)
  }

  // Restore all packages
  await runOrThrow(spawn, ['pnpm', 'install'], cwd)

  console.log(`✓ Unlinked ${linkedPackages.length} package(s) and restored from registry`)
}
