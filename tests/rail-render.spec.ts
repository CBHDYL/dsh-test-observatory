// The rail must show what an agent-driven journey actually did. A goal-driven
// run whose reasoning never reaches the reader is indistinguishable from a
// scripted one, which is the whole thing the goal mode exists to avoid.
import { describe, expect, it } from 'vitest'
import { REPORT_SCRIPT } from '../src/report/assets.generated.ts'

/** The journey renderer's own source. */
function renderer(): string {
  const start = REPORT_SCRIPT.indexOf('function renderJourney(')
  const next = REPORT_SCRIPT.indexOf('function ', start + 10)
  return REPORT_SCRIPT.slice(start, next < 0 ? undefined : next)
}

describe('the answer block', () => {
  it('renders every open finding, worst first, with its picture and its fix', () => {
    const start = REPORT_SCRIPT.indexOf('function applyActions(')
    const source = REPORT_SCRIPT.slice(start, REPORT_SCRIPT.indexOf('function applyCharts('))
    expect(source.length).toBeGreaterThan(200)
    expect(source).toContain("a.severity==='high'?0:1")
    expect(source).toContain('c.cropDataUri')
    expect(source).toContain('c.requirement')
    expect(source).toContain('c.fix')
    expect(source).toContain('esc(c.detail)')
    expect(source).toContain('esc(c.evidence[0].selector)')
  })

  it('says so plainly when nothing is open', () => {
    const start = REPORT_SCRIPT.indexOf('function applyActions(')
    expect(REPORT_SCRIPT.slice(start, REPORT_SCRIPT.indexOf('function applyCharts('))).toContain('recorded no open finding')
  })

  it('runs before the rest of the summary is painted', () => {
    expect(REPORT_SCRIPT.indexOf('applyActions(MODEL);')).toBeGreaterThan(0)
    expect(REPORT_SCRIPT.indexOf('applyActions(MODEL);')).toBeLessThan(REPORT_SCRIPT.indexOf('applyModel(MODEL);'))
  })
})

describe('journey rail rendering', () => {
  it('carries the agent reasoning and result from the report model', () => {
    const source = REPORT_SCRIPT.slice(REPORT_SCRIPT.indexOf('const journeys='), REPORT_SCRIPT.indexOf('function renderJourney('))
    expect(source).toContain('reasoning:x.reasoning')
    expect(source).toContain('result:x.result')
    expect(source).toContain('agent:!!j.stopReason')
    expect(source).toContain('obstacles:j.obstacles')
  })

  it('shows the reasoning on the step and escapes it', () => {
    const source = renderer()
    expect(source).toContain('step-why')
    expect(source).toContain('esc(step.reasoning)')
    expect(source).not.toContain("+step.reasoning+")
  })

  it('states that the model chose the actions and why the run stopped', () => {
    const source = renderer()
    expect(source).toContain('Agent-driven: the model chose each action')
    expect(source).toContain('journeyAgent')
    expect(source).toContain('j.obstacles')
  })

  it('escapes the step label it inserts', () => {
    expect(renderer()).toContain('esc(step.label)')
  })
})
