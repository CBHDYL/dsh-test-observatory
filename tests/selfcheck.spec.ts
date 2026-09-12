// Coverage for the generation-time self check. Each rule here exists because
// the report once broke it: a count that disagreed with its own rows, a journey
// cleared with nothing asserted, a verdict that ignored the findings.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { verifyReport } from '../src/report/selfcheck.ts'
import type { Journey, ReportModel, ReportTest } from '../src/report/types.ts'

/** A report with nothing to report. */
function model(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    meta: { project: 'P', branch: '', commit: 'abc123', environment: 'local', runAt: 'now', runId: '1' },
    verdict: { score: 100, headline: 'h', label: 'READY', summary: 's', confidence: 'high', risk: 'r', reasons: ['no executed test failed', 'coverage was measured'] },
    kpis: [],
    summary: { total: 1, passed: 1, failed: 0, findings: 0, skipped: 0, flaky: 0, durationSeconds: 1, coveragePercent: 80 },
    trend: [], causes: [], slowest: [], timeline: [], regressions: [], recovered: [],
    tests: [{ kind: 'test', name: 't', path: 't.ts', status: 'passed', suite: 'S', durationSeconds: 1, owner: 'O' }],
    journeys: [],
    evidence: [],
    checks: [],
    ...overrides,
  } as ReportModel
}

/** One journey that asserted its outcome. */
function journey(overrides: Partial<Journey> = {}): Journey {
  return { personaId: 'p', name: 'J', steps: [], verdict: 'PASS', assertions: 2, ...overrides }
}

/** One open finding row. */
function findingRow(): ReportTest {
  return { kind: 'finding', name: 'PLR0402 · a.py:7', path: 'a.py', status: 'failed', suite: 'Static analysis', durationSeconds: 0, owner: 'O' }
}

describe('report self check', () => {
  it('passes a coherent report', () => {
    expect(verifyReport(model())).toEqual([])
  })

  it('catches a finding count that disagrees with its rows', () => {
    const violations = verifyReport(model({ summary: { ...model().summary, findings: 3 }, tests: [...model().tests, findingRow()] }))
    expect(violations.map(v => v.rule)).toContain('finding-count-disagrees-with-rows')
  })

  it('catches a journey cleared with nothing asserted', () => {
    const violations = verifyReport(model({ journeys: [journey({ assertions: 0 })] }))
    expect(violations.map(v => v.rule)).toContain('journey-cleared-without-an-assertion')
  })

  it('catches a verdict cleared while a blocking finding is open', () => {
    const check = { rule: 'axe:color-contrast', detail: 'd', severity: 'high' as const, family: 'accessibility' as const, persona: 'p' }
    const violations = verifyReport(model({ checks: [check] }))
    expect(violations.map(v => v.rule)).toContain('verdict-cleared-with-open-blockers')
  })

  it('catches a blocking finding the verdict does not name', () => {
    const check = { rule: 'axe:color-contrast', detail: 'd', severity: 'high' as const, family: 'accessibility' as const, persona: 'p' }
    const violations = verifyReport(model({ verdict: { ...model().verdict, label: 'NEEDS REVIEW', reasons: ['no executed test failed'] }, checks: [check] }))
    expect(violations.map(v => v.rule)).toContain('blockers-absent-from-the-reasons')
  })

  it('catches a keyboard journey cleared against a blocking keyboard finding', () => {
    const check = { rule: 'keyboard-focus-not-visible', detail: 'd', severity: 'high' as const, family: 'keyboard' as const, persona: 'p' }
    const violations = verifyReport(model({ verdict: { ...model().verdict, label: 'NEEDS REVIEW', reasons: ['1 blocking keyboard finding'] }, checks: [check], journeys: [journey({ name: '键盘旅程' })] }))
    expect(violations.map(v => v.rule)).toContain('keyboard-journey-cleared-against-blocking-findings')
  })

  it('catches a trend shown without a commit to compare against', () => {
    const violations = verifyReport(model({ meta: { ...model().meta, commit: '' }, trend: [{ run: '1', score: 90, durationSeconds: 1 }], verdict: { ...model().verdict, reasons: ['coverage was measured', 'coverage'] } }))
    expect(violations.map(v => v.rule)).toContain('trend-without-a-comparable-run')
  })

  it('catches unknown coverage the verdict does not state', () => {
    const violations = verifyReport(model({ summary: { ...model().summary, coveragePercent: null }, verdict: { ...model().verdict, reasons: [] } }))
    expect(violations.map(v => v.rule)).toContain('unknown-coverage-not-stated')
  })

  it('names evidence that cannot be placed in a run', () => {
    const shot = { id: 'e1', title: 't', personaId: 'p', journey: 'J', stepLabel: 's', kind: 'key' as const, meta: 'm', imageDataUri: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }
    const violations = verifyReport(model({ evidence: [shot] }))
    expect(violations.map(v => v.rule)).toContain('evidence-without-provenance')
  })

  it('catches evidence that is not self-contained', () => {
    const shot = { id: 'e1', title: 't', personaId: 'p', journey: 'J', stepLabel: 's', kind: 'key' as const, meta: 'm', imageDataUri: 'https://example.test/a.png' }
    const violations = verifyReport(model({ evidence: [shot] }))
    expect(violations.map(v => v.rule)).toContain('evidence-not-self-contained')
  })
})
