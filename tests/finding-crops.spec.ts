// Coverage for finding-level crops. A whole-page screenshot of a finding says
// only that something is wrong somewhere; the crop is the finding's own
// evidence, and these cases pin the box it is taken from.
import { describe, expect, it } from 'vitest'
import { MAX_FINDING_CROPS, MIN_CROP_PX, captureFindingCrops } from '../src/experience/capture.ts'
import type { ElementBox, ElementEvidence } from '../src/experience/geometry.ts'

/** One measured element. */
function evidence(x: number, y: number, width: number, height: number, space: 'viewport' | 'fullPage' = 'viewport'): ElementEvidence {
  const box: ElementBox = { x, y, width, height, space }
  return { element: { tag: 'div', selector: '#target' }, box }
}

/** A page stub that records the clip rectangle it was asked for. */
function page(viewport = { width: 1440, height: 900 }) {
  const clips: { x: number; y: number; width: number; height: number }[] = []
  return {
    clips,
    viewportSize: () => viewport,
    screenshot: async (options: { clip?: { x: number; y: number; width: number; height: number } }) => {
      if (options.clip) clips.push(options.clip)
      return Buffer.from('x'.repeat(2048))
    },
  }
}

describe('finding crops', () => {
  it('covers every measured element with padding', async () => {
    const stub = page()
    await captureFindingCrops(stub as never, [{ evidence: [evidence(100, 200, 50, 40), evidence(300, 260, 60, 20)] }])
    expect(stub.clips).toHaveLength(1)
    // 100-24 .. 360+24 and 200-24 .. 280+24
    expect(stub.clips[0]).toEqual({ x: 76, y: 176, width: 308, height: 128 })
  })

  it('keeps a padded control that is shorter than the floor on its own', async () => {
    const stub = page()
    await captureFindingCrops(stub as never, [{ evidence: [evidence(1167, 97, 122, 22)] }])
    expect(stub.clips).toEqual([{ x: 1143, y: 73, width: 170, height: 70 }])
    expect(stub.clips[0]!.height).toBeGreaterThan(MIN_CROP_PX / 2)
  })

  it('ignores a full-page box, which shares no origin with the clip', async () => {
    const stub = page()
    await captureFindingCrops(stub as never, [{ evidence: [evidence(10, 20, 30, 40), evidence(0, 5000, 1440, 900, 'fullPage')] }])
    expect(stub.clips).toHaveLength(1)
    expect(stub.clips[0]!.y).toBeLessThan(200)
  })

  it('skips a finding with no measured element', async () => {
    const stub = page()
    const crops = await captureFindingCrops(stub as never, [{ evidence: [] }, {}])
    expect(crops).toEqual([undefined, undefined])
    expect(stub.clips).toEqual([])
  })

  it('stops illustrating after the cap, so one scan cannot bloat the report', async () => {
    const stub = page()
    const many = Array.from({ length: MAX_FINDING_CROPS + 3 }, () => ({ evidence: [evidence(10, 10, 200, 100)] }))
    const crops = await captureFindingCrops(stub as never, many)
    expect(crops.filter(entry => entry !== undefined)).toHaveLength(MAX_FINDING_CROPS)
    expect(stub.clips).toHaveLength(MAX_FINDING_CROPS)
  })

  it('reports no crop rather than failing when the page cannot be captured', async () => {
    const failing = { viewportSize: () => ({ width: 800, height: 600 }), screenshot: async () => { throw new Error('detached') } }
    const crops = await captureFindingCrops(failing as never, [{ evidence: [evidence(10, 10, 200, 100)] }])
    expect(crops).toEqual([undefined])
  })
})
