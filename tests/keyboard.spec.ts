// @vitest-environment jsdom
// Reaching a target without a pointer: the Tab search, the budget that turns an
// unreachable target into a finding, and the focus-visible judgement.
import { describe, expect, it } from 'vitest'
import { DEFAULT_TAB_BUDGET, activateFocused, pressEscape, tabToTarget } from '../src/experience/behavior/keyboard.ts'
import type { Page } from 'playwright-core'

/** A page double that runs the keyboard module's in-page functions in jsdom. */
function fakePage(pressed: string[] = []) {
  return {
    pressed,
    keyboard: { press: async (key: string) => { pressed.push(key) } },
    // Playwright passes exactly one argument to a browser-context function.
    evaluate: async (expression: unknown, arg?: unknown): Promise<unknown> => {
      const fn = expression as (value?: unknown) => unknown
      return fn(arg)
    },
  }
}

/** Put a set of focusable elements on the page and focus the first. */
function mount(html: string): void {
  document.body.innerHTML = html
  const first = document.querySelector('[tabindex], button, a, input') as HTMLElement | null
  if (first !== null) first.focus()
}

describe('tabToTarget', () => {
  it('reports a target that is already focused without pressing Tab', async () => {
    mount('<button id="first">one</button><button id="second">two</button>')
    const page = fakePage()
    const reach = await tabToTarget(page as unknown as Page, '#first')
    expect(reach.reached).toBe(true)
    expect(reach.tabs).toBe(0)
    expect(page.pressed).toEqual([])
  })

  it('presses Tab until the target has focus and records the stops', async () => {
    mount('<button id="a">a</button><button id="b">b</button><button id="c">c</button>')
    const page = fakePage()
    // Advance focus on each Tab, the way the browser would.
    let index = 0
    const original = page.evaluate
    page.evaluate = async (expression: unknown, arg?: unknown) => {
      const source = String(expression)
      if (source.startsWith('wanted')) return false
      return await original(expression, arg)
    }
    page.keyboard.press = async (key: string) => {
      page.pressed.push(key)
      index += 1
      const elements = Array.from(document.querySelectorAll('button')) as HTMLElement[]
      elements[Math.min(index, elements.length - 1)]?.focus()
    }
    const reach = await tabToTarget(page as unknown as Page, '#c')
    expect(reach.reached).toBe(true)
    expect(reach.tabs).toBe(2)
    expect(page.pressed).toEqual(['Tab', 'Tab'])
    expect(reach.stops.map(stop => stop.tag)).toContain('button')
  })

  it('reports an unreachable target after exhausting the budget', async () => {
    mount('<button id="only">only</button>')
    const page = fakePage()
    const reach = await tabToTarget(page as unknown as Page, '#never-there', 3)
    expect(reach.reached).toBe(false)
    expect(reach.tabs).toBe(3)
    expect(page.pressed).toEqual(['Tab', 'Tab', 'Tab'])
  })

  it('uses the default budget when none is given', async () => {
    mount('<button id="only">only</button>')
    const page = fakePage()
    const reach = await tabToTarget(page as unknown as Page, '#absent')
    expect(reach.tabs).toBe(DEFAULT_TAB_BUDGET)
  })

  it('treats the body as having no focus rather than as a stop', async () => {
    mount('<p>plain</p>')
    document.body.focus()
    const page = fakePage()
    const reach = await tabToTarget(page as unknown as Page, '#absent', 1)
    expect(reach.stops).toEqual([])
  })

  it('survives a selector the page cannot match without throwing', async () => {
    mount('<button id="only">only</button>')
    const page = fakePage()
    await expect(tabToTarget(page as unknown as Page, '::not-a-selector', 1)).resolves.toMatchObject({ reached: false })
  })

  // jsdom does not resolve stylesheet rules, so the indicator is expressed as an
  // inline style. The judgement reads computed style either way.
  it('judges focus visible from an outline', async () => {
    mount('<button id="outlined" style="outline:2px solid rgb(0,0,0)">outlined</button>')
    const reach = await tabToTarget(fakePage() as unknown as Page, '#outlined')
    expect(reach.stops[0]?.focusVisible).toBe(true)
  })

  it('judges focus visible from a box shadow when no outline is drawn', async () => {
    mount('<button id="shadowed" style="outline:none;box-shadow:0 0 0 3px rgb(0,0,255)">shadowed</button>')
    const reach = await tabToTarget(fakePage() as unknown as Page, '#shadowed')
    expect(reach.stops[0]?.focusVisible).toBe(true)
  })

  it('reports focus as invisible when nothing is drawn for it', async () => {
    mount('<button id="bare" style="outline:none;box-shadow:none">bare</button>')
    const reach = await tabToTarget(fakePage() as unknown as Page, '#bare')
    expect(reach.stops[0]?.focusVisible).toBe(false)
  })

  it('reports focus as invisible for a fully transparent outline', async () => {
    mount('<button id="ghost" style="outline:2px solid rgba(0,0,0,0);box-shadow:none">ghost</button>')
    const reach = await tabToTarget(fakePage() as unknown as Page, '#ghost')
    expect(reach.stops[0]?.focusVisible).toBe(false)
  })

  it('labels a stop from aria-label, then from its text', async () => {
    mount('<button id="labelled" aria-label="Save draft">x</button>')
    const withAria = await tabToTarget(fakePage() as unknown as Page, '#labelled')
    expect(withAria.stops[0]?.label).toContain('Save draft')

    mount('<button id="textual">Publish now</button>')
    const withText = await tabToTarget(fakePage() as unknown as Page, '#textual')
    expect(withText.stops[0]?.label).toContain('Publish now')
  })
})

describe('keyboard activation', () => {
  it('activates with Enter by default', async () => {
    const page = fakePage()
    await activateFocused(page as unknown as Page)
    expect(page.pressed).toEqual(['Enter'])
  })

  it('activates with a named key when asked', async () => {
    const page = fakePage()
    await activateFocused(page as unknown as Page, ' ')
    expect(page.pressed).toEqual([' '])
  })

  it('dismisses with Escape', async () => {
    const page = fakePage()
    await pressEscape(page as unknown as Page)
    expect(page.pressed).toEqual(['Escape'])
  })
})