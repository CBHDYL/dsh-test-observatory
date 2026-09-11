// The checks table is built with innerHTML, so every value it interpolates must
// be escaped first: a fix sentence naming an <h1> disappeared from the report
// when it was inserted as markup.
import { describe, expect, it } from 'vitest'
import { REPORT_SCRIPT } from '../src/report/assets.generated.ts'

/** The checks-table renderer's own source. */
function renderer(): string {
  const start = REPORT_SCRIPT.indexOf('var hasNote=m.checks.some')
  return REPORT_SCRIPT.slice(start, REPORT_SCRIPT.indexOf('function applySubtitles'))
}

describe('checks table rendering', () => {
  it('escapes every finding field it interpolates', () => {
    const source = renderer()
    expect(source.length).toBeGreaterThan(100)
    for (const field of ['c.rule', 'c.family', 'c.detail', 'c.persona', 'c.requirement', 'c.fix', 'c.interpretation', 'c.nextAction', 'e.selector']) {
      expect(source, field).toContain('esc(' + field + ')')
    }
  })

  it('renders the requirement, the fix and the rule link', () => {
    const source = renderer()
    expect(source).toContain('Fix:')
    expect(source).toContain('Rule documentation')
    expect(source).toContain('c.helpUrl')
  })
})
