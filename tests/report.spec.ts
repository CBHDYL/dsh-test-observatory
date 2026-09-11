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

  it('escapes attachment name, kind, and path against injection', () => {
    const model={...fullModel(),tests:[{name:'<img src=x onerror=alert(1)>',path:'a.ts',status:'failed' as const,suite:'Unit',durationSeconds:1,owner:'Team',attachments:[{name:'"><script>alert(2)</script>',kind:'trace' as const,path:'evil.zip"><script>alert(3)</script>'}]}]}
    const html=renderReport(model)
    expect(html).not.toContain('<script>alert(2)</script>')
    expect(html).not.toContain('<script>alert(3)</script>')
    expect(html).toContain('function esc(v)')
  })

  it('offers both the marked and the clean capture, and discloses an unverified one', () => {
    const model={...fullModel(),evidence:[{
      id:'e1',title:'checkout',personaId:'p',journey:'J',stepLabel:'pay',kind:'key' as const,meta:'Desktop',
      imageDataUri:'data:image/png;base64,CLEAN',
      annotatedImageDataUri:'data:image/png;base64,MARKED',
      integrityDefects:[{rule:'evidence-overlay-left-behind',detail:'an annotation overlay was still attached'}],
    }]}
    const html=renderReport(model)
    // Both images reach the report, so a reader can always compare the mark
    // against the page as it actually rendered.
    expect(html).toContain('CLEAN')
    expect(html).toContain('MARKED')
    expect(html).toContain('evidence-overlay-left-behind')
    // The toggle and the disclosure are part of the shipped client script.
    expect(html).toContain('Findings marked')
    expect(html).toContain('could not be verified')
  })

  it('ships a client-routed page per section with a fixed limits page', () => {
    const html=renderReport(fullModel())
    // Every section declares the page it belongs to.
    for(const page of ['summary','tests','experience','evidence','checks','limits']) {
      expect(html).toContain('data-page="'+page+'"')
    }
    expect(html).toContain('id="pageNav"')
    // The limits prose is fixed, so a reader can always find it.
    expect(html).toContain('Rule-driven, not a user study')
    expect(html).toContain('A green run is only as wide as what ran')
    expect(html).toContain('Flakiness is not decided here')
    // Printing expands every page rather than the active one.
    expect(html).toContain('@media print{[data-page]{display:block!important}.pages{display:none}}')
  })

  it('states what the snapshot baselines did, and hides the note when there are none', () => {
    const withSnapshots = renderReport({...fullModel(), summary: { ...fullModel().summary, snapshots: 'Snapshots: 1 compared, 2 did not match.' }})
    expect(withSnapshots).toContain('id="snapshotNote"')
    // The note renders through the client script, which reads the model field.
    expect(withSnapshots).toContain("getElementById('snapshotNote')")
    expect(withSnapshots).toContain('"snapshots":"Snapshots: 1 compared, 2 did not match."')
    const without = renderReport(fullModel())
    // The element stays so the script can hide it; a project with no snapshot
    // tests never sees text in it.
    expect(without).toContain('id="snapshotNote"')
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