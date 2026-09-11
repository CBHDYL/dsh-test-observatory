// @vitest-environment jsdom
// The individual branches the module suites do not reach: colour absence and the
// transparent keyword, a focus call the page refuses, an unreadable dialog, the
// accessibility dimension's scoring, and the selector chain's root case.
import { describe, expect, it } from 'vitest'
import { DEFAULT_BEHAVIOR } from '../src/experience/behavior/index.ts'
import { drawsFocusIndicator } from '../src/experience/in-page.ts'
import { checkKeyboard, probeOpenDialog } from '../src/experience/keyboard-checks.ts'
import { scoreRun } from '../src/experience/scoring.ts'
import type { ExperienceRun, JourneyOutcome } from '../src/experience/types.ts'
import { collectViolations } from '../src/experience/visual.ts'
import type { Page } from 'playwright-core'

/** Computed style over the fields a focus judgement reads. */
function styleOf(values: Partial<Record<'outline' | 'outlineStyle' | 'outlineWidth' | 'outlineColor' | 'boxShadow', string>>): CSSStyleDeclaration {
  return { outline: '', outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', boxShadow: 'none', ...values } as unknown as CSSStyleDeclaration
}

describe('drawsFocusIndicator colour forms', () => {
  it('accepts an absent colour as drawing nothing to judge', () => {
    // An empty value states no indicator, so it must not be read as transparent
    // and must not be read as drawn either.
    expect(drawsFocusIndicator(styleOf({ outline: '', outlineStyle: 'solid', outlineWidth: '2px', outlineColor: '' }))).toBe(false)
  })

  it('treats an explicit none as nothing to judge', () => {
    expect(drawsFocusIndicator(styleOf({ boxShadow: 'none', outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'none' }))).toBe(false)
  })

  it('accepts the transparent keyword as nothing drawn', () => {
    // A browser reports the colour consistently in the shorthand and the longhand.
    expect(drawsFocusIndicator(styleOf({ outline: 'transparent solid 2px', outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'transparent' }))).toBe(false)
  })

  it('finds the transparent keyword inside a longer shadow value', () => {
    expect(drawsFocusIndicator(styleOf({ boxShadow: '0 0 0 3px transparent' }))).toBe(false)
  })

  it('finds a transparent rgba colour inside a longer shadow value', () => {
    expect(drawsFocusIndicator(styleOf({ boxShadow: 'rgba(1, 2, 3, 0) 0px 0px 0px 3px' }))).toBe(false)
  })

  it('accepts a named colour in a shadow as drawn', () => {
    expect(drawsFocusIndicator(styleOf({ boxShadow: '0 0 0 3px rebeccapurple' }))).toBe(true)
  })
})

/** A page double that runs in-page inspections against jsdom. */
function fakePage(): Record<string, unknown> {
  return {
    keyboard: { press: async () => {} },
    evaluate: async (expression: unknown, arg?: unknown): Promise<unknown> => (expression as (value?: unknown) => unknown)(arg),
  }
}

describe('keyboard check tolerances', () => {
  it('ignores an element the page refuses to focus', async () => {
    // A disabled control matches the selector but cannot receive focus; it is not
    // a keyboard barrier, it is a control deliberately out of reach.
    document.body.innerHTML = '<button id="disabled" disabled style="outline:none;width:40px;height:20px">x</button>'
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-focus-not-visible')
  })

  it('skips the dialog probe when the dialog reports itself hidden', async () => {
    document.body.innerHTML = '<div role="dialog" aria-label="Hidden"></div>'
    const page = {
      ...fakePage(),
      locator: () => ({ count: async () => 1, first: () => ({ isVisible: async () => { throw new Error('closed mid-probe') } }) }),
    }
    // A dialog that cannot be read is not probed, rather than reported as broken.
    await expect(probeOpenDialog(page as unknown as Page)).resolves.toEqual([])
  })

  it('does not claim Escape was ignored when the dialog cannot be read afterwards', async () => {
    document.body.innerHTML = '<div role="dialog" aria-label="Vanishing"></div>'
    let calls = 0
    const page = {
      ...fakePage(),
      locator: () => ({
        count: async () => 1,
        first: () => ({
          isVisible: async () => { calls += 1; return calls === 1 },
          evaluate: async (fn: (node: Element) => unknown) => fn(document.querySelector('[role="dialog"]') as Element),
        }),
      }),
    }
    const findings = await probeOpenDialog(page as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-escape-ignored')
  })
})

describe('accessibility scoring', () => {
  /** One journey that passed every step. */
  const journey: JourneyOutcome = { persona: 'P', device: 'D', name: 'J', steps: [{ label: 's', state: 'PASS', durationMs: 10 }], passed: true, behavior: DEFAULT_BEHAVIOR, behaviorDimensions: [] }

  /** A run whose only accessibility finding has the given severity. */
  function runWith(severity: 'high' | 'medium'): ExperienceRun {
    return { journeys: [journey], shots: [], checks: [{ persona: 'P', visual: [], accessibility: [{ rule: 'axe:x', detail: 'd', severity, evidence: [] }], keyboard: [] }] }
  }

  it('deducts more for a blocking accessibility finding than a non-blocking one', () => {
    const blocking = scoreRun(runWith('high'))
    const minor = scoreRun(runWith('medium'))
    expect(blocking.accessibilityFindings).toBe(1)
    expect(blocking.dimensions.find(d => d.label === 'Accessibility')?.earned).toBe(7)
    expect(minor.dimensions.find(d => d.label === 'Accessibility')?.earned).toBe(9)
  })
})

describe('selector chain root case', () => {
  it('stops at an element whose parent chain ends', () => {
    document.body.innerHTML = '<div id="wide" style="width:5000px;height:10px"></div>'
    const detached = document.getElementById('wide') as HTMLElement
    // Detaching removes the element from the document's chain, so the selector
    // walk ends at the element itself.
    detached.remove()
    document.documentElement.append(detached)
    const violations = collectViolations(document)
    // The element is now a direct child of the root, which the walk must handle
    // rather than looping or throwing.
    expect(Array.isArray(violations)).toBe(true)
  })
})