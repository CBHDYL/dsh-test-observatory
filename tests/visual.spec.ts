// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { checkVisual, collectViolations } from '../src/experience/visual.ts'

/** Replace the document body with the supplied markup. */
function mount(html: string): void {
  document.body.innerHTML = html
}

describe('checkVisual', () => {
  it('runs the serialized inspection inside the page and returns its result', async () => {
    // The real page evaluates the expression string; jsdom can run it too.
    const page = {
      evaluate: async (expression: string) => (0, eval)(expression) as unknown,
    }
    mount('<input placeholder="Email">')
    const violations = await checkVisual(page as never)
    expect(violations.map(violation => violation.rule)).toContain('placeholder-only-field')
  })
})

describe('collectViolations', () => {
  it('reports nothing for a clean document', () => {
    mount('<p>Clean</p>')
    expect(collectViolations(document)).toEqual([])
  })

  it('reports images without an alt attribute', () => {
    mount('<img src="a.png"><img src="b.png" alt="ok">')
    const rules = collectViolations(document).map(violation => violation.rule)
    expect(rules).toContain('image-no-alt')
  })

  it('reports a field that relies on a placeholder with no label', () => {
    mount('<input placeholder="Email">')
    expect(collectViolations(document).map(violation => violation.rule)).toContain('placeholder-only-field')
  })

  it('accepts a labelled field and an aria-labelled field', () => {
    mount('<label for="a">Email</label><input id="a" placeholder="Email"><input aria-label="Card" placeholder="Card">')
    expect(collectViolations(document).map(violation => violation.rule)).not.toContain('placeholder-only-field')
  })

  it('reports a broken image with the failing source', () => {
    mount('<img src="missing.png">')
    const image = document.querySelector('img') as HTMLImageElement
    // jsdom never loads images, so the "complete but zero-width" state a real
    // browser reports for a failed request is simulated here.
    Object.defineProperty(image, 'complete', { value: true, configurable: true })
    const finding = collectViolations(document).find(violation => violation.rule === 'image-broken')
    expect(finding?.detail).toContain('missing.png')
    expect(finding?.severity).toBe('high')
  })

  it('reports a broken image that has no src at all', () => {
    mount('<img>')
    const image = document.querySelector('img') as HTMLImageElement
    Object.defineProperty(image, 'complete', { value: true, configurable: true })
    const finding = collectViolations(document).find(violation => violation.rule === 'image-broken')
    expect(finding?.detail).toContain('(no src)')
  })

  it('reports horizontal overflow of the document', () => {
    mount('<p>wide</p>')
    Object.defineProperty(document.documentElement, 'scrollWidth', { value: 1200, configurable: true })
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 800, configurable: true })
    const finding = collectViolations(document).find(violation => violation.rule === 'horizontal-overflow')
    expect(finding?.detail).toContain('400px')
    expect(finding?.severity).toBe('high')
  })

  it('reports an element that extends past the viewport', () => {
    mount('<div id="wide">x</div>')
    const element = document.getElementById('wide') as HTMLElement
    element.getBoundingClientRect = () => ({ width: 100, right: 5000, left: 0, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const finding = collectViolations(document).find(violation => violation.rule === 'element-outside-viewport')
    expect(finding?.detail).toContain('DIV')
    expect(finding?.severity).toBe('medium')
  })

  it('names the first broken image without a src attribute', () => {
    mount('<img>')
    const image = document.querySelector('img') as HTMLImageElement
    Object.defineProperty(image, 'complete', { value: true, configurable: true })
    const finding = collectViolations(document).find(violation => violation.rule === 'image-broken')
    expect(finding?.detail).toContain('(no src)')
  })

  it('tolerates an element that reports no tag name', () => {
    mount('<div id="wide">x</div>')
    const element = document.getElementById('wide') as HTMLElement
    Object.defineProperty(element, 'tagName', { value: undefined, configurable: true })
    element.getBoundingClientRect = () => ({ width: 100, right: 5000, left: 0, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const finding = collectViolations(document).find(violation => violation.rule === 'element-outside-viewport')
    expect(finding).toBeDefined()
  })

  it('returns findings whose details name what was observed', () => {
    mount('<img src="missing.png">')
    const finding = collectViolations(document).find(violation => violation.rule === 'image-no-alt')
    expect(finding?.detail).toContain('1 image(s)')
    expect(finding?.severity).toBe('medium')
  })
})