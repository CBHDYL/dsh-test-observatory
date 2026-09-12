// Coverage for the verdict kernel. The report used to call a journey complete
// because its steps ran, and a run ready because its tests passed; both claims
// were made without anything checking an outcome.
import { describe, expect, it } from 'vitest'
import { confidenceOf, decideJourneyVerdict, decideRunVerdict } from '../src/experience/verdict.ts'
import type { RunVerdictInputs, VerdictFinding, VerdictJourney } from '../src/experience/verdict.ts'

/** A journey that asserted its outcome. */
function journey(overrides: Partial<VerdictJourney> = {}): VerdictJourney {
  return { persona: 'P', stepsPassed: true, assertions: 2, agentDriven: false, keyboard: false, ...overrides }
}

/** A run whose every input is clean. */
function inputs(overrides: Partial<RunVerdictInputs> = {}): RunVerdictInputs {
  return { journeys: [{ verdict: 'PASS', persona: 'P' }], findings: [], failingTests: 0, coverageKnown: true, commit: 'abc123', ...overrides }
}

describe('journey verdict', () => {
  it('passes a journey whose assertions held', () => {
    const result = decideJourneyVerdict(journey(), [])
    expect(result.verdict).toBe('PASS')
    expect(result.reasons.join(' ')).toContain('2 assertion(s) held')
  })

  it('fails a journey whose step did not settle', () => {
    expect(decideJourneyVerdict(journey({ stepsPassed: false }), []).verdict).toBe('FAIL')
  })

  it('is inconclusive when every step settled but nothing was asserted', () => {
    const result = decideJourneyVerdict(journey({ assertions: 0 }), [])
    expect(result.verdict).toBe('INCONCLUSIVE')
    expect(result.reasons.join(' ')).toContain('only shows the page loaded')
  })

  it('is inconclusive when the model decided the actions, however it ended', () => {
    const result = decideJourneyVerdict(journey({ agentDriven: true }), [])
    expect(result.verdict).toBe('INCONCLUSIVE')
    expect(result.reasons.join(' ')).toContain('nothing independently checked')
  })

  it('fails a keyboard journey whose page has a blocking keyboard finding', () => {
    const findings: VerdictFinding[] = [{ severity: 'high', family: 'keyboard', persona: 'P' }]
    const result = decideJourneyVerdict(journey({ keyboard: true }), findings)
    expect(result.verdict).toBe('FAIL')
    expect(result.reasons.join(' ')).toContain('cannot operate the page')
  })

  it('fails a keyboard journey on a finding recorded for another persona', () => {
    // Focus visibility is a property of the application, and every journey
    // reaches the same pages, so the persona that measured it is irrelevant.
    const findings: VerdictFinding[] = [{ severity: 'high', family: 'keyboard', persona: 'Other' }]
    expect(decideJourneyVerdict(journey({ keyboard: true }), findings).verdict).toBe('FAIL')
  })

  it('leaves a journey that does not use the keyboard alone', () => {
    expect(decideJourneyVerdict(journey(), [{ severity: 'high', family: 'keyboard', persona: 'P' }]).verdict).toBe('PASS')
  })

  it('ignores a medium keyboard finding', () => {
    expect(decideJourneyVerdict(journey({ keyboard: true }), [{ severity: 'medium', family: 'keyboard', persona: 'P' }]).verdict).toBe('PASS')
  })
})

describe('run verdict', () => {
  it('is ready only when nothing limits what the run established', () => {
    const result = decideRunVerdict(inputs())
    expect(result.verdict).toBe('READY')
    expect(confidenceOf(inputs())).toBe('high')
  })

  it('is blocked by a failing test', () => {
    expect(decideRunVerdict(inputs({ failingTests: 2 })).verdict).toBe('BLOCKED')
  })

  it('caps at needs review for an open blocking finding', () => {
    const result = decideRunVerdict(inputs({ findings: [{ severity: 'high', family: 'accessibility', persona: 'P' }] }))
    expect(result.verdict).toBe('NEEDS REVIEW')
    expect(result.reasons.join(' ')).toContain('no test covers')
    expect(confidenceOf(inputs({ findings: [{ severity: 'high', family: 'accessibility', persona: 'P' }] }))).toBe('limited')
  })

  it('caps at needs review when a journey established nothing', () => {
    const result = decideRunVerdict(inputs({ journeys: [{ verdict: 'INCONCLUSIVE', persona: 'First-time visitor' }] }))
    expect(result.verdict).toBe('NEEDS REVIEW')
    expect(result.reasons.join(' ')).toContain('First-time visitor')
  })

  it('caps at needs review when coverage is unknown', () => {
    expect(decideRunVerdict(inputs({ coverageKnown: false })).verdict).toBe('NEEDS REVIEW')
  })

  it('caps at needs review when the run has no commit to compare against', () => {
    const result = decideRunVerdict(inputs({ commit: '' }))
    expect(result.verdict).toBe('NEEDS REVIEW')
    expect(result.reasons.join(' ')).toContain('no commit')
  })

  it('names every reason, not only the first', () => {
    const result = decideRunVerdict(inputs({ commit: '', coverageKnown: false, findings: [{ severity: 'high', family: 'visual', persona: 'P' }] }))
    expect(result.reasons.length).toBeGreaterThanOrEqual(4)
  })

  it('lets a failing test outrank every other reason', () => {
    const result = decideRunVerdict(inputs({ failingTests: 1, coverageKnown: false, commit: '' }))
    expect(result.verdict).toBe('BLOCKED')
    expect(result.reasons).toHaveLength(1)
  })
})
