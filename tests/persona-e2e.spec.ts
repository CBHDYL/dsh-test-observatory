// Personas end to end against the fixture app.
//
// This is the evidence the person simulation rests on: four personas drive one
// real Chromium over real HTTP, each under its own resolved policy, and the run
// records which policy and which conditions each one actually used. A persona
// that resolves to the same policy as another, or that reports the same findings,
// is not a distinct model of a user — so the assertions compare them to each
// other rather than only checking each one in isolation.
import { spawnSync } from 'node:child_process'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { runExperience } from '../src/experience/runner.ts'
import type { ExperienceRun } from '../src/experience/types.ts'
import { startFixtureApp } from './fixtures/defective-app.ts'
import type { FixtureApp } from './fixtures/defective-app.ts'

/** A Chromium the run can drive, or undefined when this host has none. */
function resolveChromium(): string | undefined {
  const configured = process.env['DSH_BROWSER_EXECUTABLE']
  if (configured !== undefined && configured.length > 0) return configured
  const home = process.env['HOME']
  if (home === undefined) return undefined
  const found = spawnSync('bash', ['-c', 'ls -d ' + home + '/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/*.app/Contents/MacOS/* 2>/dev/null | head -1'], { encoding: 'utf8' })
  const path = found.stdout.trim()
  return path.length > 0 ? path : undefined
}

const executable = resolveChromium()

describe.skipIf(executable === undefined)('personas against the fixture app', () => {
  let app: FixtureApp
  let browser: Browser
  let run: ExperienceRun

  beforeAll(async () => {
    app = await startFixtureApp()
    browser = await chromium.launch({ headless: true, ...(executable === undefined ? {} : { executablePath: executable }) })
    run = await runExperience({
      launch: async () => browser,
      executable: () => executable,
      journeys: [
        { persona: 'Neutral', device: 'Desktop', name: 'clean', behavior: 'neutral', steps: [{ label: 'open', actions: [{ kind: 'goto', url: app.origin + '/clean' }] }] },
        { persona: 'Keyboard', device: 'Desktop', name: 'focus', behavior: 'keyboard', steps: [{ label: 'open', actions: [{ kind: 'goto', url: app.origin + '/no-focus-indicator' }] }] },
        { persona: 'Mobile', device: 'Phone', name: 'slow', behavior: 'mobile', viewport: { width: 390, height: 844 }, steps: [{ label: 'open', actions: [{ kind: 'goto', url: app.origin + '/broken-image' }] }] },
        { persona: 'Impatient', device: 'Desktop', name: 'fast', behavior: 'impatient', steps: [{ label: 'open', actions: [{ kind: 'goto', url: app.origin + '/image-without-alt' }] }] },
      ],
      accessibilityChecks: false,
    })
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await app?.close()
  })

  /** The journey one persona produced. */
  const journeyOf = (persona: string) => run.journeys.find(journey => journey.persona === persona)
  /** Every rule reported against one persona. */
  const rulesOf = (persona: string): readonly string[] => {
    const checks = run.checks.find(entry => entry.persona === persona)
    return [...(checks?.visual ?? []), ...(checks?.keyboard ?? []), ...(checks?.accessibility ?? [])].map(finding => finding.rule)
  }

  it('resolves a distinct policy for every persona', () => {
    const ids = run.journeys.map(journey => journey.behavior.id)
    expect(ids).toEqual(['neutral', 'keyboard', 'mobile', 'impatient'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('records what each policy changes', () => {
    expect(journeyOf('Neutral')?.behaviorDimensions).toEqual([])
    expect(journeyOf('Keyboard')?.behaviorDimensions).toContain('keyboard-only')
    expect(journeyOf('Mobile')?.behaviorDimensions).toContain('slow3g')
    expect(journeyOf('Impatient')?.behaviorDimensions).toContain('double-submit')
  })

  it('emulates conditions only for the persona that declares them', () => {
    expect(journeyOf('Mobile')?.appliedEnvironment).toEqual(['slow3g', 'cpu×4'])
    expect(journeyOf('Neutral')?.appliedEnvironment).toBeUndefined()
    expect(journeyOf('Keyboard')?.appliedEnvironment).toBeUndefined()
  })

  it('finds nothing for the neutral persona on a clean page', () => {
    expect(rulesOf('Neutral')).toEqual([])
  })

  it('finds the focus barrier only for the keyboard persona', () => {
    expect(rulesOf('Keyboard')).toContain('keyboard-focus-not-visible')
    for (const persona of ['Neutral', 'Mobile', 'Impatient']) expect(rulesOf(persona)).not.toContain('keyboard-focus-not-visible')
  })

  it('gives each persona a different set of findings', () => {
    // Identical findings across personas would mean the persona labels add a
    // name to one behaviour rather than describing several.
    const sets = run.journeys.map(journey => rulesOf(journey.persona).join(','))
    expect(new Set(sets).size).toBeGreaterThan(1)
  })

  it('completes every journey', () => {
    for (const journey of run.journeys) expect(journey.passed).toBe(true)
  })
})
