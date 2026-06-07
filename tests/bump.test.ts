import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { parseBumpArgs } from '../src/cli.ts'
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

// ── CLI arg parsing ──

describe('parseBumpArgs', () => {
  test('no args', () => {
    const r = parseBumpArgs([])
    expect(r.type).toBeUndefined()
  })

  test('--type patch', () => {
    const r = parseBumpArgs(['--type', 'patch'])
    expect(r.type).toBe('patch')
  })

  test('--type minor', () => {
    const r = parseBumpArgs(['--type', 'minor'])
    expect(r.type).toBe('minor')
  })

  test('--type major', () => {
    const r = parseBumpArgs(['--type', 'major'])
    expect(r.type).toBe('major')
  })

  test('rejects invalid --type', () => {
    expect(() => parseBumpArgs(['--type', 'huge'])).toThrow('must be major, minor, or patch')
  })

  test('rejects unknown flag', () => {
    expect(() => parseBumpArgs(['--foo'])).toThrow('unknown flag')
  })
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
