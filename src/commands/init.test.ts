import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { init } from './init.ts'

describe('proman init', () => {
  let testDir: string

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(
      tmpdir(),
      `proman-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up the test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('creates full monorepo structure with target directory', async () => {
    const projectDir = join(testDir, 'my-project')

    await init({ targetDir: projectDir })

    // Verify root directory exists
    expect(existsSync(projectDir)).toBe(true)

    // Verify root files
    const rootPackageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'))
    expect(rootPackageJson.private).toBe(true)
    expect(rootPackageJson.scripts).toBeDefined()
    expect(rootPackageJson.scripts.build).toBe('proman build')
    expect(rootPackageJson.scripts.test).toBe('proman test')
    expect(rootPackageJson.scripts.check).toBe('proman check')
    expect(rootPackageJson.scripts.format).toBe('proman format')
    expect(rootPackageJson.devDependencies['@shazhou/proman']).toBeDefined()

    expect(existsSync(join(projectDir, 'proman.yaml'))).toBe(true)
    expect(existsSync(join(projectDir, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(projectDir, 'biome.json'))).toBe(true)
    expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(projectDir, '.gitignore'))).toBe(true)

    // Verify gitignore content
    const gitignore = readFileSync(join(projectDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('node_modules')
    expect(gitignore).toContain('dist')
    expect(gitignore).toContain('.proman')
    expect(gitignore).toContain('*.tsbuildinfo')

    // Verify pnpm-workspace.yaml
    const workspace = readFileSync(join(projectDir, 'pnpm-workspace.yaml'), 'utf-8')
    expect(workspace).toContain('packages/*')

    // Verify core package
    const corePackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/core/package.json'), 'utf-8'),
    )
    expect(corePackageJson.name).toBe('@my-project/core')
    expect(corePackageJson.type).toBe('module')
    expect(corePackageJson.exports).toBeDefined()

    expect(existsSync(join(projectDir, 'packages/core/tsconfig.json'))).toBe(true)
    expect(existsSync(join(projectDir, 'packages/core/src/index.ts'))).toBe(true)
    expect(existsSync(join(projectDir, 'packages/core/src/index.test.ts'))).toBe(true)

    const coreIndex = readFileSync(join(projectDir, 'packages/core/src/index.ts'), 'utf-8')
    expect(coreIndex).toContain('export function hello()')

    const coreTest = readFileSync(join(projectDir, 'packages/core/src/index.test.ts'), 'utf-8')
    expect(coreTest).toContain('import')
    expect(coreTest).toContain('hello')

    // Verify CLI package
    const cliPackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/cli/package.json'), 'utf-8'),
    )
    expect(cliPackageJson.name).toBe('@my-project/cli')
    expect(cliPackageJson.bin).toEqual({ 'my-project': 'dist/cli.js' })
    expect(cliPackageJson.dependencies).toEqual({ '@my-project/core': 'workspace:*' })

    expect(existsSync(join(projectDir, 'packages/cli/tsconfig.json'))).toBe(true)
    expect(existsSync(join(projectDir, 'packages/cli/src/cli.ts'))).toBe(true)
    expect(existsSync(join(projectDir, 'packages/cli/src/cli.test.ts'))).toBe(true)

    const cliSrc = readFileSync(join(projectDir, 'packages/cli/src/cli.ts'), 'utf-8')
    expect(cliSrc).toContain('#!/usr/bin/env node')
    expect(cliSrc).toContain('@my-project/core')

    const cliTest = readFileSync(join(projectDir, 'packages/cli/src/cli.test.ts'), 'utf-8')
    expect(cliTest).toContain('test')
  })

  test('init in current directory when no arg provided', async () => {
    const projectDir = join(testDir, 'test-repo')
    mkdirSync(projectDir)

    await init({ targetDir: projectDir })

    // Verify packages use directory name
    const corePackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/core/package.json'), 'utf-8'),
    )
    expect(corePackageJson.name).toBe('@test-repo/core')

    const cliPackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/cli/package.json'), 'utf-8'),
    )
    expect(cliPackageJson.name).toBe('@test-repo/cli')
    expect(cliPackageJson.bin).toEqual({ 'test-repo': 'dist/cli.js' })
  })

  test('fails when target directory is not empty', async () => {
    const projectDir = join(testDir, 'existing-project')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'README.md'), '# existing')

    await expect(init({ targetDir: projectDir })).rejects.toThrow(
      /Directory is not empty.*existing-project/,
    )
  })

  test('fails when target directory exists with content', async () => {
    const projectDir = join(testDir, 'my-project')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'package.json'), '{}')

    await expect(init({ targetDir: projectDir })).rejects.toThrow(/not empty/)
  })

  test('sanitizes directory name with uppercase and special chars', async () => {
    const projectDir = join(testDir, 'My-Project_v2!')
    await init({ targetDir: projectDir })

    const corePackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/core/package.json'), 'utf-8'),
    )
    expect(corePackageJson.name).toBe('@my-project_v2-/core')
  })

  test('sanitizes directory name starting with dot', async () => {
    const projectDir = join(testDir, '.hidden-project')
    await init({ targetDir: projectDir })

    const corePackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/core/package.json'), 'utf-8'),
    )
    expect(corePackageJson.name).toBe('@hidden-project/core')
  })

  test('strips tilde from directory name', async () => {
    const projectDir = join(testDir, 'my~project')
    await init({ targetDir: projectDir })

    const corePackageJson = JSON.parse(
      readFileSync(join(projectDir, 'packages/core/package.json'), 'utf-8'),
    )
    expect(corePackageJson.name).toBe('@my-project/core')
  })
})
