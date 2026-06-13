import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { bump } from '../src/commands/bump.ts'

type FixtureOptions = {
  version?: string
  versions?: Record<string, string>
  withChangeset?: boolean
  changesetBody?: string
  multiPkg?: boolean
}

async function setupFixture(tmp: string, opts: FixtureOptions = {}) {
  const version = opts.version ?? '0.2.0'
  const packages = opts.multiPkg
    ? [
        { name: '@test/core', path: 'packages/core', type: 'lib' },
        { name: '@test/cli', path: 'packages/cli', type: 'cli' },
      ]
    : [{ name: '@test/core', path: 'packages/core', type: 'lib' }]

  const { stringify } = await import('yaml')
  await writeFile(join(tmp, 'proman.yaml'), stringify({ packages }))

  for (const pkg of packages) {
    const dir = join(tmp, pkg.path)
    await mkdir(dir, { recursive: true })
    const pkgVersion = opts.versions?.[pkg.name] ?? version
    await writeFile(
      join(dir, 'package.json'),
      `${JSON.stringify({ name: pkg.name, version: pkgVersion }, null, 2)}\n`,
    )
  }

  if (opts.withChangeset) {
    const csDir = join(tmp, '.changeset')
    await mkdir(csDir, { recursive: true })
    const body = opts.changesetBody ?? '---\n"@test/core": minor\n---\nAdd feature X\n'
    await writeFile(join(csDir, 'add-feature.md'), body)
  }
}

let tmp: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'proman-bump-'))
})

afterEach(async () => {
  await rm(tmp, { recursive: true })
})

// ── bump command ──

describe('bump', () => {
  test('explicit --type patch bumps all packages', async () => {
    await setupFixture(tmp, { version: '1.2.3' })
    const bumped = await bump({ type: 'patch', cwd: tmp })
    expect(bumped).toEqual({ '@test/core': '1.2.4' })

    const pkg = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    expect(pkg.version).toBe('1.2.4')
  })

  test('explicit --type minor', async () => {
    await setupFixture(tmp, { version: '1.2.3' })
    const bumped = await bump({ type: 'minor', cwd: tmp })
    expect(bumped).toEqual({ '@test/core': '1.3.0' })
  })

  test('explicit --type major', async () => {
    await setupFixture(tmp, { version: '1.2.3' })
    const bumped = await bump({ type: 'major', cwd: tmp })
    expect(bumped).toEqual({ '@test/core': '2.0.0' })
  })

  test('auto-infer from changesets (only bumps mentioned package)', async () => {
    await setupFixture(tmp, { withChangeset: true, version: '0.2.0' })
    const bumped = await bump({ cwd: tmp })
    expect(bumped).toEqual({ '@test/core': '0.3.0' }) // minor from changeset
  })

  test('rejects when no type and no changesets', async () => {
    await setupFixture(tmp)
    await expect(bump({ cwd: tmp })).rejects.toThrow('no --type specified')
  })

  test('explicit --type bumps all packages in monorepo', async () => {
    await setupFixture(tmp, { multiPkg: true, version: '1.0.0' })
    const bumped = await bump({ type: 'patch', cwd: tmp })
    expect(bumped).toEqual({ '@test/core': '1.0.1', '@test/cli': '1.0.1' })

    const core = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    const cli = JSON.parse(await readFile(join(tmp, 'packages/cli/package.json'), 'utf8'))
    expect(core.version).toBe('1.0.1')
    expect(cli.version).toBe('1.0.1')
  })

  test('changeset only bumps mentioned packages, leaves others unchanged', async () => {
    await setupFixture(tmp, {
      multiPkg: true,
      version: '1.0.0',
      withChangeset: true,
      changesetBody: '---\n"@test/core": patch\n---\nFix bug\n',
    })
    const bumped = await bump({ cwd: tmp })
    // Only core is bumped
    expect(bumped).toEqual({ '@test/core': '1.0.1' })

    const core = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    const cli = JSON.parse(await readFile(join(tmp, 'packages/cli/package.json'), 'utf8'))
    expect(core.version).toBe('1.0.1')
    expect(cli.version).toBe('1.0.0') // unchanged
  })

  test('changeset bumps multiple packages independently', async () => {
    await setupFixture(tmp, {
      multiPkg: true,
      versions: { '@test/core': '1.0.0', '@test/cli': '2.0.0' },
      withChangeset: true,
      changesetBody: '---\n"@test/core": minor\n"@test/cli": patch\n---\nMixed changes\n',
    })
    const bumped = await bump({ cwd: tmp })
    expect(bumped).toEqual({ '@test/core': '1.1.0', '@test/cli': '2.0.1' })

    const core = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    const cli = JSON.parse(await readFile(join(tmp, 'packages/cli/package.json'), 'utf8'))
    expect(core.version).toBe('1.1.0')
    expect(cli.version).toBe('2.0.1')
  })

  test('does not touch workspace:* deps', async () => {
    await setupFixture(tmp, { multiPkg: true })
    // Add workspace dep
    const cliPkg = join(tmp, 'packages/cli/package.json')
    const json = JSON.parse(await readFile(cliPkg, 'utf8'))
    json.dependencies = { '@test/core': 'workspace:*' }
    await writeFile(cliPkg, `${JSON.stringify(json, null, 2)}\n`)

    await bump({ type: 'patch', cwd: tmp })

    const updated = JSON.parse(await readFile(cliPkg, 'utf8'))
    expect(updated.dependencies['@test/core']).toBe('workspace:*')
  })
})

