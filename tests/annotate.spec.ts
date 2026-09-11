// @vitest-environment jsdom
// The overlay annotator: what it draws, what it refuses to draw, and the
// guarantee the report depends on — that removing it leaves the page clean.
//
// jsdom supplies a real document and element model, so the assertions run
// against the DOM the annotator actually builds rather than a hand-written
// element double.
import { describe, expect, it } from 'vitest'
import { HIGH_COLOR, MEDIUM_COLOR, OVERLAY_ATTRIBUTE, annotate, overlayPresent } from '../src/experience/annotate.ts'
import type { Annotation } from '../src/experience/annotate.ts'
import type { ElementEvidence } from '../src/experience/geometry.ts'

/** One annotation at a known viewport rectangle. */
function annotation(label: string, severity: 'high' | 'medium', box: Partial<ElementEvidence['box']> = {}): Annotation {
  return {
    label,
    severity,
    evidence: {
      element: { tag: 'div', selector: '#' + label },
      box: { x: 10, y: 20, width: 100, height: 40, space: 'viewport', ...box },
    },
  }
}

/** A page double that runs the annotator's in-page function against jsdom. */
function fakePage() {
  return {
    evaluate: async (expression: unknown, ...args: unknown[]): Promise<unknown> => {
      const fn = expression as (...values: unknown[]) => unknown
      return fn(...args)
    },
  }
}

/** Every overlay node currently attached to the document. */
function overlayNodes(): Element[] {
  return Array.from(document.querySelectorAll('[' + OVERLAY_ATTRIBUTE + ']'))
}

describe('annotate', () => {
  it('reports the regions it drew and marks them on the page', async () => {
    document.body.innerHTML = ''
    const handle = await annotate(fakePage() as never, [annotation('image-broken', 'high')])
    expect(handle.drawn).toEqual([{ label: 'image-broken', x: 10, y: 20, width: 100, height: 40 }])
    expect(handle.skipped).toEqual([])
    // One host, one box and one label.
    expect(overlayNodes()).toHaveLength(3)
    const labels = overlayNodes().filter(node => node.getAttribute(OVERLAY_ATTRIBUTE) === 'label')
    expect(labels.map(node => node.textContent)).toEqual(['image-broken'])
  })

  it('gives a blocking finding the blocking colour', async () => {
    document.body.innerHTML = ''
    await annotate(fakePage() as never, [annotation('blocking', 'high'), annotation('minor', 'medium')])
    const boxes = overlayNodes().filter(node => node.getAttribute(OVERLAY_ATTRIBUTE) === 'box') as HTMLElement[]
    // jsdom normalizes a hex colour to its rgb() form.
    const rgb = (hex: string): string => {
      const value = hex.replace('#', '')
      return 'rgb(' + [0, 2, 4].map(offset => String(parseInt(value.slice(offset, offset + 2), 16))).join(', ') + ')'
    }
    expect(boxes.map(box => box.style.borderColor)).toEqual([rgb(HIGH_COLOR), rgb(MEDIUM_COLOR)])
  })

  it('positions each box at the measured rectangle', async () => {
    document.body.innerHTML = ''
    await annotate(fakePage() as never, [annotation('placed', 'high', { x: 33, y: 44, width: 55, height: 66 })])
    const box = overlayNodes().find(node => node.getAttribute(OVERLAY_ATTRIBUTE) === 'box') as HTMLElement
    expect(box.style.left).toBe('33px')
    expect(box.style.top).toBe('44px')
    expect(box.style.width).toBe('55px')
    expect(box.style.height).toBe('66px')
  })

  it('keeps a label on screen when its box sits at the top edge', async () => {
    document.body.innerHTML = ''
    await annotate(fakePage() as never, [annotation('top', 'high', { y: 0 })])
    const label = overlayNodes().find(node => node.getAttribute(OVERLAY_ATTRIBUTE) === 'label') as HTMLElement
    expect(label.style.top).toBe('0px')
  })

  it('skips a region whose coordinates are not viewport space', async () => {
    document.body.innerHTML = ''
    const handle = await annotate(fakePage() as never, [
      annotation('viewport', 'high'),
      annotation('full-page', 'high', { space: 'fullPage' }),
    ])
    expect(handle.drawn.map(entry => entry.label)).toEqual(['viewport'])
    expect(handle.skipped).toEqual(['full-page'])
  })

  it('draws nothing for an empty annotation list', async () => {
    document.body.innerHTML = ''
    const handle = await annotate(fakePage() as never, [])
    expect(handle.drawn).toEqual([])
    expect(handle.skipped).toEqual([])
    expect(overlayNodes()).toEqual([])
  })

  it('removes its overlay completely, leaving the page as it found it', async () => {
    document.body.innerHTML = '<p id="content">page</p>'
    const handle = await annotate(fakePage() as never, [annotation('a', 'high'), annotation('b', 'medium')])
    expect(overlayNodes().length).toBeGreaterThan(0)
    await handle.remove()
    expect(overlayNodes()).toEqual([])
    expect(document.getElementById('content')).not.toBeNull()
  })

  it('is safe to remove twice', async () => {
    document.body.innerHTML = ''
    const handle = await annotate(fakePage() as never, [annotation('a', 'high')])
    await handle.remove()
    await expect(handle.remove()).resolves.toBeUndefined()
    expect(overlayNodes()).toEqual([])
  })

  it('exposes the colors the report legend uses', () => {
    expect(HIGH_COLOR).toBe('#e5484d')
    expect(MEDIUM_COLOR).toBe('#d97706')
    expect(OVERLAY_ATTRIBUTE).toBe('data-observatory-overlay')
  })
})

describe('overlayPresent', () => {
  it('reports whether an overlay node is attached', async () => {
    document.body.innerHTML = ''
    await expect(overlayPresent(fakePage() as never)).resolves.toBe(false)
    const handle = await annotate(fakePage() as never, [annotation('a', 'high')])
    await expect(overlayPresent(fakePage() as never)).resolves.toBe(true)
    await handle.remove()
    await expect(overlayPresent(fakePage() as never)).resolves.toBe(false)
  })
})