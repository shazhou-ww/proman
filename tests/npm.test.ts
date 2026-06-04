import { describe, expect, test } from 'vitest'
import {
  createNpmRunner,
  formatRcVersion,
  nextRcNumber,
  parseReleaseBranch,
  type SpawnFn,
} from '../src/utils/npm.ts'

describe('parseReleaseBranch', () => {
  test('parses release/0.3.0', () => {
    expect(parseReleaseBranch('release/0.3.0')).toBe('0.3.0')
  })
  test('parses prerelease branches', () => {
    expect(parseReleaseBranch('release/1.2.3-beta.1')).toBe('1.2.3-beta.1')
  })
  test('throws on main', () => {
    expect(() => parseReleaseBranch('main')).toThrow()
  })
  test('throws on feature/x', () => {
    expect(() => parseReleaseBranch('feature/x')).toThrow()
  })
  test('throws on release/ (empty)', () => {
    expect(() => parseReleaseBranch('release/')).toThrow()
  })
  test('throws on empty', () => {
    expect(() => parseReleaseBranch('')).toThrow()
  })
})

describe('nextRcNumber', () => {
  test('empty registry => 1', () => {
    expect(nextRcNumber({ baseVersion: '0.3.0', existing: [] })).toBe(1)
  })
  test('mixed versions, single rc', () => {
    expect(nextRcNumber({ baseVersion: '0.3.0', existing: ['0.3.0', '0.2.0', '0.3.0-rc.1'] })).toBe(
      2,
    )
  })
  test('finds max across multiple rcs', () => {
    expect(
      nextRcNumber({
        baseVersion: '0.3.0',
        existing: ['0.3.0-rc.1', '0.3.0-rc.2', '0.3.0-rc.5'],
      }),
    ).toBe(6)
  })
  test('ignores rc for other base', () => {
    expect(
      nextRcNumber({
        baseVersion: '0.3.0',
        existing: ['0.2.0-rc.9', '0.3.0-rc.1'],
      }),
    ).toBe(2)
  })
  test('ignores non-rc prereleases', () => {
    expect(
      nextRcNumber({
        baseVersion: '0.3.0',
        existing: ['0.3.0-beta.1', '0.3.0-alpha.4'],
      }),
    ).toBe(1)
  })
  test('handles non-numeric rc tag', () => {
    expect(
      nextRcNumber({
        baseVersion: '0.3.0',
        existing: ['0.3.0-rc.x', '0.3.0-rc.2'],
      }),
    ).toBe(3)
  })
})

describe('formatRcVersion', () => {
  test('basic', () => {
    expect(formatRcVersion('0.3.0', 1)).toBe('0.3.0-rc.1')
  })
  test('higher number', () => {
    expect(formatRcVersion('1.0.0', 7)).toBe('1.0.0-rc.7')
  })
})

describe('createNpmRunner format argv', () => {
  function makeSpawn(code = 0) {
    const calls: string[][] = []
    const fn: SpawnFn = async (argv, _cwd) => {
      calls.push(argv)
      return { code, stdout: '', stderr: 'boom' }
    }
    return { spawn: fn, calls }
  }

  test('B3: format is a function', () => {
    const { spawn } = makeSpawn()
    const runner = createNpmRunner('/root', spawn)
    expect(typeof runner.format).toBe('function')
  })

  test('runs format via pnpm', async () => {
    const { spawn, calls } = makeSpawn()
    const runner = createNpmRunner('/root', spawn)
    await runner.format()
    expect(calls[0]).toEqual(['pnpm', 'run', 'format'])
  })

  test('B4: non-zero exit throws with argv', async () => {
    const { spawn } = makeSpawn(1)
    const runner = createNpmRunner('/root', spawn)
    await expect(runner.format()).rejects.toThrow(/pnpm run format/)
  })
})

describe('createNpmRunner publish argv', () => {
  function makeSpawn() {
    const calls: string[][] = []
    const fn: SpawnFn = async (argv, _cwd) => {
      calls.push(argv)
      return { code: 0, stdout: '', stderr: '' }
    }
    return { spawn: fn, calls }
  }

  test('publishes via pnpm with --no-git-checks', async () => {
    const { spawn, calls } = makeSpawn()
    const runner = createNpmRunner('/root', spawn)
    await runner.publish('/root/packages/a', { tag: 'rc' })
    const last = calls[calls.length - 1] as string[]
    expect(last[0]).toBe('pnpm')
    expect(last[1]).toBe('publish')
    expect(last).toContain('--no-git-checks')
    expect(last).toContain('--tag')
    expect(last).toContain('rc')
  })

  test('passes --access public', async () => {
    const { spawn, calls } = makeSpawn()
    const runner = createNpmRunner('/root', spawn)
    await runner.publish('/root/packages/a', { tag: 'rc', access: 'public' })
    const last = calls[calls.length - 1] as string[]
    expect(last).toContain('--access')
    expect(last).toContain('public')
  })
})
