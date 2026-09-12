// @vitest-environment jsdom
// The report is one HTML document whose client script paints every page. A
// renderer that calls a helper it cannot reach throws during paint, and the
// document silently keeps the design prototype's mock markup: every unit test
// still passes while every page shows the wrong data. These cases run the
// shipped script the way a browser does and assert the pages carry the run.
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { renderReport } from '../src/report/render.ts'
import type { ReportModel } from '../src/report/types.ts'

/** A report carrying one persona, one journey, one capture and one finding. */
function model(): ReportModel {
  return {
    meta: { project: 'Atlas', branch: 'main', commit: 'abc', environment: 'local', runAt: 'now', runId: '242424' },
    verdict: { score: 90, headline: 'Headline', label: 'Release ready', summary: 'Summary', confidence: '90%', risk: 'Risk', narrative: 'The model read the run.' },
    kpis: [
      { label: 'Pass rate', value: '100%', delta: '40 of 40' },
      { label: 'Scan findings', value: '1', delta: 'not tests' },
    ],
    summary: { total: 40, passed: 40, failed: 0, findings: 1, skipped: 0, flaky: 0, durationSeconds: 9, coveragePercent: null },
    trend: [{ run: '242424', score: 90, durationSeconds: 9 }],
    causes: [{ label: 'Open scan finding', count: 1 }],
    slowest: [{ rank: 1, name: 'renders', suite: 'Unit', durationSeconds: 0.5 }],
    timeline: [{ label: 'renders', startSeconds: 0, durationSeconds: 9 }],
    regressions: [], recovered: [],
    tests: [{ kind: 'test', name: 'renders', path: 'a.test.ts', status: 'passed', suite: 'Unit', durationSeconds: 0.5, owner: 'Team' }],
    experience: {
      total: 90, band: 'Excellent', tasksObserved: 1, tasksCompleted: 1, blockers: 0, recoverablePoints: 0,
      dimensions: [{ label: 'Accessibility', earned: 8, available: 10 }],
      visualFindings: 0, accessibilityFindings: 1,
    },
    personas: [{ id: 'new', name: '首次访问用户', device: 'Desktop · Chrome', tasks: 1, completionPercent: 100, headline: 'Discovery' }],
    journeys: [{ personaId: 'new', name: 'Open the storefront', steps: [{ label: 'Open', state: 'PASS', seconds: 1 }] }],
    evidence: [{ id: 'e1', title: 'Storefront', personaId: 'new', journey: 'Open the storefront', stepLabel: 'Open', kind: 'key', meta: 'Desktop · 1440x900' }],
    findings: [],
    checks: [{
      rule: 'axe:color-contrast',
      detail: 'Elements must meet minimum color contrast ratio thresholds (11 node(s))',
      severity: 'high', family: 'accessibility', persona: '首次访问用户',
      requirement: 'Text must be readable against its background.',
      fix: 'Darken the text, then re-run.',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
      evidence: [{ tag: 'span', selector: '.tag', text: 'new', box: { x: 0, y: 0, width: 10, height: 10, space: 'viewport' } }],
    }],
  }
}

/** Render the report and run its script the way a browser does. */
function paint(source: ReportModel): { dom: JSDOM; errors: string[] } {
  const errors: string[] = []
  const dom = new JSDOM(renderReport(source), {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  })
  dom.window.addEventListener('error', (event: Event) => errors.push(String((event as ErrorEvent).message)))
  return { dom, errors }
}

describe('the shipped report script', () => {
  it('paints the run instead of leaving the prototype markup in place', () => {
    const { dom, errors } = paint(model())
    expect(errors).toEqual([])
    const document = dom.window.document
    expect(Array.from(document.querySelectorAll('#personas .persona h3')).map(node => node.textContent)).toEqual(['首次访问用户'])
    expect(document.querySelector('#heroHeadline')?.textContent ?? '').toContain('Headline')
  })

  it('states the requirement, the fix and the observed selector for a finding', () => {
    const document = paint(model()).dom.window.document
    const row = document.querySelector('#checks .finding-card')
    expect(row?.textContent ?? '').toContain('Text must be readable against its background.')
    expect(row?.textContent ?? '').toContain('Darken the text')
    expect(row?.textContent ?? '').toContain('.tag')
  })

  it('offers the run suites in the filter, not the design prototype suites', () => {
    const source = model()
    const document = paint(source).dom.window.document
    const options = Array.from(document.querySelectorAll('#suite option')).map(option => option.textContent ?? '')
    expect(options).toEqual(['All suites', 'Unit'])
    expect(options.join(' ')).not.toContain('Checkout')
  })

  it('counts executed tests and scan findings separately in the subtitle', () => {
    const source = model()
    const finding = { kind: 'finding' as const, name: 'PLR0402 · a.py:7', path: 'a.py', status: 'failed' as const, suite: 'Static analysis', durationSeconds: 0, owner: 'Team' }
    const document = paint({ ...source, tests: [...source.tests, finding] }).dom.window.document
    expect(document.querySelector('#testsSubtitle')?.textContent ?? '').toContain('Explore 1 test and 1 static-analysis result across 2 suites')
  })

  it('marks a finding row so it cannot be read as a failing test, and filters by it', () => {
    const source = model()
    const finding = { kind: 'finding' as const, name: 'PLR0402 · a.py:7', path: 'a.py', status: 'failed' as const, suite: 'Static analysis', durationSeconds: 0, owner: 'Team' }
    const document = paint({ ...source, tests: [...source.tests, finding] }).dom.window.document
    const rows = Array.from(document.querySelectorAll('#tbody tr'))
    expect(rows).toHaveLength(2)
    expect(rows[1]?.textContent ?? '').toContain('finding')
  })

  it('renders a sub-second duration in milliseconds rather than as zero', () => {
    const document = paint(model()).dom.window.document
    const cells = Array.from(document.querySelectorAll('#tbody tr td'))
    expect(cells.map(cell => cell.textContent ?? '').join(' ')).toContain('500ms')
    expect(cells.map(cell => cell.textContent ?? '').join(' ')).not.toContain('0.0s')
  })

  it('shows the same duration and kind in the row drawer', () => {
    const source = model()
    const finding = { kind: 'finding' as const, name: 'PLR0402 · a.py:7', path: 'a.py', status: 'failed' as const, suite: 'Static analysis', durationSeconds: 0, owner: 'Team' }
    const dom = paint({ ...source, tests: [...source.tests, finding] }).dom
    const document = dom.window.document
    const rows = Array.from(document.querySelectorAll('#tbody tr'))
    rows[1]?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('#drawerMeta')?.textContent ?? '').toContain('scan finding, not a test')
    rows[0]?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('#dDuration')?.textContent).toBe('500ms')
  })

  it('escapes a requirement that names an element', () => {
    const withMarkup = model()
    const document = paint({ ...withMarkup, checks: [{ ...withMarkup.checks[0]!, fix: 'Mark the title as <h1>.' }] }).dom.window.document
    expect(document.querySelector('#checks .finding-card')?.textContent ?? '').toContain('<h1>')
  })
})
