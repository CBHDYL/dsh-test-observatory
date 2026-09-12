// The checks page is the one a reader acts on, so its shape is pinned: a
// finding is a card with the requirement first and the machine detail folded
// away, and everything it interpolates is escaped because it builds its markup
// with innerHTML.
import { describe, expect, it } from 'vitest'
import { REPORT_SCRIPT } from '../src/report/assets.generated.ts'

/** The checks renderer's own source. */
function renderer(): string {
  const start = REPORT_SCRIPT.indexOf('function applyChecks(m){')
  return REPORT_SCRIPT.slice(start, REPORT_SCRIPT.indexOf('function ', start + 10))
}

describe('checks page rendering', () => {
  it('escapes every finding field it interpolates', () => {
    const source = renderer()
    expect(source.length).toBeGreaterThan(200)
    for (const field of ['c.rule', 'c.persona', 'c.detail', 'c.fix', 'c.interpretation', 'c.nextAction', 'c.helpUrl', 'e.selector', 'e.text']) {
      expect(source, field).toContain('esc(' + field + ')')
    }
    // The title is the requirement when there is one, and the observation otherwise.
    expect(source).toContain('esc(head)')
  })

  it('leads with the requirement rather than the rule id', () => {
    const source = renderer()
    expect(source).toContain('c.requirement||c.detail')
    expect(source).toContain('fc-title')
  })

  it('folds the machine detail behind one disclosure per finding', () => {
    const source = renderer()
    expect(source).toContain('fc-dev')
    expect(source).toContain('<details')
    expect(source).toContain('Developer evidence')
  })

  it('keeps unmeasurable elements out of the list and counts them instead', () => {
    const source = renderer()
    expect(source).toContain('e.box.width>0&&e.box.height>0&&e.box.y>=0')
    expect(source).toContain('not shown')
    expect(source).toContain('.slice(0,3)')
  })

  it('orders the worst finding first', () => {
    expect(renderer()).toContain("a.severity==='high'?0:1")
  })

  it('states plainly when there is nothing to show', () => {
    expect(renderer()).toContain('recorded no finding')
  })
})
