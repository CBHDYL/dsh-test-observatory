// Declaring a persona behaviour in the suite configuration: the two accepted
// forms, and the mistakes that must fail loudly rather than silently running the
// neutral policy while the report claims otherwise.
import { describe, expect, it } from 'vitest'
import { SuiteConfigError, parseSuiteConfig } from '../src/command/config.ts'
import { STRUCTURED_RESULT_FORMATS } from '../src/command/types.ts'
import type { SuiteConfig } from '../src/command/types.ts'
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

describe('structured result formats', () => {
  /** A suite whose single case declares the given result format. */
  function withFormat(format: string): SuiteConfig {
    return parseSuiteConfig(['cases:', '  - name: a', '    command: x', '    result:', '      format: ' + format, '      path: out.xml', ''].join('\n'))
  }

  it('accepts every format the package advertises', () => {
    for (const format of STRUCTURED_RESULT_FORMATS) {
      expect(withFormat(format).cases[0]?.result?.format).toBe(format)
    }
  })

  it('names every accepted format in the message it rejects with', () => {
    // The message and the check read the same list; this caught the two drifting
    // apart, where a valid format was accepted but absent from the advice.
    let message = ''
    try {
      withFormat('nonsense')
    } catch (error) {
      message = (error as Error).message
    }
    for (const format of STRUCTURED_RESULT_FORMATS) expect(message).toContain(format)
  })

  it('names the offending position so a long document is navigable', () => {
    expect(() => parseSuiteConfig([
      'cases:',
      '  - name: a',
      '    command: x',
      '  - name: b',
      '    command: x',
      '    result:',
      '      format: nope',
      '      path: out.xml',
      '',
    ].join('\n'))).toThrow(/cases\[1\]\.result\.format/)
  })
})

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