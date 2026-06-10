import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse as parseYAML } from 'yaml'

describe('Issue #154: Add selfReview to already_approved variant in review-pr.yaml', () => {
  const reviewPrPath = resolve(__dirname, '../.workflows/review-pr.yaml')

  test('T154.1: already_approved variant includes selfReview property', () => {
    const yaml = readFileSync(reviewPrPath, 'utf8')
    const parsed = parseYAML(yaml)
    const alreadyApproved = parsed.roles.fetcher.frontmatter.oneOf[1]

    expect(alreadyApproved.properties.selfReview).toBeDefined()
    expect(alreadyApproved.properties.selfReview.type).toBe('boolean')
  })

  test('T154.2: already_approved variant requires selfReview', () => {
    const yaml = readFileSync(reviewPrPath, 'utf8')
    const parsed = parseYAML(yaml)
    const alreadyApproved = parsed.roles.fetcher.frontmatter.oneOf[1]

    expect(alreadyApproved.required).toContain('selfReview')
    expect(alreadyApproved.required).toEqual(['$status', 'repo', 'prNumber', 'selfReview'])
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

describe('Issue #156: Replace sed token extraction with cfg-based approach in triage-issues.yaml', () => {
  const triageIssuesPath = resolve(__dirname, '../.workflows/triage-issues.yaml')

  test('T156.1: procedure no longer uses sed for token extraction', () => {
    const yaml = readFileSync(triageIssuesPath, 'utf8')
    const parsed = parseYAML(yaml)
    const procedure = parsed.roles.triager.procedure

    // The old fragile pattern should be gone
    expect(procedure).not.toContain("sed 's|https://[^:]*:\\([^@]*\\)@.*|\\1|'")
    // No sed commands for extracting tokens
    expect(procedure).not.toMatch(/Extract token from git remote/)
  })

  test('T156.2: procedure uses cfg get GITEA_TOKEN', () => {
    const yaml = readFileSync(triageIssuesPath, 'utf8')
    const parsed = parseYAML(yaml)
    const procedure = parsed.roles.triager.procedure

    expect(procedure).toContain('cfg get GITEA_TOKEN')
    // Used in authorization context
    expect(procedure).toMatch(/Authorization.*GITEA_TOKEN|GITEA_TOKEN.*Authorization/i)
  })

  test('T156.3: procedure documents token retrieval approach', () => {
    const yaml = readFileSync(triageIssuesPath, 'utf8')
    const parsed = parseYAML(yaml)
    const procedure = parsed.roles.triager.procedure

    // Should mention cfg as the method
    expect(procedure).toContain('cfg get GITEA_TOKEN')
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
