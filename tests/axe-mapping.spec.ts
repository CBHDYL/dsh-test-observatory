// The axe payload mappers, tested directly. They are pure functions over the
// object axe reports, so a fixture describes an axe run without a browser — which
// is how the mapping rules get exercised rather than only their happy path.
import { describe, expect, it } from 'vitest'
import { asAxeReport, evidenceOf, nestedTargetsOf, selectorOf, tagOf, targetsOf, textOf } from '../src/experience/a11y.ts'
import type { AxeNode } from '../src/experience/a11y.ts'

describe('asAxeReport', () => {
  it('accepts an object carrying a violations list', () => {
    expect(asAxeReport({ violations: [] })).toEqual({ violations: [] })
  })

  it('rejects a value that is not an object', () => {
    expect(asAxeReport(null)).toBeUndefined()
    expect(asAxeReport('axe')).toBeUndefined()
    expect(asAxeReport(7)).toBeUndefined()
  })

  it('rejects an object whose violations field is not a list', () => {
    // axe returning something else means the run did not report a report.
    expect(asAxeReport({ violations: 'none' })).toBeUndefined()
    expect(asAxeReport({})).toBeUndefined()
  })
})

describe('axe node selectors', () => {
  it('keeps the flat selectors and drops anything else', () => {
    expect(targetsOf({ target: ['#a', 7, '#b'] } as unknown as AxeNode)).toEqual(['#a', '#b'])
  })

  it('reports no flat selectors for a node with no target', () => {
    expect(targetsOf({})).toEqual([])
    expect(targetsOf({ target: 'not-a-list' } as unknown as AxeNode)).toEqual([])
  })

  it('flattens the nested target form', () => {
    expect(nestedTargetsOf({ target: [['#a'], ['#b', '#c']] })).toEqual(['#a', '#b', '#c'])
  })

  it('reports no nested selectors for a node with no target', () => {
    expect(nestedTargetsOf({})).toEqual([])
  })

  it('prefers the flat selector over the nested one', () => {
    expect(selectorOf({ target: ['#flat', '#nested'] })).toBe('#flat')
  })

  it('falls back to the nested selector when there is no flat one', () => {
    expect(selectorOf({ target: [['#nested']] })).toBe('#nested')
  })

  it('reports no selector at all when neither form is present', () => {
    expect(selectorOf({})).toBeUndefined()
  })
})

describe('axe node description', () => {
  it('reads the tag from the node markup', () => {
    expect(tagOf({ html: '<button class="x">go</button>' }, '#go')).toBe('button')
  })

  it('reads the tag from the selector when the markup names none', () => {
    expect(tagOf({}, 'img.hero')).toBe('img')
  })

  it('falls back to a neutral name when neither source has one', () => {
    expect(tagOf({}, undefined)).toBe('element')
    expect(tagOf({ html: '<' }, '!.x')).toBe('element')
  })

  it('strips markup and collapses whitespace for the excerpt', () => {
    expect(textOf({ html: '<b>Hello</b>\n  <i>world</i>' })).toBe('Hello world')
  })

  it('reports no excerpt for markup carrying no text', () => {
    expect(textOf({ html: '<br>' })).toBeUndefined()
    expect(textOf({})).toBeUndefined()
  })

  it('truncates a long excerpt with a visible marker', () => {
    const long = textOf({ html: 'x'.repeat(200) })
    expect(long?.endsWith('…')).toBe(true)
    expect(long?.length).toBeLessThan(100)
  })
})

describe('evidenceOf', () => {
  it('describes a node that reported a selector', () => {
    const evidence = evidenceOf({ target: ['#save'], html: '<button id="save">Save draft</button>' })
    expect(evidence?.element).toEqual({ tag: 'button', selector: '#save', text: 'Save draft' })
    // axe reports no geometry, so the box states that plainly rather than guessing.
    expect(evidence?.box).toEqual({ x: 0, y: 0, width: 0, height: 0, space: 'viewport' })
  })

  it('omits the excerpt when the node carried no text', () => {
    expect(evidenceOf({ target: ['#icon'] })?.element).toEqual({ tag: 'element', selector: '#icon' })
  })

  it('reports nothing for a node that named no selector', () => {
    expect(evidenceOf({})).toBeUndefined()
  })
})