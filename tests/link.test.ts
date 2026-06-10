import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { link, linkStatus, unlink } from '../src/commands/link.ts'
import type { SpawnFn } from '../src/utils/npm.ts'

type Call = { argv: string[]; cwd: string }

function makeSpawn(code = 0, stdout = '', stderr = '') {
  const calls: Call[] = []
  const fn: SpawnFn = async (argv, cwd) => {
    calls.push({ argv, cwd })
    return { code, stdout, stderr }
  }
  return { spawn: fn, calls }
}

describe('link command - provider mode (without args)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(
      tmpdir(),
      `proman-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('Test 1: links current package globally with build artifacts', async () => {
    // Given: package directory with dist/ folder
    const pkgDir = tmpDir
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'dist/index.js'), 'export const x = 1')
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@scope/test-pkg', version: '1.0.0' }),
    )

    const { spawn, calls } = makeSpawn()

    // When: user runs proman link
    await link({ cwd: pkgDir, spawn })

    // Then: pnpm link --global is called
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'link', '--global'])
    expect(calls[0]?.cwd).toBe(pkgDir)
  })

  test('Test 2: throws error when no build artifacts exist', async () => {
    // Given: package directory without dist/ folder
    const pkgDir = tmpDir
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@scope/test-pkg', version: '1.0.0' }),
    )

    const { spawn } = makeSpawn()

    // When/Then: should throw error about missing build
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow('No dist/ folder in')
  })

  test('Test 3: throws error when not in package directory', async () => {
    // Given: directory without package.json
    const pkgDir = tmpDir

    const { spawn } = makeSpawn()

    // When/Then: should throw error
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow('Missing package.json in')
  })

  test('Test 4: throws error when package.json has no name field', async () => {
    // Given: package.json without name
    const pkgDir = tmpDir
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: '1.0.0' }))

    const { spawn } = makeSpawn()

    // When/Then: should throw error
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow('missing a "name" field')
  })
})

describe('link command - consumer mode (with package arg)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(
      tmpdir(),
      `proman-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('Test 4: links specific package from global registry', async () => {
    // Given: consumer project with package in dependencies
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: '@consumer/app',
        version: '1.0.0',
        dependencies: { '@scope/some-package': '^1.0.0' },
      }),
    )

    const { spawn, calls } = makeSpawn()

    // When: user runs proman link @scope/some-package
    await link({ cwd: consumerDir, packageName: '@scope/some-package', spawn })

    // Then: pnpm link --global @scope/some-package is called
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'link', '--global', '@scope/some-package'])
    expect(calls[0]?.cwd).toBe(consumerDir)
  })

  test('Test 5: throws error when package not in dependencies', async () => {
    // Given: consumer project without the package in deps
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: '@consumer/app',
        version: '1.0.0',
        dependencies: {},
      }),
    )

    const { spawn } = makeSpawn()

    // When/Then: should throw error
    await expect(
      link({ cwd: consumerDir, packageName: '@scope/unknown-package', spawn }),
    ).rejects.toThrow('not found in dependencies or devDependencies')
  })

  test('Test 5b: allows linking package in devDependencies', async () => {
    // Given: consumer project with package in devDependencies
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: '@consumer/app',
        version: '1.0.0',
        devDependencies: { '@scope/dev-package': '^1.0.0' },
      }),
    )

    const { spawn, calls } = makeSpawn()

    // When: user runs proman link @scope/dev-package
    await link({ cwd: consumerDir, packageName: '@scope/dev-package', spawn })

    // Then: command succeeds
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'link', '--global', '@scope/dev-package'])
  })
})

