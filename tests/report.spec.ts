// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderReport, escapeHtml } from '../src/report/render.ts'
import type { ReportModel } from '../src/report/types.ts'

/** A complete model with an experience section, used as the happy-path fixture. */
function fullModel(): ReportModel {
  return {
    meta: { project: 'Atlas & Co', branch: 'main', commit: 'abc123', environment: 'staging', runAt: 'now', runId: '#1' },
    verdict: { score: 88, headline: 'Headline <b>', label: 'Release Ready', summary: 'Summary', confidence: '88%', risk: 'Risk' },
    kpis: [{ label: 'Pass rate', value: '90%', delta: 'up' }, { label: 'Failed', value: '1', delta: 'down', worse: true }],
    summary: { total: 10, passed: 9, failed: 1, skipped: 0, flaky: 0, durationSeconds: 12, coveragePercent: null },
    trend: [{ run: '#1', score: 88, durationSeconds: 12 }],
    causes: [{ label: 'Timeout', count: 1 }],
    slowest: [{ rank: 1, name: 'slow case', suite: 'Suite', durationSeconds: 3 }],
    timeline: [{ label: 'lane', startSeconds: 0, durationSeconds: 3 }],
    regressions: [{ name: 'regressed', scope: 'Area', severity: 'HIGH' }],
    recovered: [{ name: 'fixed', evidence: 'passing' }],
    experience: {
      total: 88, band: 'Good', tasksObserved: 3, tasksCompleted: 2, blockers: 1, recoverablePoints: 2,
      dimensions: [{ label: 'Functional', earned: 27, available: 30 }],
    },
    personas: [{ id: 'new', name: 'First-time', device: 'Desktop', tasks: 3, completionPercent: 67, headline: 'Discovery' }],
    journeys: [{ personaId: 'new', name: 'Checkout', steps: [{ label: 'Open', state: 'PASS', seconds: 1 }] }],
    evidence: [{ title: 'Shot', personaId: 'new', kind: 'key', meta: 'Desktop' }],
    findings: [{ id: 'f1', severity: 'HIGH', dimension: 'Feedback', deductedPoints: 2, title: 'No progress', observation: 'Observed', scope: 'Checkout', recoverablePoints: 2, evidenceIds: ['evidence-1'] }],
    tests: [{ name: 'case', path: 'a.ts', status: 'failed', suite: 'Suite', durationSeconds: 1, owner: 'Team', error: 'expected true', attempts: 2, framework: 'playwright', attachments: [{ name: 'trace', kind: 'trace', path: 'trace.zip' }] }],
  }
}

/** Run the rendered document's own scripts and return the resulting DOM. */
function mount(model: ReportModel): void {
  const html = renderReport(model)
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('<script>'))
  document.body.innerHTML = body
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    ;(0, eval)(match[1] as string)
  }
}

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml("<a href=\"x\">&'")).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })

  it('leaves ordinary text unchanged', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123')
  })
})

describe('renderReport', () => {
  it('produces one self-contained document with no external resources', () => {
    const html = renderReport(fullModel())
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html.endsWith('</body></html>')).toBe(true)
    expect(/https?:\/\//.test(html)).toBe(false)
    expect(html).toContain('.drawer{position:fixed')
    expect(html).toContain('.xp-modal{position:fixed')
    expect(html).toContain('.modal-card{width:min(920px,96vw)')
  })

  it('escapes the project name in the title and never terminates its own script', () => {
    const html = renderReport(fullModel())
    expect(html).toContain('<title>Atlas &amp; Co — Test Observatory</title>')
    expect(html).toContain('\\u003c')
  })

  it('binds the model into the header, kpis, personas, evidence and table', () => {
    mount(fullModel())
    expect(document.getElementById('runMeta')?.textContent).toContain('Atlas & Co')
    expect(document.querySelectorAll('#kpis .kpi')).toHaveLength(2)
    expect(document.querySelectorAll('#personas .persona')).toHaveLength(1)
    expect(document.querySelectorAll('#evidenceGrid .evidence')).toHaveLength(1)
    expect(document.querySelectorAll('#tbody tr')).toHaveLength(1)
    expect(document.getElementById('heroScore')?.textContent).toBe('88')
    ;(document.querySelector('#tbody tr') as HTMLElement).click()
    expect(document.getElementById('outCommand')?.textContent).toBe('expected true')
    expect(document.getElementById('outNote')?.textContent).toContain('Attempts: 2')
    expect(document.getElementById('testAttachments')?.textContent).toContain('trace.zip')
  })

  it('omits the experience section when the run produced no simulation data', () => {
    const model = fullModel()
    delete (model as { experience?: unknown }).experience
    const html = renderReport(model)
    const body = html.slice(html.indexOf('<body>'), html.indexOf('<script>'))
    expect(body).not.toContain('class="xp"')
    expect(body).not.toContain('id="personas"')
    expect(body).toContain('Test details')
    expect(body).toContain('Visual evidence')
  })

  it('removes empty evidence and findings cards', () => {
    const model={...fullModel(),evidence:[],findings:[]};const html=renderReport(model);expect(html).not.toContain('id="evidenceGrid"');expect(html).not.toContain('id="findings"')
  })

  it('keeps the experience section when simulation data is present', () => {
    const body = renderReport(fullModel())
    const markup = body.slice(body.indexOf('<body>'), body.indexOf('<script>'))
    expect(markup).toContain('class="xp"')
    expect(markup).toContain('id="personas"')
  })
})