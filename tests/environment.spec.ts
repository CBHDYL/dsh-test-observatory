// Environment emulation: that a persona's conditions are actually sent to the
// browser with the parameters it expects, and that they are lifted again so one
// slow persona cannot condition another's journey.
import { describe, expect, it } from 'vitest'
import { NETWORK_PROFILES, applyEnvironment } from '../src/experience/behavior/environment.ts'
import type { Page } from 'playwright-core'

/** A page double recording every DevTools command it receives. */
function fakePage() {
  const sent: { method: string; params?: Record<string, unknown> }[] = []
  const page = {
    sent,
    context: () => ({
      newCDPSession: async () => ({
        send: async (method: string, params?: Record<string, unknown>) => { sent.push({ method, ...(params === undefined ? {} : { params }) }) },
      }),
    }),
  }
  return page
}

/** The parameters sent for one method, or undefined when it was not sent. */
function paramsOf(sent: { method: string; params?: Record<string, unknown> }[], method: string): Record<string, unknown> | undefined {
  return sent.find(entry => entry.method === method)?.params
}

describe('applyEnvironment', () => {
  it('does nothing when the policy declares no conditions', async () => {
    const page = fakePage()
    const applied = await applyEnvironment(page as unknown as Page, {})
    expect(applied.applied).toEqual([])
    expect(page.sent).toEqual([])
    await expect(applied.restore()).resolves.toBeUndefined()
  })

  it('sends the network profile the browser expects', async () => {
    const page = fakePage()
    const applied = await applyEnvironment(page as unknown as Page, { network: 'slow3g' })
    expect(applied.applied).toEqual(['slow3g'])
    const params = paramsOf(page.sent, 'Network.emulateNetworkConditions')
    expect(params).toMatchObject({
      offline: false,
      downloadThroughput: NETWORK_PROFILES.slow3g.downloadBytesPerSecond,
      uploadThroughput: NETWORK_PROFILES.slow3g.uploadBytesPerSecond,
      latency: 400,
    })
  })

  it('enables the network domain before emulating it', async () => {
    const page = fakePage()
    await applyEnvironment(page as unknown as Page, { network: 'slow3g' })
    expect(page.sent[0]?.method).toBe('Network.enable')
    expect(page.sent[1]?.method).toBe('Network.emulateNetworkConditions')
  })

  it('emulates an offline profile as offline', async () => {
    const page = fakePage()
    await applyEnvironment(page as unknown as Page, { network: 'offline' })
    expect(paramsOf(page.sent, 'Network.emulateNetworkConditions')).toMatchObject({ offline: true, latency: 0 })
  })

  it('applies a CPU rate after the network profile', async () => {
    const page = fakePage()
    const applied = await applyEnvironment(page as unknown as Page, { network: 'slow3g', cpuThrottle: 4 })
    expect(applied.applied).toEqual(['slow3g', 'cpu×4'])
    expect(paramsOf(page.sent, 'Emulation.setCPUThrottlingRate')).toEqual({ rate: 4 })
    expect(page.sent.at(-1)?.method).toBe('Emulation.setCPUThrottlingRate')
  })

  it('applies CPU throttling on its own when no profile is declared', async () => {
    const page = fakePage()
    const applied = await applyEnvironment(page as unknown as Page, { cpuThrottle: 6 })
    expect(applied.applied).toEqual(['cpu×6'])
    expect(page.sent.map(entry => entry.method)).toEqual(['Emulation.setCPUThrottlingRate'])
  })

  it('lifts every condition it applied', async () => {
    const page = fakePage()
    const applied = await applyEnvironment(page as unknown as Page, { network: 'fast3g', cpuThrottle: 3 })
    await applied.restore()
    const cpu = page.sent.filter(entry => entry.method === 'Emulation.setCPUThrottlingRate')
    expect(cpu.at(-1)?.params).toEqual({ rate: 1 })
    const network = page.sent.filter(entry => entry.method === 'Network.emulateNetworkConditions')
    expect(network.at(-1)?.params).toMatchObject({ offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 })
  })

  it('lifts only what it applied', async () => {
    const page = fakePage()
    const applied = await applyEnvironment(page as unknown as Page, { cpuThrottle: 2 })
    await applied.restore()
    expect(page.sent.some(entry => entry.method === 'Network.emulateNetworkConditions')).toBe(false)
  })

  it('expresses every named profile as bytes per second', () => {
    for (const [name, profile] of Object.entries(NETWORK_PROFILES)) {
      if (name === 'offline') continue
      // The browser takes bytes; a kilobit value here would emulate a network
      // eight times slower than the name promises.
      expect(profile.downloadBytesPerSecond).toBeGreaterThan(0)
      expect(profile.downloadBytesPerSecond).toBeLessThan(1_000_000)
    }
  })
})
