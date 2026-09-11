// Declaring a persona behaviour in the suite configuration: the two accepted
// forms, and the mistakes that must fail loudly rather than silently running the
// neutral policy while the report claims otherwise.
import { describe, expect, it } from 'vitest'
import { SuiteConfigError, parseSuiteConfig } from '../src/command/config.ts'
import type { JourneySpec } from '../src/experience/types.ts'

/** A suite document whose single journey carries the given behaviour lines. */
function withBehavior(lines: readonly string[]): JourneySpec {
  return parseSuiteConfig([
    'journeys:',
    '  - persona: Impatient user',
    '    device: Desktop',
    '    name: Rushes through',
    ...lines,
    '    steps:',
    '      - label: open',
    '        actions:',
    '          - kind: goto',
    '            url: http://example.test/',
    'cases:',
    '  - name: a',
    '    command: x',
    '',
  ].join('\n')).journeys?.[0] as JourneySpec
}

describe('behaviour declarations', () => {
  it('accepts a preset name', () => {
    expect(withBehavior(['    behavior: impatient'])?.behavior).toBe('impatient')
  })

  it('leaves the behaviour absent when none is declared', () => {
    expect(withBehavior([])?.behavior).toBeUndefined()
  })

  it('accepts a preset with overrides', () => {
    const journey = withBehavior([
      '    behavior:',
      '      preset: mobile',
      '      environment:',
      '        network: fast3g',
    ])
    expect(journey?.behavior).toEqual({ preset: 'mobile', environment: { network: 'fast3g' } })
  })

  it('accepts overrides across several dimensions at once', () => {
    const journey = withBehavior([
      '    behavior:',
      '      preset: neutral',
      '      modality:',
      '        pointer: false',
      '      timing:',
      '        waitForIdle: false',
    ])
    expect(journey?.behavior).toMatchObject({ preset: 'neutral', modality: { pointer: false }, timing: { waitForIdle: false } })
  })

  it('passes an unknown preset through so resolution can reject it by name', () => {
    // Validating here would need the preset list; the behaviour module owns it,
    // and it reports the same mistake with the known names attached.
    expect(withBehavior(['    behavior: not-a-preset'])?.behavior).toBe('not-a-preset')
  })

  it('rejects an empty behaviour name', () => {
    expect(() => withBehavior(['    behavior: ""'])).toThrow(SuiteConfigError)
    expect(() => withBehavior(['    behavior: ""'])).toThrow(/behavior: must be a non-empty string/)
  })

  it('rejects a behaviour that is neither a name nor a mapping', () => {
    expect(() => withBehavior(['    behavior: 7'])).toThrow(/must be a preset name or a mapping/)
  })

  it('rejects a mapping with no preset', () => {
    expect(() => withBehavior(['    behavior:', '      timing:', '        waitForIdle: false']))
      .toThrow(/behavior: "preset"/)
  })

  it('rejects a policy section that is not a mapping', () => {
    expect(() => withBehavior(['    behavior:', '      preset: mobile', '      timing: 5']))
      .toThrow(/behavior.timing: must be a mapping/)
  })
})