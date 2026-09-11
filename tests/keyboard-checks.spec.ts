// @vitest-environment jsdom
// Keyboard checks: the barriers a rule scan cannot decide. Each rule is asserted
// twice — once on a page that has the defect and once on a page that does not —
// because a check that never fires proves nothing.
import { describe, expect, it } from 'vitest'
import { MAX_FOCUS_SAMPLES, checkKeyboard, probeOpenDialog } from '../src/experience/keyboard-checks.ts'
import type { Page } from 'playwright-core'

/** A page double that runs in-page inspections in jsdom and records key presses. */
function fakePage() {
  const pressed: string[] = []
  return {
    pressed,
    keyboard: { press: async (key: string) => { pressed.push(key) } },
    // Playwright passes exactly one argument to a browser-context function.
    evaluate: async (expression: unknown, arg?: unknown): Promise<unknown> => {
      const fn = expression as (value?: unknown) => unknown
      return fn(arg)
    },
    locator: () => ({
      count: async () => document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open]').length,
      first: () => ({
        isVisible: async () => true,
        evaluate: async (fn: (node: Element) => unknown) => {
          const dialog = document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]') as Element
          return fn(dialog)
        },
      }),
    }),
  }
}

/** Put markup on the page with an explicit focus style for the given selector. */
function mount(html: string, focusStyle: string): void {
  document.head.innerHTML = ''
  document.body.innerHTML = html
  const style = document.createElement('style')
  style.textContent = focusStyle
  document.head.append(style)
  // jsdom does not resolve stylesheets, so the effect is applied inline instead,
  // which is what the check reads through getComputedStyle either way.
  for (const element of Array.from(document.querySelectorAll('[data-focus]'))) {
    (element as HTMLElement).style.outline = '2px solid rgb(0,0,0)'
  }
}

describe('checkKeyboard', () => {
  it('reports every reachable element when none draws a focus indicator', async () => {
    mount('<button id="a" style="outline:none;width:40px;height:20px">a</button><button id="b" style="outline:none;width:40px;height:20px">b</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    const finding = findings.find(entry => entry.rule === 'keyboard-focus-not-visible')
    expect(finding?.severity).toBe('medium')
    expect(finding?.detail).toContain('2 of 2')
    expect(finding?.evidence).toHaveLength(2)
  })

  it('reports nothing when every reachable element draws a focus indicator', async () => {
    mount('<button id="a" data-focus style="outline:2px solid rgb(0,0,0);width:40px;height:20px">a</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-focus-not-visible')
  })

  it('names only the elements that lack an indicator', async () => {
    mount('<button id="ok" style="outline:2px solid rgb(0,0,0);width:40px;height:20px">ok</button><button id="bad" style="outline:none;width:40px;height:20px">bad</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    const finding = findings.find(entry => entry.rule === 'keyboard-focus-not-visible')
    expect(finding?.detail).toContain('1 of 2')
    expect(finding?.evidence?.[0]?.element.selector).toBe('#bad')
  })

  it('accepts a box shadow as a focus indicator', async () => {
    mount('<button id="a" style="outline:none;box-shadow:0 0 0 3px rgb(0,0,255);width:40px;height:20px">a</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-focus-not-visible')
  })

  it('treats a fully transparent outline as no indicator', async () => {
    mount('<button id="a" style="outline:2px solid rgba(0,0,0,0);width:40px;height:20px">a</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).toContain('keyboard-focus-not-visible')
  })

  it('ignores elements that are not rendered', async () => {
    mount('<button id="hidden" style="display:none;outline:none;width:40px;height:20px">hidden</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-focus-not-visible')
  })

  it('ignores elements removed from the tab order', async () => {
    mount('<div tabindex="-1" style="outline:none;width:10px;height:10px">skip</div>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-focus-not-visible')
  })

  it('reports an open dialog so the reader knows one was left on screen', async () => {
    mount('<div role="dialog" aria-label="Confirm order" style="width:200px;height:100px"><button style="outline:none;width:40px;height:20px">OK</button></div>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    const dialog = findings.find(entry => entry.rule === 'keyboard-dialog-present')
    expect(dialog?.detail).toContain('Confirm order')
  })

  it('reports no dialog finding when none is open', async () => {
    mount('<button style="outline:none;width:40px;height:20px">a</button>', '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-dialog-present')
  })

  it('bounds how many elements it samples on a large page', async () => {
    const many = Array.from({ length: MAX_FOCUS_SAMPLES + 20 }, (_, index) => '<button id="b' + String(index) + '" style="outline:none;width:40px;height:20px">x</button>').join('')
    mount(many, '')
    const findings = await checkKeyboard(fakePage() as unknown as Page)
    const finding = findings.find(entry => entry.rule === 'keyboard-focus-not-visible')
    expect(finding?.detail).toContain('of ' + String(MAX_FOCUS_SAMPLES))
  })
})

describe('probeOpenDialog', () => {
  it('does nothing when no dialog is open', async () => {
    document.body.innerHTML = ''
    const page = fakePage()
    await expect(probeOpenDialog(page as unknown as Page)).resolves.toEqual([])
    expect(page.pressed).toEqual([])
  })

  it('reports a dialog that lets focus escape to the page behind it', async () => {
    mount('<div role="dialog" aria-label="Confirm"><button>OK</button></div>', '')
    const page = fakePage()
    // Focus stays on the body, which is outside the dialog.
    const findings = await probeOpenDialog(page as unknown as Page)
    expect(findings.map(entry => entry.rule)).toContain('keyboard-focus-trap-missing')
    expect(page.pressed.filter(key => key === 'Tab')).toHaveLength(12)
  })

  it('reports Escape that does nothing', async () => {
    mount('<div role="dialog" aria-label="Confirm"><button>OK</button></div>', '')
    const page = fakePage()
    // isVisible always resolves true here, so Escape is judged not to have dismissed it.
    const findings = await probeOpenDialog(page as unknown as Page)
    expect(findings.map(entry => entry.rule)).toContain('keyboard-escape-ignored')
    expect(page.pressed).toContain('Escape')
  })

  it('keeps focus inside the dialog when the dialog traps it', async () => {
    document.body.innerHTML = '<div role="dialog" aria-label="Confirm"><button id="inside">OK</button></div>'
    const page = fakePage()
    page.keyboard.press = async (key: string) => {
      page.pressed.push(key)
      // A trapping dialog keeps focus on its own control after every Tab.
      if (key === 'Tab') (document.getElementById('inside') as HTMLElement).focus()
    }
    const findings = await probeOpenDialog(page as unknown as Page)
    expect(findings.map(entry => entry.rule)).not.toContain('keyboard-focus-trap-missing')
  })
})