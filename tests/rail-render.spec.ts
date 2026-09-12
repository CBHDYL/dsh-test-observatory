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
