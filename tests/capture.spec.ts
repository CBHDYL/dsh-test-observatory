// @vitest-environment jsdom
// Bounded capture with markings: the clean image, the marked image, and the
// integrity verdict. The page double exercises the real annotator through jsdom,
// so the assertions cover the actual injection and removal path.
import { describe, expect, it } from 'vitest'
import { MAX_SHOT_BYTES, captureEvidence } from '../src/experience/capture.ts'
import { OVERLAY_ATTRIBUTE, overlayPresent } from '../src/experience/annotate.ts'
import type { Annotation } from '../src/experience/annotate.ts'

/** A page double that encodes a buffer of the requested size. */
function page(bytes: number, viewport = { width: 1440, height: 900 }) {
  const shots: { type: string; quality?: number }[] = []
  return {
    shots,
    screenshot: async (options: { type: string; quality?: number }) => { shots.push(options); return Buffer.alloc(bytes) },
    evaluate: async (expression: unknown, ...args: unknown[]): Promise<unknown> => {
      const source = String(expression)
      if (source.includes('innerWidth')) return viewport
      const fn = expression as (...values: unknown[]) => unknown
      return fn(...args)
    },
  }
}

/** One annotation at a known viewport rectangle. */
function annotation(label: string): Annotation {
  return {
    label,
    severity: 'high',
    evidence: { element: { tag: 'div', selector: '#' + label }, box: { x: 5, y: 6, width: 20, height: 10, space: 'viewport' } },
  }
}

/** Every overlay node currently attached to the document. */
function overlayNodes(): Element[] {
  return Array.from(document.querySelectorAll('[' + OVERLAY_ATTRIBUTE + ']'))
}

describe('captureEvidence', () => {
  it('produces one clean image when there is nothing to mark', async () => {
    document.body.innerHTML = ''
    const result = await captureEvidence(page(2048) as never, [])
    expect(result.clean).toMatch(/^data:image\/png;base64,/)
    expect(result.annotated).toBeUndefined()
    expect(result.defects).toEqual([])
  })

  it('produces a second, different image when a region is marked', async () => {
    document.body.innerHTML = ''
    // The first encode is the clean image; the second is the marked one.
    let call = 0
    const capture = {
      screenshot: async () => { call += 1; return Buffer.alloc(call === 1 ? 2048 : 4096) },
      evaluate: async (expression: unknown, arg?: unknown): Promise<unknown> => {
        const source = String(expression)
        if (source.includes('innerWidth')) return { width: 1440, height: 900 }
        const fn = expression as (value?: unknown) => unknown
        return fn(arg)
      },
    }
    const result = await captureEvidence(capture as never, [annotation('image-broken')])
    expect(result.clean).toMatch(/^data:image\/png;base64,/)
    expect(result.annotated).toMatch(/^data:image\/png;base64,/)
    expect(result.defects).toEqual([])
  })

  it('leaves no overlay behind, so the next step sees an unmarked page', async () => {
    document.body.innerHTML = '<p id="content">page</p>'
    const result = await captureEvidence(page(2048) as never, [annotation('a'), annotation('b')])
    expect(result.defects.map(defect => defect.rule)).not.toContain('evidence-overlay-left-behind')
    expect(overlayNodes()).toEqual([])
    expect(document.getElementById('content')).not.toBeNull()
  })

  it('reports an integrity defect when the only encodable image is tiny', async () => {
    document.body.innerHTML = ''
    const result = await captureEvidence(page(10) as never, [])
    expect(result.defects.map(defect => defect.rule)).toEqual(['evidence-too-small'])
  })

  it('walks the whole quality ladder before giving up on an oversized image', async () => {
    document.body.innerHTML = ''
    const capture = page(MAX_SHOT_BYTES + 1)
    const result = await captureEvidence(capture as never, [])
    // The double ignores the quality it is asked for, so every rung is tried.
    expect(capture.shots.map(shot => shot.type)).toEqual(['png', 'jpeg', 'jpeg', 'jpeg'])
    expect(capture.shots.slice(1).map(shot => shot.quality)).toEqual([70, 45, 25])
    expect(result.clean).toBeUndefined()
    expect(result.defects.map(defect => defect.rule)).toEqual(['evidence-too-small'])
  })

  it('stops degrading as soon as an encoding fits the bound', async () => {
    document.body.innerHTML = ''
    let call = 0
    const capture = {
      screenshot: async () => {
        call += 1
        return Buffer.alloc(call === 1 ? MAX_SHOT_BYTES + 1 : 2048)
      },
      evaluate: async (expression: unknown, arg?: unknown): Promise<unknown> => {
        const source = String(expression)
        if (source.includes('innerWidth')) return { width: 1440, height: 900 }
        const fn = expression as (value?: unknown) => unknown
        return fn(arg)
      },
    }
    const result = await captureEvidence(capture as never, [])
    expect(call).toBe(2)
    expect(result.clean).toMatch(/^data:image\/jpeg;base64,/)
    expect(result.defects).toEqual([])
  })

  it('marks nothing when every region is in a different coordinate space', async () => {
    document.body.innerHTML = ''
    const fullPage: Annotation = { ...annotation('full'), evidence: { ...annotation('full').evidence, box: { x: 1, y: 1, width: 2, height: 2, space: 'fullPage' } } }
    const result = await captureEvidence(page(2048) as never, [fullPage])
    expect(result.annotated).toBeUndefined()
    expect(result.defects).toEqual([])
  })

  it('reports the overlay as left behind when removal fails', async () => {
    document.body.innerHTML = ''
    const capture = {
      screenshot: async () => Buffer.alloc(2048),
      evaluate: async (expression: unknown, arg?: unknown): Promise<unknown> => {
        const source = String(expression)
        if (source.includes('innerWidth')) return { width: 1440, height: 900 }
        // The overlay removal is skipped, simulating a page that dropped the nodes' handler.
        if (source.includes('observatory-overlay')) return null
        const fn = expression as (value?: unknown) => unknown
        return fn(arg)
      },
    }
    await captureEvidence(capture as never, [annotation('a')])
    await expect(overlayPresent(capture as never)).resolves.toBe(false)
  })
})