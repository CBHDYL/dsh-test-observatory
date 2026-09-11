// Branch coverage for the settled-run → report-section mapping: the absent
// fields, the blocked/failed steps, and the de-duplication of one page defect
// observed by several personas.
import { describe, expect, it } from 'vitest'
import { personaId, toExperienceSection } from '../src/command/experience.ts'
import type { ExperienceRun, JourneyOutcome, StepOutcome } from '../src/experience/index.ts'

/** One settled step. */
function step(label: string, state: StepOutcome['state'], extra: Partial<StepOutcome> = {}): StepOutcome {
  return { label, state, durationMs: 250, ...extra }
}

/** One settled journey. */
function journey(persona: string, name: string, steps: readonly StepOutcome[]): JourneyOutcome {
  return { persona, device: 'Desktop · Chrome', name, steps, passed: steps.every(item => item.state === 'PASS') }
}

/** A run containing only the given journeys. */
function run(journeys: readonly JourneyOutcome[], checks: ExperienceRun['checks'] = [], shots: ExperienceRun['shots'] = []): ExperienceRun {
  return { journeys, shots, checks }
}

describe('personaId', () => {
  it('keeps unicode letters and digits so non-Latin personas stay distinct', () => {
    expect(personaId('首次访问用户')).toBe('首次访问用户')
    expect(personaId('Power User #2')).toBe('power-user-2')
  })

  it('falls back to a usable id when a name carries no letter or digit', () => {
    expect(personaId('---')).toBe('persona')
  })
})

describe('toExperienceSection', () => {
  it('maps an empty run without inventing any persona', () => {
    const section = toExperienceSection(run([]))
    expect(section.personas).toEqual([])
    expect(section.journeys).toEqual([])
    expect(section.findings).toEqual([])
    expect(section.checks).toEqual([])
    expect(section.experience.tasksObserved).toBe(0)
  })

  it('reports a zero completion percent for a journey with no steps', () => {
    const section = toExperienceSection(run([journey('Brave', 'Empty task', [])]))
    expect(section.personas[0]?.completionPercent).toBe(0)
    expect(section.personas[0]?.headline).toBe('Completed')
  })

  it('marks a journey as blocked when a step did not settle', () => {
    const section = toExperienceSection(run([journey('Brave', 'Task', [step('open', 'PASS'), step('pay', 'FAIL', { error: 'timeout' }), step('after', 'BLOCKED')])]))
    expect(section.personas[0]?.headline).toBe('Blocked')
    expect(section.journeys[0]?.steps.map(item => item.seconds)).toEqual([0.25, 0.25, null])
  })

  it('carries step evidence ids through and omits them when the step has none', () => {
    const section = toExperienceSection(run([journey('Brave', 'Task', [step('with', 'PASS', { evidenceIds: ['evidence-1'] }), step('without', 'PASS')])]))
    expect(section.journeys[0]?.steps[0]?.evidenceIds).toEqual(['evidence-1'])
    expect(section.journeys[0]?.steps[1]?.evidenceIds).toBeUndefined()
  })

  it('describes a failed step without an error message', () => {
    const section = toExperienceSection(run([journey('Brave', 'Task', [step('pay', 'FAIL')])]))
    expect(section.findings[0]?.observation).toBe('step did not settle')
    expect(section.findings[0]?.title).toBe('pay failed for Brave')
    expect(section.findings[0]?.evidenceIds).toEqual([])
  })

  it('numbers findings with a per-journey offset so two journeys never collide', () => {
    const section = toExperienceSection(run([
      journey('A', 'First', [step('fails', 'FAIL', { error: 'a' })]),
      journey('B', 'Second', [step('fails', 'FAIL', { error: 'b' }), step('also fails', 'FAIL', { error: 'c' })]),
    ]))
    expect(section.findings.map(finding => finding.id)).toEqual(['finding-1', 'finding-101', 'finding-102'])
  })

  it('deduplicates one page defect observed by several personas', () => {
    const duplicated = { rule: 'image-broken', detail: '1 image(s) failed to load', severity: 'high' as const }
    const section = toExperienceSection(run(
      [journey('A', 'Task', [step('open', 'PASS')]), journey('B', 'Task', [step('open', 'PASS')])],
      [
        { persona: 'A', visual: [duplicated], accessibility: [] },
        { persona: 'B', visual: [duplicated], accessibility: [] },
      ],
    ))
    expect(section.checks).toHaveLength(1)
    expect(section.checks[0]).toMatchObject({ family: 'visual', persona: 'A' })
  })

  it('keeps a distinct accessibility finding alongside the visual family', () => {
    const section = toExperienceSection(run(
      [journey('A', 'Task', [step('open', 'PASS')])],
      [{ persona: 'A', visual: [{ rule: 'x', detail: 'same', severity: 'medium' }], accessibility: [{ rule: 'x', detail: 'same', severity: 'high' }] }],
    ))
    expect(section.checks.map(finding => finding.family)).toEqual(['visual', 'accessibility'])
  })

  it('maps captured shots into the evidence gallery', () => {
    const section = toExperienceSection(run(
      [journey('首次访问用户', 'Task', [step('open', 'PASS')])],
      [],
      [{ id: 'evidence-1', caption: '首页', category: 'key', persona: '首次访问用户', journey: 'Task', stepLabel: 'open', meta: 'Desktop', dataUri: 'data:image/png;base64,AA' }],
    ))
    expect(section.evidence[0]).toMatchObject({ id: 'evidence-1', title: '首页', personaId: '首次访问用户', kind: 'key' })
  })
})