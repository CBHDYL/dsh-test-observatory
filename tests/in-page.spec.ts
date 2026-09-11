// @vitest-environment jsdom
// The page-support module: making a bundler helper available in the page, and
// deciding whether focus is actually drawn in a way that survives the colour
// syntax a real browser reports.
import { describe, expect, it } from 'vitest'
import { drawsFocusIndicator, drawsFocusIndicatorSource, ensurePageHelpers } from '../src/experience/in-page.ts'
import type { Page } from 'playwright-core'

/** A page double whose global scope is the test process's own. */
function fakePage() {
  return {
    evaluate: async (expression: unknown): Promise<unknown> => {
      const fn = expression as () => unknown
      return fn()
    },
  }
}

/** Computed-style values an element would report, over the fields consulted. */
function styleOf(values: Partial<Record<'outline' | 'outlineStyle' | 'outlineWidth' | 'outlineColor' | 'boxShadow', string>>): CSSStyleDeclaration {
  return {
    outline: '',
    outlineStyle: 'none',
    outlineWidth: '0px',
    outlineColor: 'rgb(0, 0, 0)',
    boxShadow: 'none',
    ...values,
  } as unknown as CSSStyleDeclaration
}

describe('ensurePageHelpers', () => {
  it('defines the helper the serialized inspections depend on', async () => {
    const scope = globalThis as unknown as { __name?: unknown }
    delete scope.__name
    await ensurePageHelpers(fakePage() as unknown as Page)
    expect(typeof scope.__name).toBe('function')
    delete scope.__name
  })

  it('returns the value it is given, so naming changes nothing', async () => {
    const scope = globalThis as unknown as { __name?: (value: unknown) => unknown }
    delete scope.__name
    await ensurePageHelpers(fakePage() as unknown as Page)
    const installed: unknown = scope.__name
    if (typeof installed !== 'function') throw new Error('the helper was not installed')
    const install = installed as (value: unknown) => unknown
    const original = (): number => 42
    expect(install(original)).toBe(original)
    delete scope.__name
  })

  it('leaves a helper the page already defines untouched', async () => {
    const scope = globalThis as unknown as { __name?: unknown }
    const mine = (): string => 'page-defined'
    scope.__name = mine
    await ensurePageHelpers(fakePage() as unknown as Page)
    expect(scope.__name).toBe(mine)
    delete scope.__name
  })

  it('is safe to call more than once', async () => {
    const scope = globalThis as unknown as { __name?: unknown }
    delete scope.__name
    const page = fakePage()
    await ensurePageHelpers(page as unknown as Page)
    const first = scope.__name
    await ensurePageHelpers(page as unknown as Page)
    expect(scope.__name).toBe(first)
    delete scope.__name
  })
})

describe('drawsFocusIndicator', () => {
  it('accepts a longhand outline', () => {
    expect(drawsFocusIndicator(styleOf({ outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgb(0, 0, 0)' }))).toBe(true)
  })

  it('accepts a box shadow when no outline is drawn', () => {
    expect(drawsFocusIndicator(styleOf({ boxShadow: 'rgb(0, 0, 255) 0px 0px 0px 3px' }))).toBe(true)
  })

  it('rejects a fully transparent outline', () => {
    expect(drawsFocusIndicator(styleOf({ outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgba(0, 0, 0, 0)' }))).toBe(false)
  })

  it('rejects the shorthand a real browser reports for outline: none', () => {
    // Chromium reports the colour first, so a whitespace split would see "rgb(0,"
    // and misread this as a drawn outline.
    expect(drawsFocusIndicator(styleOf({ outline: 'rgb(0, 0, 0) none 3px', outlineStyle: 'none', outlineWidth: '3px' }))).toBe(false)
  })

  it('accepts the shorthand a real browser reports for a drawn outline', () => {
    expect(drawsFocusIndicator(styleOf({ outline: 'rgb(0, 0, 0) solid 2px', outlineStyle: 'solid', outlineWidth: '2px' }))).toBe(true)
  })

  it('rejects a shorthand whose width is zero', () => {
    expect(drawsFocusIndicator(styleOf({ outline: 'rgb(0, 0, 0) solid 0px', outlineStyle: 'solid', outlineWidth: '0px' }))).toBe(false)
  })

  it('rejects a transparent shadow', () => {
    expect(drawsFocusIndicator(styleOf({ boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 3px' }))).toBe(false)
  })

  it('rejects a style that draws nothing at all', () => {
    expect(drawsFocusIndicator(styleOf({}))).toBe(false)
  })

  it('serializes to a self-contained expression', () => {
    const source = drawsFocusIndicatorSource()
    expect(source.startsWith('(')).toBe(true)
    // Evaluating the serialized text must reproduce the function's behaviour.
    const rebuilt = new Function('return ' + source)() as (style: CSSStyleDeclaration) => boolean
    expect(rebuilt(styleOf({ outlineStyle: 'solid', outlineWidth: '2px' }))).toBe(true)
    expect(rebuilt(styleOf({ outline: 'rgb(0, 0, 0) none 3px', outlineStyle: 'none', outlineWidth: '3px' }))).toBe(false)
  })
})
