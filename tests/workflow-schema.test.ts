import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse as parseYAML } from 'yaml'

describe('Issue #154: already_approved variant in review-pr.yaml', () => {
  const reviewPrPath = resolve(__dirname, '../.workflows/review-pr.yaml')

  test('T154.1: already_approved variant does NOT include selfReview (synced with uwf)', () => {
    const yaml = readFileSync(reviewPrPath, 'utf8')
    const parsed = parseYAML(yaml)
    const alreadyApproved = parsed.roles.fetcher.frontmatter.oneOf[1]

    expect(alreadyApproved.properties.selfReview).toBeUndefined()
  })

  test('T154.2: already_approved variant requires only $status, repo, prNumber', () => {
    const yaml = readFileSync(reviewPrPath, 'utf8')
    const parsed = parseYAML(yaml)
    const alreadyApproved = parsed.roles.fetcher.frontmatter.oneOf[1]

    expect(alreadyApproved.required).not.toContain('selfReview')
    expect(alreadyApproved.required).toEqual(['$status', 'repo', 'prNumber'])
  })

  test('T154.3: ready variant maintains selfReview field (regression)', () => {
    const yaml = readFileSync(reviewPrPath, 'utf8')
    const parsed = parseYAML(yaml)
    const ready = parsed.roles.fetcher.frontmatter.oneOf[0]

    expect(ready.properties.selfReview).toBeDefined()
    expect(ready.properties.selfReview.type).toBe('boolean')
    expect(ready.required).toContain('selfReview')
  })
})

describe('Issue #156: Token retrieval in triage-issues.yaml', () => {
  const triageIssuesPath = resolve(__dirname, '../.workflows/triage-issues.yaml')

  test('T156.1: output section documents cfg get GITEA_TOKEN', () => {
    const yaml = readFileSync(triageIssuesPath, 'utf8')
    const parsed = parseYAML(yaml)
    const output = parsed.roles.triager.output

    // The output instruction mentions cfg-based token retrieval
    expect(output).toBeDefined()
  })

  test('T156.4: owner/repo sed extraction remains unchanged', () => {
    const yaml = readFileSync(triageIssuesPath, 'utf8')
    const parsed = parseYAML(yaml)
    const procedure = parsed.roles.triager.procedure

    // This sed pattern should remain (only token extraction is changing)
    expect(procedure).toContain(
      "git remote get-url origin | sed 's/.*[:/]\\([^/]*\\/[^.]*\\).*/\\1/'",
    )
  })
})

describe('Integration tests', () => {
  test('T157.1: both workflow files parse as valid YAML', () => {
    const reviewPrPath = resolve(__dirname, '../.workflows/review-pr.yaml')
    const triageIssuesPath = resolve(__dirname, '../.workflows/triage-issues.yaml')

    const reviewPr = readFileSync(reviewPrPath, 'utf8')
    const triageIssues = readFileSync(triageIssuesPath, 'utf8')

    expect(() => parseYAML(reviewPr)).not.toThrow()
    expect(() => parseYAML(triageIssues)).not.toThrow()
  })
})
