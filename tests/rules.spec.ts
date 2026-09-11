// Coverage for the rule guidance catalogue: every finding the package emits
// must reach a reader with a stated requirement and a change that satisfies it,
// and axe rules the catalogue does not own must carry axe's own description.
import { describe, expect, it } from 'vitest'
import { axeGuidance, guidanceFor } from '../src/experience/rules.ts'

/** Every rule id the package's own checks emit. */
const PACKAGE_RULES = [
  'image-broken',
  'image-no-alt',
  'horizontal-overflow',
  'element-outside-viewport',
  'placeholder-only-field',
  'page-checks-skipped',
  'keyboard-focus-not-visible',
  'keyboard-dialog-present',
  'keyboard-focus-trap-missing',
  'keyboard-escape-ignored',
  'evidence-too-small',
  'evidence-overlay-left-behind',
  'evidence-annotation-missing',
  'evidence-annotation-not-visible',
  'evidence-size-mismatch',
]

describe('rule guidance catalogue', () => {
  it('explains every rule the package emits', () => {
    for (const rule of PACKAGE_RULES) {
      const guidance = guidanceFor(rule)
      expect(guidance, rule).toBeDefined()
      expect(guidance?.requirement.length, rule).toBeGreaterThan(0)
      expect(guidance?.fix.length, rule).toBeGreaterThan(0)
    }
  })

  it('states the requirement as what must hold, not as the observation', () => {
    expect(guidanceFor('image-no-alt')?.requirement).toContain('text alternative')
    expect(guidanceFor('placeholder-only-field')?.fix).toContain('label')
  })

  it('explains the common axe rules and links their documentation', () => {
    const guidance = guidanceFor('axe:color-contrast')
    expect(guidance?.fix).toContain('4.5:1')
    expect(guidance?.helpUrl).toContain('color-contrast')
  })

  it('leaves an unlisted rule to the producer', () => {
    expect(guidanceFor('axe:some-rule-we-do-not-own')).toBeUndefined()
    expect(guidanceFor('a-rule-we-do-not-emit')).toBeUndefined()
  })

  it('falls back to the description axe reported for an unlisted rule', () => {
    const guidance = axeGuidance('some-rule-we-do-not-own', 'Elements must do the thing', 'https://example.test/rule')
    expect(guidance.requirement).toBe('Elements must do the thing')
    expect(guidance.helpUrl).toBe('https://example.test/rule')
    expect(guidance.fix.length).toBeGreaterThan(0)
  })

  it('prefers its own wording for a listed rule and keeps axe link when it has none', () => {
    const guidance = axeGuidance('color-contrast', 'axe wording', 'https://example.test/other')
    expect(guidance.requirement).not.toBe('axe wording')
    expect(guidance.helpUrl).toContain('color-contrast')
  })
})
