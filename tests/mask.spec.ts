// @vitest-environment jsdom
// Dynamic-content masking: which selectors matched, the warning an unmatched
// selector produces, and the guarantee that restoring is exact.
import { describe, expect, it } from 'vitest'
import { maskDynamic } from '../src/experience/mask.ts'

/** A page double that runs the mask's in-page functions against jsdom. */
function fakePage() {
  return {
    evaluate: async (expression: unknown, ...args: unknown[]): Promise<unknown> => {
      const fn = expression as (...values: unknown[]) => unknown
      return fn(...args)
    },
  }
}

describe('maskDynamic', () => {
  it('hides every matched element and records which selectors matched', async () => {
    document.body.innerHTML = '<span class="clock">12:00</span><span class="avatar">A</span>'
    const handle = await maskDynamic(fakePage() as never, ['.clock', '.avatar'])
    expect(handle.matched).toEqual(['.clock', '.avatar'])
    expect(handle.unmatched).toEqual([])
    const clock = document.querySelector('.clock') as HTMLElement
    expect(clock.style.visibility).toBe('hidden')
  })

  it('reports a selector that matched nothing instead of failing silently', async () => {
    document.body.innerHTML = '<span class="clock">12:00</span>'
    const handle = await maskDynamic(fakePage() as never, ['.clock', '.does-not-exist'])
    expect(handle.matched).toEqual(['.clock'])
    expect(handle.unmatched).toEqual(['.does-not-exist'])
  })

  it('restores the previous inline visibility rather than clearing it', async () => {
    document.body.innerHTML = '<span class="clock" style="visibility:collapse">12:00</span>'
    const handle = await maskDynamic(fakePage() as never, ['.clock'])
    await handle.restore()
    const clock = document.querySelector('.clock') as HTMLElement
    expect(clock.style.visibility).toBe('collapse')
    expect(clock.hasAttribute('data-observatory-mask-was')).toBe(false)
  })

  it('restores an element that had no inline visibility at all', async () => {
    document.body.innerHTML = '<span class="clock">12:00</span>'
    const handle = await maskDynamic(fakePage() as never, ['.clock'])
    await handle.restore()
    expect((document.querySelector('.clock') as HTMLElement).style.visibility).toBe('')
  })

  it('does nothing for an empty selector list', async () => {
    document.body.innerHTML = '<span class="clock">12:00</span>'
    const handle = await maskDynamic(fakePage() as never, [])
    expect(handle.matched).toEqual([])
    expect(handle.unmatched).toEqual([])
    await expect(handle.restore()).resolves.toBeUndefined()
  })

  it('is safe to restore twice', async () => {
    document.body.innerHTML = '<span class="clock">12:00</span>'
    const handle = await maskDynamic(fakePage() as never, ['.clock'])
    await handle.restore()
    await expect(handle.restore()).resolves.toBeUndefined()
    expect((document.querySelector('.clock') as HTMLElement).style.visibility).toBe('')
  })
})
