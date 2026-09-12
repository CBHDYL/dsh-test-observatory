/**
 * Shared inspection of a rendered report document, so the contract spec and any
 * check run against another build observe the document the same way.
 * @module tests/support/report-inspection
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import type { ReportModel } from '../../src/report/types.ts'

/** A model carrying every page the report can render. */
export function reportModel(): ReportModel {
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
    evidence: [{
      id: 'e1', title: 'Storefront', personaId: 'new', journey: 'Open the storefront', stepLabel: 'Open', kind: 'key', meta: 'Desktop',
      imageDataUri: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      provenance: { runId: '242424', capturedAt: 'now', artifactHash: 'abc123', findingRules: ['axe:color-contrast'] },
    }],
    findings: [],
    checks: [{ rule: 'axe:color-contrast', detail: 'contrast', severity: 'high', family: 'accessibility', persona: 'First-time visitor', requirement: 'r', fix: 'f', helpUrl: 'https://example.test/rule', evidence: [] }],
  }
}

/** What the shipped document actually navigates to and paints. */
export interface Inspection {
  /** Page names the client script knows about. */
  readonly scriptPages: readonly string[]
  /** Page names present in the document. */
  readonly documentPages: readonly string[]
  /** Page names the navigation offers. */
  readonly navPages: readonly string[]
  /** Page names carrying the active class after the script ran. */
  readonly active: readonly string[]
  /** Total text length across the active pages. */
  readonly activeTextLength: number
  /** Text of the active pages, for content assertions. */
  readonly activeText: string
}

/** Run a rendered document the way a browser does and report what it painted. */
export function inspect(html: string): Inspection {
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: new VirtualConsole() })
  const document = dom.window.document
  const scriptPages = /var PAGES=\[([^\]]*)\]/.exec(html)?.[1]?.split(',').map(part => part.trim().replace(/^'|'$/g, '')) ?? []
  const pageOf = (node: Element): string => (node as HTMLElement).dataset['page'] ?? ''
  const gotoOf = (node: Element): string => (node as HTMLElement).dataset['goto'] ?? ''
  const documentPages = Array.from(document.querySelectorAll('[data-page]')).map(pageOf)
  const active = Array.from(document.querySelectorAll('[data-page].page-active'))
  // Pages are siblings rather than nested, so the sum is the painted text.
  const activeText = active.map(node => (node.textContent ?? '').trim()).join(' ')
  return {
    scriptPages,
    documentPages,
    navPages: Array.from(document.querySelectorAll('#pageNav [data-goto]')).map(gotoOf),
    active: active.map(pageOf),
    activeTextLength: activeText.length,
    activeText,
  }
}
