import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cardsIndex, cardsList, cardsOrphans, cardsQuery } from './cards.js'

describe('proman cards', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `proman-cards-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('cards index', () => {
    test('scans cards/*.md and generates .cards-index.json', async () => {
      const cardsDir = join(testDir, 'cards')
      mkdirSync(cardsDir, { recursive: true })

      writeFileSync(
        join(cardsDir, 'plugin-system.md'),
        `---
id: nerve-plugin-system
title: Plugin 加载机制
sources:
  - src/plugins/loader.ts
  - src/plugins/registry.ts
tags: [architecture, plugins]
---

# Plugin System

Some content here.
`,
      )

      writeFileSync(
        join(cardsDir, 'config-loading.md'),
        `---
id: config-loading
title: 配置加载流程
sources:
  - src/config/loader.ts
tags: [config, core]
---

# Config Loading

Some content here.
`,
      )

      const result = await cardsIndex({ cwd: testDir })

      expect(result.count).toBe(2)

      const indexPath = join(testDir, '.cards-index.json')
      expect(existsSync(indexPath)).toBe(true)

      const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
      expect(index.by_source).toEqual({
        'src/plugins/loader.ts': ['nerve-plugin-system'],
        'src/plugins/registry.ts': ['nerve-plugin-system'],
        'src/config/loader.ts': ['config-loading'],
      })
      expect(index.by_id).toEqual({
        'nerve-plugin-system': {
          title: 'Plugin 加载机制',
          sources: ['src/plugins/loader.ts', 'src/plugins/registry.ts'],
          tags: ['architecture', 'plugins'],
        },
        'config-loading': {
          title: '配置加载流程',
          sources: ['src/config/loader.ts'],
          tags: ['config', 'core'],
        },
      })
    })

    test('handles missing cards directory gracefully', async () => {
      const result = await cardsIndex({ cwd: testDir })

      expect(result.count).toBe(0)

      const indexPath = join(testDir, '.cards-index.json')
      expect(existsSync(indexPath)).toBe(true)

      const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
      expect(index.by_source).toEqual({})
      expect(index.by_id).toEqual({})
    })

    test('handles empty cards directory gracefully', async () => {
      mkdirSync(join(testDir, 'cards'), { recursive: true })

      const result = await cardsIndex({ cwd: testDir })

      expect(result.count).toBe(0)

      const indexPath = join(testDir, '.cards-index.json')
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
      expect(index.by_source).toEqual({})
      expect(index.by_id).toEqual({})
    })
  })

  describe('cards query --sources', () => {
    test('returns cards associated with given source files', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {
            'src/plugins/loader.ts': ['nerve-plugin-system'],
            'src/plugins/registry.ts': ['nerve-plugin-system'],
            'src/config/loader.ts': ['config-loading'],
          },
          by_id: {
            'nerve-plugin-system': {
              title: 'Plugin 加载机制',
              sources: ['src/plugins/loader.ts', 'src/plugins/registry.ts'],
              tags: ['architecture', 'plugins'],
            },
            'config-loading': {
              title: '配置加载流程',
              sources: ['src/config/loader.ts'],
              tags: ['config', 'core'],
            },
          },
        }),
      )

      const result = await cardsQuery({
        cwd: testDir,
        sources: ['src/plugins/loader.ts', 'src/config/loader.ts'],
      })

      expect(result).toEqual(['nerve-plugin-system', 'config-loading'])
    })

    test('deduplicates card IDs when multiple sources match the same card', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {
            'src/plugins/loader.ts': ['nerve-plugin-system'],
            'src/plugins/registry.ts': ['nerve-plugin-system'],
          },
          by_id: {},
        }),
      )

      const result = await cardsQuery({
        cwd: testDir,
        sources: ['src/plugins/loader.ts', 'src/plugins/registry.ts'],
      })

      expect(result).toEqual(['nerve-plugin-system'])
    })

    test('silently skips source files with no associated cards', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {
            'src/plugins/loader.ts': ['nerve-plugin-system'],
          },
          by_id: {},
        }),
      )

      const result = await cardsQuery({
        cwd: testDir,
        sources: ['src/plugins/loader.ts', 'src/unknown/file.ts'],
      })

      expect(result).toEqual(['nerve-plugin-system'])
    })

    test('throws error if .cards-index.json does not exist', async () => {
      await expect(cardsQuery({ cwd: testDir, sources: ['src/foo.ts'] })).rejects.toThrow(
        /proman cards index/,
      )
    })
  })

  describe('cards query --tag', () => {
    test('returns cards matching a given tag', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {},
          by_id: {
            'nerve-plugin-system': {
              title: 'Plugin 加载机制',
              sources: ['src/plugins/loader.ts'],
              tags: ['architecture', 'plugins'],
            },
            'config-loading': {
              title: '配置加载流程',
              sources: ['src/config/loader.ts'],
              tags: ['config', 'core'],
            },
            'event-system': {
              title: 'Event System',
              sources: ['src/events/bus.ts'],
              tags: ['architecture', 'events'],
            },
          },
        }),
      )

      const result = await cardsQuery({ cwd: testDir, tag: 'architecture' })

      expect(result).toEqual(['nerve-plugin-system', 'event-system'])
    })

    test('returns empty array if no cards match the tag', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {},
          by_id: {
            'nerve-plugin-system': {
              title: 'Plugin',
              sources: [],
              tags: ['architecture'],
            },
          },
        }),
      )

      const result = await cardsQuery({ cwd: testDir, tag: 'nonexistent' })

      expect(result).toEqual([])
    })

    test('throws error if .cards-index.json does not exist', async () => {
      await expect(cardsQuery({ cwd: testDir, tag: 'foo' })).rejects.toThrow(/proman cards index/)
    })
  })

  describe('cards query --id', () => {
    test('returns full details of a card by its id', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {},
          by_id: {
            'nerve-plugin-system': {
              title: 'Plugin 加载机制',
              sources: ['src/plugins/loader.ts', 'src/plugins/registry.ts'],
              tags: ['architecture', 'plugins'],
            },
          },
        }),
      )

      const result = await cardsQuery({ cwd: testDir, id: 'nerve-plugin-system' })

      expect(result).toEqual({
        id: 'nerve-plugin-system',
        title: 'Plugin 加载机制',
        sources: ['src/plugins/loader.ts', 'src/plugins/registry.ts'],
        tags: ['architecture', 'plugins'],
      })
    })

    test('throws error if card id is not found', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {},
          by_id: {},
        }),
      )

      await expect(cardsQuery({ cwd: testDir, id: 'nonexistent' })).rejects.toThrow(
        'Card not found: nonexistent',
      )
    })

    test('throws error if .cards-index.json does not exist', async () => {
      await expect(cardsQuery({ cwd: testDir, id: 'foo' })).rejects.toThrow(/proman cards index/)
    })
  })

  describe('cards list', () => {
    test('outputs a summary of all indexed cards', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {},
          by_id: {
            'nerve-plugin-system': {
              title: 'Plugin 加载机制',
              sources: ['src/plugins/loader.ts'],
              tags: ['architecture', 'plugins'],
            },
            'config-loading': {
              title: '配置加载流程',
              sources: ['src/config/loader.ts'],
              tags: ['config', 'core'],
            },
          },
        }),
      )

      const result = await cardsList({ cwd: testDir })

      expect(result).toEqual([
        { id: 'nerve-plugin-system', title: 'Plugin 加载机制', tags: ['architecture', 'plugins'] },
        { id: 'config-loading', title: '配置加载流程', tags: ['config', 'core'] },
      ])
    })

    test('returns empty array if no cards exist', async () => {
      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({ by_source: {}, by_id: {} }),
      )

      const result = await cardsList({ cwd: testDir })

      expect(result).toEqual([])
    })

    test('throws error if .cards-index.json does not exist', async () => {
      await expect(cardsList({ cwd: testDir })).rejects.toThrow(/proman cards index/)
    })
  })

  describe('cards orphans', () => {
    test('finds source files not referenced by any card', async () => {
      // Create source files
      mkdirSync(join(testDir, 'src', 'plugins'), { recursive: true })
      mkdirSync(join(testDir, 'src', 'utils'), { recursive: true })
      mkdirSync(join(testDir, 'src', 'core'), { recursive: true })
      mkdirSync(join(testDir, 'src', 'config'), { recursive: true })
      writeFileSync(join(testDir, 'src', 'plugins', 'loader.ts'), '')
      writeFileSync(join(testDir, 'src', 'plugins', 'registry.ts'), '')
      writeFileSync(join(testDir, 'src', 'config', 'loader.ts'), '')
      writeFileSync(join(testDir, 'src', 'utils', 'helpers.ts'), '')
      writeFileSync(join(testDir, 'src', 'core', 'engine.ts'), '')

      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {
            'src/plugins/loader.ts': ['nerve-plugin-system'],
            'src/plugins/registry.ts': ['nerve-plugin-system'],
            'src/config/loader.ts': ['config-loading'],
          },
          by_id: {},
        }),
      )

      const result = await cardsOrphans({ cwd: testDir, srcPaths: ['src/'] })

      expect(result.sort()).toEqual(['src/utils/helpers.ts', 'src/core/engine.ts'].sort())
    })

    test('returns empty array if all source files are referenced', async () => {
      mkdirSync(join(testDir, 'src', 'plugins'), { recursive: true })
      writeFileSync(join(testDir, 'src', 'plugins', 'loader.ts'), '')

      writeFileSync(
        join(testDir, '.cards-index.json'),
        JSON.stringify({
          by_source: {
            'src/plugins/loader.ts': ['nerve-plugin-system'],
          },
          by_id: {},
        }),
      )

      const result = await cardsOrphans({ cwd: testDir, srcPaths: ['src/'] })

      expect(result).toEqual([])
    })

    test('throws error if .cards-index.json does not exist', async () => {
      await expect(cardsOrphans({ cwd: testDir, srcPaths: ['src/'] })).rejects.toThrow(
        /proman cards index/,
      )
    })
  })
})