describe('linkStatus command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(
      tmpdir(),
      `proman-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('Test 6: shows linked packages with source paths', async () => {
    // Given: project with linked packages
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: '@consumer/app', version: '1.0.0' }),
    )

    // Create node_modules with symlinks
    const nodeModulesDir = join(consumerDir, 'node_modules')
    mkdirSync(join(nodeModulesDir, '@scope'), { recursive: true })

    const targetA = join(tmpdir(), 'monorepo/packages/a')
    const targetB = join(tmpdir(), 'monorepo/packages/b')
    mkdirSync(targetA, { recursive: true })
    mkdirSync(targetB, { recursive: true })
    writeFileSync(join(targetA, 'package.json'), JSON.stringify({ name: '@scope/package-a' }))
    writeFileSync(join(targetB, 'package.json'), JSON.stringify({ name: '@scope/package-b' }))

    symlinkSync(targetA, join(nodeModulesDir, '@scope', 'package-a'), 'dir')
    symlinkSync(targetB, join(nodeModulesDir, '@scope', 'package-b'), 'dir')

    const { spawn } = makeSpawn()

    // When: user runs proman link --status
    const result = await linkStatus({ cwd: consumerDir, spawn })

    // Then: output shows both packages
    expect(result).toContain('@scope/package-a')
    expect(result).toContain('@scope/package-b')
    expect(result).toContain(targetA)
    expect(result).toContain(targetB)
  })

  test('Test 7: shows no linked packages message', async () => {
    // Given: project with no linked packages
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: '@consumer/app', version: '1.0.0' }),
    )

    const { spawn } = makeSpawn()

    // When: user runs proman link --status
    const result = await linkStatus({ cwd: consumerDir, spawn })

    // Then: message shows no linked packages
    expect(result).toBe('No linked packages found')
  })
})

describe('unlink command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(
      tmpdir(),
      `proman-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('Test 8: unlinks all packages', async () => {
    // Given: project with 2 linked packages
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: '@consumer/app', version: '1.0.0' }),
    )

    // Create symlinks
    const nodeModulesDir = join(consumerDir, 'node_modules')
    mkdirSync(join(nodeModulesDir, '@scope'), { recursive: true })

    const targetA = join(tmpdir(), `temp-a-${Date.now()}`)
    const targetB = join(tmpdir(), `temp-b-${Date.now()}`)
    mkdirSync(targetA, { recursive: true })
    mkdirSync(targetB, { recursive: true })
    writeFileSync(join(targetA, 'package.json'), JSON.stringify({ name: '@scope/package-a' }))
    writeFileSync(join(targetB, 'package.json'), JSON.stringify({ name: '@scope/package-b' }))

    symlinkSync(targetA, join(nodeModulesDir, '@scope', 'package-a'), 'dir')
    symlinkSync(targetB, join(nodeModulesDir, '@scope', 'package-b'), 'dir')

    const { spawn, calls } = makeSpawn()

    // When: user runs proman unlink
    await unlink({ cwd: consumerDir, spawn })

    // Then: pnpm unlink called for each + pnpm install
    expect(calls.length).toBe(3)
    expect(calls[0]?.argv).toEqual(['pnpm', 'unlink', '@scope/package-a'])
    expect(calls[1]?.argv).toEqual(['pnpm', 'unlink', '@scope/package-b'])
    expect(calls[2]?.argv).toEqual(['pnpm', 'install'])
  })

  test('Test 9: unlinks specific package', async () => {
    // Given: project with linked package
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: '@consumer/app', version: '1.0.0' }),
    )

    const { spawn, calls } = makeSpawn()

    // When: user runs proman unlink @scope/package-a
    await unlink({ cwd: consumerDir, packageName: '@scope/package-a', spawn })

    // Then: pnpm unlink + pnpm install for that package
    expect(calls).toHaveLength(2)
    expect(calls[0]?.argv).toEqual(['pnpm', 'unlink', '@scope/package-a'])
    expect(calls[1]?.argv).toEqual(['pnpm', 'install', '@scope/package-a'])
  })

  test('Test 10: message when no packages linked', async () => {
    // Given: project with no linked packages
    const consumerDir = tmpDir
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: '@consumer/app', version: '1.0.0' }),
    )

    const { spawn, calls } = makeSpawn()

    // When: user runs proman unlink
    await unlink({ cwd: consumerDir, spawn })

    // Then: no commands executed, only message
    expect(calls).toHaveLength(0)
  })
})

describe('readPackageJson validation', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(
      tmpdir(),
      `proman-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('Test 1: throws error for primitive string value', async () => {
    // Given: package.json with primitive string
    const pkgDir = tmpDir
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), '"just a string"')
    writeFileSync(join(pkgDir, 'dist/index.js'), '')

    const { spawn } = makeSpawn()

    // When/Then: should throw validation error
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow(
      `Invalid package.json at ${join(pkgDir, 'package.json')}`,
    )
  })

  test('Test 2: throws error for array value', async () => {
    // Given: package.json with array
    const pkgDir = tmpDir
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), '[1, 2, 3]')
    writeFileSync(join(pkgDir, 'dist/index.js'), '')

    const { spawn } = makeSpawn()

    // When/Then: should throw validation error
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow(
      `Invalid package.json at ${join(pkgDir, 'package.json')}`,
    )
  })

  test('Test 3: throws error for null value', async () => {
    // Given: package.json with null
    const pkgDir = tmpDir
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), 'null')
    writeFileSync(join(pkgDir, 'dist/index.js'), '')

    const { spawn } = makeSpawn()

    // When/Then: should throw validation error
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow(
      `Invalid package.json at ${join(pkgDir, 'package.json')}`,
    )
  })

  test('Test 4: succeeds for valid object with name', async () => {
    // Given: package.json with valid object
    const pkgDir = tmpDir
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'test-package', version: '1.0.0' }),
    )
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'dist/index.js'), '')

    const { spawn, calls } = makeSpawn()

    // When: readPackageJson is called via link command
    await link({ cwd: pkgDir, spawn })

    // Then: should succeed without throwing
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'link', '--global'])
  })

  test('Test 5: succeeds for empty object', async () => {
    // Given: package.json with empty object
    const pkgDir = tmpDir
    writeFileSync(join(pkgDir, 'package.json'), '{}')
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'dist/index.js'), '')

    const { spawn } = makeSpawn()

    // When/Then: readPackageJson succeeds, but link fails due to missing name
    // This validates that readPackageJson accepts empty objects
    await expect(link({ cwd: pkgDir, spawn })).rejects.toThrow('missing a "name" field')
  })
})
