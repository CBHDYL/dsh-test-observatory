/**
 * Applying a persona's network and CPU conditions to a page.
 *
 * Both are applied through the browser's own emulation, so the page experiences
 * them the way it would on a real device: requests take longer, and script runs
 * with less CPU. That matters because the findings these conditions produce —
 * a missing loading indicator, an action that never becomes available — only
 * exist when something is actually slow.
 *
 * Conditions are applied per page and removed with it, so one slow persona never
 * degrades another's journey.
 * @module @deepseek-ai/dsh-experience-runner/behavior/environment
 */
import type { Page } from 'playwright-core'
import type { EnvironmentPolicy } from './types.ts'

/** Transfer parameters of one emulated network profile. */
interface NetworkProfile {
  /** Download rate in bytes per second. */
  readonly downloadBytesPerSecond: number
  /** Upload rate in bytes per second. */
  readonly uploadBytesPerSecond: number
  /** Round-trip latency in milliseconds. */
  readonly latencyMs: number
}

/**
 * The emulated profiles, expressed the way the browser's own emulation wants
 * them: bytes per second, not the kilobits per second the names suggest.
 */
export const NETWORK_PROFILES: Readonly<Record<NonNullable<EnvironmentPolicy['network']>, NetworkProfile>> = {
  offline: { downloadBytesPerSecond: 0, uploadBytesPerSecond: 0, latencyMs: 0 },
  slow3g: { downloadBytesPerSecond: 400 * 1024 / 8, uploadBytesPerSecond: 400 * 1024 / 8, latencyMs: 400 },
  fast3g: { downloadBytesPerSecond: 1_600 * 1024 / 8, uploadBytesPerSecond: 750 * 1024 / 8, latencyMs: 150 },
  slow4g: { downloadBytesPerSecond: 4_000 * 1024 / 8, uploadBytesPerSecond: 3_000 * 1024 / 8, latencyMs: 100 },
}

/** One applied condition, and the handle that removes it. */
export interface AppliedEnvironment {
  /** Profiles and multipliers actually applied, for the report. */
  readonly applied: readonly string[]
  /** Remove every applied condition. */
  readonly restore: () => Promise<void>
}

/** The slice of the Chrome DevTools session this module drives. */
interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
}
/** The slice of a page needed to open a DevTools session. */
interface CdpPage {
  context(): { newCDPSession(page: unknown): Promise<CdpSession> }
}

/**
 * Apply a persona's environment to one page.
 *
 * CPU throttling is applied after the network profile so a page that is both slow
 * and CPU-bound is measured under both, and both are lifted together.
 * @param page - the page to condition.
 * @param environment - the policy to apply.
 * @returns what was applied and how to remove it.
 */
export async function applyEnvironment(page: Page, environment: EnvironmentPolicy): Promise<AppliedEnvironment> {
  const profileName = environment.network
  const cpuThrottle = environment.cpuThrottle
  if (profileName === undefined && cpuThrottle === undefined) {
    return { applied: [], restore: async () => undefined }
  }
  const cdp = await (page as unknown as CdpPage).context().newCDPSession(page)
  const applied: string[] = []
  if (profileName !== undefined) {
    const profile = NETWORK_PROFILES[profileName]
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: profileName === 'offline',
      downloadThroughput: profile.downloadBytesPerSecond,
      uploadThroughput: profile.uploadBytesPerSecond,
      latency: profile.latencyMs,
    })
    applied.push(profileName)
  }
  if (cpuThrottle !== undefined) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
    applied.push('cpu×' + String(cpuThrottle))
  }
  return {
    applied,
    async restore(): Promise<void> {
      if (cpuThrottle !== undefined) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      if (profileName !== undefined) {
        await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 })
      }
    },
  }
}
