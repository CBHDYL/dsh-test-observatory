// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { checkVisual } from '../src/experience/visual.ts'
import { checkAccessibility } from '../src/experience/a11y.ts'
import { scoreRun } from '../src/experience/scoring.ts'
import type { ExperienceRun, JourneyOutcome } from '../src/experience/types.ts'

/** A page double that runs the serialized inspection against the real jsdom DOM. */
function inspectingPage() {
  return {
    evaluate: async (expression: string) => (0, eval)(expression) as unknown,
  }
}

/** A page double whose evaluation resolves to the supplied value. */
function pageResolving(value: unknown) {
  return { evaluate: async () => value, addScriptTag: async () => {} }
}

/** Build a passing journey for score fixtures. */
function journey(persona: string): JourneyOutcome {
  return {
    persona, device: 'Desktop', name: 'task', passed: true,
    steps: [{ label: 's', state: 'PASS', durationMs: 10 }],
  }
}

/** Build a run with optional checks. */
function run(checks: ExperienceRun['checks']): ExperienceRun {
  return { journeys: [journey('a')], shots: [], checks }
}

describe('checkVisual', () => {
  it('returns the violations the page reports', async () => {
    document.body.innerHTML = '<input placeholder="Email">'
    const violations = await checkVisual(inspectingPage() as never)
    expect(violations.map(violation => violation.rule)).toContain('placeholder-only-field')
  })

  it('returns an empty list for a clean page', async () => {
    document.body.innerHTML = '<p>Clean</p>'
    await expect(checkVisual(inspectingPage() as never)).resolves.toEqual([])
  })
})

describe('checkAccessibility', () => {
  it('maps axe violations onto the report vocabulary', async () => {
    const results = await checkAccessibility(pageResolving([
      { id: 'color-contrast', impact: 'serious', help: 'Elements must meet contrast', nodes: 3 },
      { id: 'region', impact: 'moderate', help: 'All content should be in landmarks', nodes: 1 },
    ]) as never)
    expect(results).toEqual([
      { rule: 'axe:color-contrast', detail: 'Elements must meet contrast (3 node(s))', severity: 'high' },
      { rule: 'axe:region', detail: 'All content should be in landmarks (1 node(s))', severity: 'medium' },
    ])
  })

  it('treats an unknown impact as non-blocking', async () => {
    const results = await checkAccessibility(pageResolving([
      { id: 'best-practice', impact: null, help: 'Consider this', nodes: 2 },
    ]) as never)
    expect(results[0]?.severity).toBe('medium')
  })
})

describe('scoreRun with recorded checks', () => {
  it('gives full visual and accessibility weight when no violation was found', () => {
    const score = scoreRun(run([{ persona: 'a', visual: [], accessibility: [] }]))
    expect(score.total).toBe(100)
    expect(score.visualFindings).toBe(0)
    expect(score.accessibilityFindings).toBe(0)
  })

  it('docks visual quality per violation severity', () => {
    const score = scoreRun(run([{
      persona: 'a',
      visual: [
        { rule: 'image-broken', detail: 'x', severity: 'high' },
        { rule: 'image-no-alt', detail: 'y', severity: 'medium' },
      ],
      accessibility: [],
    }]))
    expect(score.dimensions.find(d => d.label === 'Visual quality')?.earned).toBe(8)
    expect(score.visualFindings).toBe(2)
  })

  it('docks accessibility per violation severity and never goes below zero', () => {
    const heavy = scoreRun(run([{
      persona: 'a',
      visual: [],
      accessibility: Array.from({ length: 6 }, (_, index) => ({ rule: 'axe:' + String(index), detail: 'x', severity: 'high' as const })),
    }]))
    expect(heavy.dimensions.find(d => d.label === 'Accessibility')?.earned).toBe(0)
    expect(heavy.accessibilityFindings).toBe(6)
  })
})