// ── changelog generation (issue #74) ──

describe('bump changelog', () => {
  test('changeset-infer bump generates CHANGELOG.md', async () => {
    await setupFixture(tmp, { withChangeset: true, version: '0.2.0' })
    const bumped = await bump({ cwd: tmp, now: () => new Date('2026-06-08T00:00:00Z') })

    expect(bumped).toEqual({ '@test/core': '0.3.0' })

    const changelog = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('0.3.0')
    expect(changelog).toContain('2026-06-08')
    expect(changelog).toContain('Add feature X')
  })

  test('changeset-infer bump deletes consumed changeset files', async () => {
    await setupFixture(tmp, { withChangeset: true, version: '0.2.0' })
    await bump({ cwd: tmp })

    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files.filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')).toHaveLength(
      0,
    )
  })

  test('explicit --type does not generate changelog or delete changesets', async () => {
    await setupFixture(tmp, { withChangeset: true, version: '1.0.0' })
    await bump({ type: 'patch', cwd: tmp })

    // Changeset file should still exist
    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files).toContain('add-feature.md')

    // No CHANGELOG.md generated
    const changelogExists = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8').catch(
      () => null,
    )
    expect(changelogExists).toBeNull()
  })

  test('changeset-infer bump merges multiple changesets into changelog', async () => {
    await setupFixture(tmp, { version: '1.0.0' })

    // Create two changeset files
    const csDir = join(tmp, '.changeset')
    await mkdir(csDir, { recursive: true })
    await writeFile(join(csDir, 'first.md'), '---\n"@test/core": minor\n---\nAdd feature A\n')
    await writeFile(join(csDir, 'second.md'), '---\n"@test/core": patch\n---\nFix bug B\n')

    const bumped = await bump({ cwd: tmp, now: () => new Date('2026-06-08T00:00:00Z') })
    // minor wins over patch
    expect(bumped).toEqual({ '@test/core': '1.1.0' })

    const changelog = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('1.1.0')
    expect(changelog).toContain('Add feature A')
    expect(changelog).toContain('Fix bug B')

    // Both changeset files deleted
    const files = await readdir(csDir)
    expect(files.filter((f) => f.endsWith('.md'))).toHaveLength(0)
  })

  test('changeset-infer bump prepends to existing CHANGELOG.md', async () => {
    await setupFixture(tmp, { withChangeset: true, version: '0.2.0' })

    // Pre-existing changelog
    const changelogPath = join(tmp, 'packages/core/CHANGELOG.md')
    await writeFile(changelogPath, '# Changelog\n\n## 0.1.0 — 2026-01-01\n\n- Initial release\n')

    await bump({ cwd: tmp, now: () => new Date('2026-06-08T00:00:00Z') })

    const changelog = await readFile(changelogPath, 'utf8')
    // New entry should come before old entry
    const newIdx = changelog.indexOf('0.3.0')
    const oldIdx = changelog.indexOf('0.1.0')
    expect(newIdx).toBeLessThan(oldIdx)
    expect(changelog).toContain('Add feature X')
    expect(changelog).toContain('Initial release')
  })

  test('multi-package: only generates changelog for changeset-mentioned packages', async () => {
    await setupFixture(tmp, {
      multiPkg: true,
      version: '1.0.0',
      withChangeset: true,
      changesetBody: '---\n"@test/core": patch\n---\nFix core bug\n',
    })

    await bump({ cwd: tmp, now: () => new Date('2026-06-08T00:00:00Z') })

    // core gets changelog
    const coreChangelog = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8')
    expect(coreChangelog).toContain('1.0.1')
    expect(coreChangelog).toContain('Fix core bug')

    // cli does NOT get changelog
    const cliChangelog = await readFile(join(tmp, 'packages/cli/CHANGELOG.md'), 'utf8').catch(
      () => null,
    )
    expect(cliChangelog).toBeNull()
  })

  test('changeset-infer bump uses injected now() for changelog date', async () => {
    await setupFixture(tmp, { withChangeset: true, version: '0.2.0' })
    await bump({ cwd: tmp, now: () => new Date('2025-12-25T00:00:00Z') })

    const changelog = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('2025-12-25')
  })
})
