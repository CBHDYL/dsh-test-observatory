// Persona behaviour policies: that each preset states a real difference, that
// resolution is explicit, and that the differences the report advertises are
// the ones the policy actually carries.
import { describe, expect, it } from 'vitest'
import { BEHAVIOR_PRESETS, BEHAVIOR_PRESET_IDS, BOUNDARY_VALUES, DEFAULT_BEHAVIOR, VERY_LONG_LENGTH, behaviorDimensions, presetById, resolveBehavior } from '../src/experience/behavior/index.ts'
import type { PersonaBehavior } from '../src/experience/behavior/index.ts'

describe('behavior presets', () => {
  it('ships the seven declared presets', () => {
    expect([...BEHAVIOR_PRESET_IDS].sort()).toEqual(['error-prone', 'expert', 'first-time', 'impatient', 'keyboard', 'mobile', 'neutral'])
  })

  it('gives every preset a distinct id matching its key', () => {
    for (const [key, preset] of Object.entries(BEHAVIOR_PRESETS)) expect(preset.id).toBe(key)
  })

  it('gives every preset a summary and a complete policy', () => {
    for (const preset of Object.values(BEHAVIOR_PRESETS)) {
      expect(preset.summary.length).toBeGreaterThan(0)
      expect(typeof preset.modality.pointer).toBe('boolean')
      expect(preset.modality.tabBudget).toBeGreaterThan(0)
      expect(preset.timing.settleBudgetMs).toBeGreaterThan(0)
    }
  })

  it('states a real difference: every preset but neutral changes something', () => {
    for (const id of BEHAVIOR_PRESET_IDS) {
      if (id === 'neutral') continue
      expect(behaviorDimensions(presetById(id) as PersonaBehavior).length).toBeGreaterThan(0)
    }
    expect(behaviorDimensions(DEFAULT_BEHAVIOR)).toEqual([])
  })

  it('makes the keyboard persona the only one that cannot use a pointer', () => {
    const withoutPointer = BEHAVIOR_PRESET_IDS.filter(id => !(presetById(id) as PersonaBehavior).modality.pointer)
    expect(withoutPointer).toEqual(['keyboard'])
  })

  it('makes the impatient persona the only one that submits twice', () => {
    const doubleSubmitters = BEHAVIOR_PRESET_IDS.filter(id => (presetById(id) as PersonaBehavior).input.doubleSubmit)
    expect(doubleSubmitters).toEqual(['impatient'])
  })

  it('gives the impatient and expert personas the shortest patience', () => {
    expect(presetById('impatient')?.timing.settleBudgetMs).toBeLessThan(presetById('neutral')?.timing.settleBudgetMs as number)
    expect(presetById('expert')?.timing.waitForIdle).toBe(false)
    expect(presetById('impatient')?.timing.waitForIdle).toBe(false)
  })

  it('gives the mobile persona a throttled environment', () => {
    expect(presetById('mobile')?.environment.network).toBe('slow3g')
    expect(presetById('mobile')?.environment.cpuThrottle).toBeGreaterThan(1)
  })

  it('gives the error-prone persona boundary inputs and a reload path', () => {
    const preset = presetById('error-prone') as PersonaBehavior
    expect(preset.input.boundaryInputs.length).toBeGreaterThanOrEqual(5)
    expect(preset.recovery.retries).toBeGreaterThan(0)
    expect(preset.recovery.alternativePaths).toContain('reload')
  })
})

describe('boundary values', () => {
  it('generates a long value of the declared length', () => {
    expect(BOUNDARY_VALUES.veryLong).toHaveLength(VERY_LONG_LENGTH)
  })

  it('includes an empty and a whitespace-only variant', () => {
    expect(BOUNDARY_VALUES.empty).toBe('')
    expect(BOUNDARY_VALUES.whitespace.trim()).toBe('')
  })

  it('includes non-Latin script and astral-plane characters', () => {
    expect(BOUNDARY_VALUES.rtl).toMatch(/[\u0600-\u06FF]/)
    expect(BOUNDARY_VALUES.emoji.length).toBeGreaterThan(0)
    expect([...BOUNDARY_VALUES.emoji].some(character => (character.codePointAt(0) ?? 0) > 0xffff)).toBe(true)
  })

  it('keeps the markup and quote probes inert as data', () => {
    // They are values handed to a field, never executed by the runner.
    expect(BOUNDARY_VALUES.html).toContain('<')
    expect(BOUNDARY_VALUES.sqlLike).toContain("'")
  })
})

describe('resolveBehavior', () => {
  it('uses the neutral policy when nothing is declared', () => {
    expect(resolveBehavior(undefined)).toBe(DEFAULT_BEHAVIOR)
  })

  it('resolves a preset by id', () => {
    expect(resolveBehavior('impatient').id).toBe('impatient')
  })

  it('rejects an unknown preset id rather than falling back silently', () => {
    expect(() => resolveBehavior('flaky-user')).toThrow(/unknown persona behaviour "flaky-user"/)
    expect(() => resolveBehavior('flaky-user')).toThrow(/known presets: neutral/)
  })

  it('merges an override over its preset and keeps the untouched dimensions', () => {
    const resolved = resolveBehavior({ preset: 'mobile', environment: { network: 'fast3g' } })
    expect(resolved.environment.network).toBe('fast3g')
    // The CPU throttle the preset declared survives a partial override.
    expect(resolved.environment.cpuThrottle).toBe(4)
    expect(resolved.modality.pointer).toBe(true)
  })

  it('marks an overridden policy so the report can say so', () => {
    expect(resolveBehavior({ preset: 'expert' }).summary).not.toContain('overridden')
    expect(resolveBehavior({ preset: 'expert', timing: { settleBudgetMs: 5000 } }).summary).toContain('overridden')
  })

  it('rejects an override naming an unknown preset', () => {
    expect(() => resolveBehavior({ preset: 'nope' })).toThrow(/unknown persona behaviour "nope"/)
  })

  it('reports the dimensions an override changes', () => {
    const resolved = resolveBehavior({ preset: 'neutral', modality: { pointer: false } })
    expect(behaviorDimensions(resolved)).toEqual(['keyboard-only'])
  })
})
