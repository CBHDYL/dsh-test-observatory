// @vitest-environment jsdom
// The report is itself a page, and a page that reports accessibility problems
// has no excuse for having them. This runs axe over a rendered report and fails
// on anything it finds, so the report is held to the standard it applies.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { renderReport } from '../src/report/render.ts'
import type { ReportModel } from '../src/report/types.ts'

/** A report carrying one of everything the pages render. */
function model(): ReportModel {
  return {
    meta: { project: 'Atlas', branch: 'main', commit: 'abc123', environment: 'local', runAt: 'now', runId: '242424' },
    verdict: { score: 90, headline: 'Headline', label: 'NEEDS REVIEW', summary: 'Summary', confidence: 'limited', risk: 'Risk', reasons: ['3 open blocking finding(s) that no test covers'] },
    kpis: [{ label: 'Pass rate', value: '100%', delta: '40 of 40' }],
    summary: { total: 40, passed: 40, failed: 0, findings: 1, skipped: 0, flaky: 0, durationSeconds: 9, coveragePercent: null },
    trend: [], causes: [{ label: 'Open static-analysis result', count: 1 }], slowest: [], timeline: [],
    regressions: [], recovered: [],
    tests: [{ kind: 'test', name: 'renders', path: 'a.test.ts', status: 'passed', suite: 'Unit', durationSeconds: 0.5, owner: 'Team' }],
    experience: { total: 90, band: 'Excellent', tasksObserved: 1, tasksCompleted: 1, blockers: 0, recoverablePoints: 0, dimensions: [] },
    personas: [{ id: 'new', name: 'First-time visitor', device: 'Desktop', tasks: 1, completionPercent: 100, headline: 'Discovery' }],
    journeys: [{ personaId: 'new', name: 'Open the storefront', steps: [{ label: 'Open', state: 'PASS', seconds: 1 }], verdict: 'FAIL', assertions: 1, verdictReasons: ['the run recorded 1 blocking keyboard finding'] }],
    evidence: [{ id: 'e1', title: 'Storefront', personaId: 'new', journey: 'Open the storefront', stepLabel: 'Open', kind: 'key', meta: 'Desktop', imageDataUri: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }],
    findings: [],
    checks: [{ rule: 'axe:color-contrast', detail: 'Elements must meet minimum contrast ratio thresholds', severity: 'high', family: 'accessibility', persona: 'First-time visitor', requirement: 'Text must be readable against its background.', fix: 'Darken the text.', helpUrl: 'https://example.test/rule', evidence: [{ tag: 'span', selector: '.tag', text: 'new', box: { x: 0, y: 0, width: 10, height: 10, space: 'viewport' } }] }],
  }
}

/** Render the report and run its script the way a browser does. */
async function paint(): Promise<Document> {
  const dom = new JSDOM(renderReport(model()), { runScripts: 'dangerously', virtualConsole: new VirtualConsole() })
  await new Promise(resolve => { setTimeout(resolve, 50) })
  return dom.window.document
}

/** The axe-core bundle, run against a jsdom document. */
async function scan(document: Document): Promise<readonly { id: string; nodes: number }[]> {
  const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  const window = document.defaultView as unknown as { eval: (source: string) => void; axe: { run: (context: Document) => Promise<{ violations: readonly { id: string; nodes: readonly unknown[] }[] }> } }
  window.eval(axeSource)
  const report = await window.axe.run(document)
  return report.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.length }))
}

/**
 * Rules this report does not yet satisfy, with what each one asks for. Every
 * entry is a known gap rather than an accepted design: the list may only shrink.
 */
const KNOWN_GAPS: Readonly<Record<string, string>> = {}

describe('the report against its own standard', () => {
  it('reports no accessibility violation axe can see beyond the known gaps', async () => {
    const violations = await scan(await paint())
    const unexpected = violations
      .filter(violation => KNOWN_GAPS[violation.id] === undefined)
      .map(violation => violation.id + ' (' + String(violation.nodes) + ' node(s))')
    expect(unexpected).toEqual([])
  }, 30_000)

  it('keeps the known gaps honest, so one cannot outlive its fix', async () => {
    const seen = new Set((await scan(await paint())).map(violation => violation.id))
    for (const rule of Object.keys(KNOWN_GAPS)) {
      expect(seen.has(rule), rule + ': listed as a gap but axe no longer reports it').toBe(true)
    }
  }, 30_000)
})
