// Boundary input planning: that a probing persona's declared value still runs
// first, that each boundary variant reaches the field on its own, and that the
// personas which do not probe are genuinely unaffected.
import { describe, expect, it } from 'vitest'
import { BOUNDARY_VALUES, DEFAULT_BEHAVIOR, VERY_LONG_LENGTH, duplicatesSubmit, pacingOf, planInputs, presetById, resolveBehavior } from '../src/experience/behavior/index.ts'
import type { PersonaBehavior } from '../src/experience/behavior/index.ts'

describe('planInputs', () => {
  it('runs only the declared value for a persona that does not probe', () => {
    const planned = planInputs('buyer@example.com', DEFAULT_BEHAVIOR)
    expect(planned).toEqual([{ kind: 'declared', value: 'buyer@example.com', replacesDeclared: false }])
  })

  it('runs the declared value before any boundary variant', () => {
    const planned = planInputs('buyer@example.com', presetById('error-prone') as PersonaBehavior)
    expect(planned[0]).toEqual({ kind: 'declared', value: 'buyer@example.com', replacesDeclared: false })
    expect(planned.length).toBeGreaterThan(1)
  })

  it('expands every boundary variant the policy declares, in order', () => {
    const behavior = presetById('error-prone') as PersonaBehavior
    const planned = planInputs('x', behavior)
    expect(planned.slice(1).map(entry => entry.kind)).toEqual(behavior.input.boundaryInputs.map(variant => variant.kind))
  })

  it('carries the real value for each variant', () => {
    const planned = planInputs('x', presetById('error-prone') as PersonaBehavior)
    const byKind = new Map(planned.map(entry => [entry.kind, entry.value]))
    expect(byKind.get('declared')).toBe('x')
    expect(byKind.get('empty')).toBe(BOUNDARY_VALUES.empty)
    expect(byKind.get('veryLong')).toHaveLength(VERY_LONG_LENGTH)
    expect(byKind.get('emoji')).toBe(BOUNDARY_VALUES.emoji)
    expect(byKind.get('rtl')).toBe(BOUNDARY_VALUES.rtl)
    expect(byKind.get('html')).toBe(BOUNDARY_VALUES.html)
  })

  it('marks boundary variants as replacing the declared value', () => {
    const planned = planInputs('x', presetById('error-prone') as PersonaBehavior)
    for (const entry of planned.slice(1)) expect(entry.replacesDeclared).toBe(true)
  })

  it('produces the declared value only once, even when a variant repeats it', () => {
    const behavior = resolveBehavior({ preset: 'neutral', input: { boundaryInputs: [{ kind: 'whitespace' }] } })
    const planned = planInputs('typed', behavior)
    expect(planned.map(entry => entry.value)).toEqual(['typed', BOUNDARY_VALUES.whitespace])
  })
})

describe('duplicatesSubmit', () => {
  it('is true only for the impatient persona', () => {
    expect(duplicatesSubmit(presetById('impatient') as PersonaBehavior)).toBe(true)
    for (const id of ['neutral', 'first-time', 'expert', 'keyboard', 'mobile', 'error-prone']) {
      expect(duplicatesSubmit(presetById(id) as PersonaBehavior)).toBe(false)
    }
  })

  it('follows an explicit override', () => {
    expect(duplicatesSubmit(resolveBehavior({ preset: 'neutral', input: { doubleSubmit: true } }))).toBe(true)
    expect(duplicatesSubmit(resolveBehavior({ preset: 'impatient', input: { doubleSubmit: false } }))).toBe(false)
  })
})

describe('pacingOf', () => {
  it('is zero for a persona that declares no pacing', () => {
    expect(pacingOf(DEFAULT_BEHAVIOR)).toEqual({ hesitateMs: 0, paceMs: 0 })
  })

  it('reports the hesitation and pace a persona declares', () => {
    expect(pacingOf(presetById('first-time') as PersonaBehavior).hesitateMs).toBeGreaterThan(0)
    expect(pacingOf(presetById('mobile') as PersonaBehavior).paceMs).toBeGreaterThan(0)
  })
})