// @vitest-environment jsdom
// The capture target is chosen from the rendered document alone, because a
// plugin installed on another machine cannot know that project's markup. These
// cases pin the rule: the densest region that still carries most of the page's
// text, and a stated measure of how much of it is actually content.
import { describe, expect, it } from 'vitest'
import { detectContentRegion } from '../src/experience/focus.ts'

/** Give one element a rectangle, since jsdom reports none. */
function box(element: Element, left: number, top: number, width: number, height: number): void {
  ;(element as HTMLElement).getBoundingClientRect = () => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  }) as DOMRect
}

/** Build a body with one wide wrapper and one dense panel inside it. */
function page(): { wrapper: HTMLElement; panel: HTMLElement } {
  document.body.innerHTML = ''
  const wrapper = document.createElement('div')
  wrapper.innerHTML = '<main><section id="panel"><p>' + 'content '.repeat(40) + '</p></section><aside>tiny</aside></main>'
  document.body.appendChild(wrapper)
  const main = wrapper.querySelector('main') as HTMLElement
  const panel = wrapper.querySelector('#panel') as HTMLElement
  box(wrapper, 0, 0, 1440, 900)
  box(main, 0, 0, 1440, 900)
  box(panel, 40, 40, 600, 300)
  box(panel.querySelector('p') as HTMLElement, 40, 40, 600, 300)
  return { wrapper, panel }
}

describe('content region detection', () => {
  it('chooses the dense panel over the full-height wrapper', () => {
    page()
    const region = detectContentRegion()
    expect(region).toBeDefined()
    expect(region?.width).toBe(600)
    expect(region?.height).toBe(300)
    expect(region?.reason).toContain('carries')
  })

  it('reports how much of the chosen region carries content', () => {
    page()
    const region = detectContentRegion()
    expect(region?.inkShare).toBeGreaterThan(0.9)
  })

  it('measures a sparse region low, so the capture can say so', () => {
    const { panel } = page()
    box(panel, 0, 0, 600, 400)
    const paragraph = panel.querySelector('p') as HTMLElement
    box(paragraph, 0, 0, 120, 20)
    const region = detectContentRegion()
    expect(region?.width).toBe(600)
    expect(region?.inkShare).toBeLessThan(0.25)
  })

  it('returns nothing when no region carries enough of the page', () => {
    document.body.innerHTML = ''
    const tiny = document.createElement('div')
    tiny.textContent = 'x'
    document.body.appendChild(tiny)
    box(tiny, 0, 0, 50, 50)
    expect(detectContentRegion()).toBeUndefined()
  })
})
