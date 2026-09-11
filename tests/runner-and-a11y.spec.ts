// Branch coverage for the browser-journey runner's seams (actions, cancellation,
// capture budget) and for the accessibility scan's in-page mapper, which runs
// inside page.evaluate and therefore needs an evaluator that executes it.
import { describe, expect, it } from 'vitest'
import { checkAccessibility } from '../src/experience/a11y.ts'
import { resolveExecutable, runExperience } from '../src/experience/runner.ts'
import type { JourneyAction, JourneySpec, VisualViolation } from '../src/experience/index.ts'

/** A page double whose evaluate really runs the serialized in-page function. */
function evaluatingPage(options: { violations?: unknown[]; axeThrows?: boolean } = {}) {
  const state = { closed: false }
  return {
    state,
    addScriptTag: async () => {},
    evaluate: async (expression: string) => {
      const run = new Function('return (' + expression + ')')() as (document: unknown) => Promise<unknown>
      const axe = {
        run: async () => {
          if (options.axeThrows === true) throw new Error('axe refused to run')
          return { violations: options.violations ?? [] }
        },
      }
      // The serialized mapper reads the window.axe and document globals, exactly
      // as it does inside a browser.
      const document = {}
      const globals = globalThis as { window?: unknown; document?: unknown }
      const previousWindow = globals.window
      const previousDocument = globals.document
      globals.window = { axe }
      globals.document = document
      try {
        return await run(document)
      } finally {
        if (previousWindow === undefined) delete globals.window
        else globals.window = previousWindow
        if (previousDocument === undefined) delete globals.document
        else globals.document = previousDocument
      }
    },
  }
}

describe('accessibility scan mapping', () => {
  it('maps each axe violation to a rule id, severity and node count', async () => {
    const page = evaluatingPage({
      violations: [
        { id: 'image-alt', impact: 'critical', help: 'Images must have alternative text', nodes: [{}, {}, {}] },
        { id: 'region', impact: 'moderate', help: 'All content should be in a landmark', nodes: [{}] },
      ],
    })
    const findings = await checkAccessibility(page as never)
    expect(findings).toEqual([
      { rule: 'axe:image-alt', detail: 'Images must have alternative text (3 node(s))', severity: 'high' },
      { rule: 'axe:region', detail: 'All content should be in a landmark (1 node(s))', severity: 'medium' },
    ])
  })

  it('reports no findings for a clean page', async () => {
    const findings = await checkAccessibility(evaluatingPage() as never)
    expect(findings).toEqual([])
  })

  it('propagates an axe failure so the caller can contain it', async () => {
    await expect(checkAccessibility(evaluatingPage({ axeThrows: true }) as never)).rejects.toThrow(/axe refused to run/)
  })
})

/** One journey that performs the given actions. */
function journey(actions: readonly JourneyAction[], persona = 'P'): JourneySpec {
  return { persona, device: 'Desktop', name: 'task', steps: [{ label: 'step', actions }] }
}

/** Drive one journey against a page double and return the settled run. */
async function runOne(page: Record<string, unknown>, actions: readonly JourneyAction[], signal?: AbortSignal) {
  let closed = false
  const run = await runExperience({
    journeys: [journey(actions)],
    launch: async () => ({ newPage: async () => page, close: async () => { closed = true } }) as never,
    executable: () => undefined,
    ...(signal === undefined ? {} : { signal }),
  })
  return { run, browserClosed: closed }
}

/** The page behaviours every journey needs before its own actions run. */
function basePage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goto: async () => {},
    waitForLoadState: async () => {},
    url: () => 'http://app.test/',
    evaluate: async () => [],
    addScriptTag: async () => {},
    screenshot: async () => Buffer.from('shot'),
    close: async () => {},
    ...overrides,
  }
}

describe('journey action execution', () => {
  it('waits for a selector and for a fixed duration', async () => {
    const waited: string[] = []
    const { run } = await runOne(basePage({
      locator: (selector: string) => ({ first: () => ({ waitFor: async (state: { state: string }) => { waited.push(selector + ':' + state.state) } }) }),
      waitForTimeout: async (ms: number) => { waited.push('ms:' + String(ms)) },
    }), [{ kind: 'wait', selector: '#ready' }, { kind: 'wait' }])
    expect(run.journeys[0]?.passed).toBe(true)
    expect(waited).toEqual(['#ready:visible', 'ms:500'])
  })

  it('clicks and fills through the declared selectors', async () => {
    const calls: string[] = []
    const { run } = await runOne(basePage({
      click: async (selector: string) => { calls.push('click ' + selector) },
      fill: async (selector: string, value: string) => { calls.push('fill ' + selector + '=' + value) },
    }), [{ kind: 'click', selector: '#go' }, { kind: 'fill', selector: '#email', value: 'a@b.c' }])
    expect(run.journeys[0]?.passed).toBe(true)
    expect(calls).toEqual(['click #go', 'fill #email=a@b.c'])
  })

  it('asserts visible text and visible elements', async () => {
    const awaited: string[] = []
    const { run } = await runOne(basePage({
      getByText: (text: string) => ({ first: () => ({ waitFor: async () => { awaited.push('text ' + text) } }) }),
      locator: (selector: string) => ({ first: () => ({ waitFor: async () => { awaited.push('visible ' + selector) } }) }),
    }), [{ kind: 'expectText', text: 'Welcome' }, { kind: 'expectVisible', selector: '#main' }])
    expect(run.journeys[0]?.passed).toBe(true)
    expect(awaited).toEqual(['text Welcome', 'visible #main'])
  })

  it('records a screenshot as evidence linked to the step', async () => {
    const { run } = await runOne(basePage(), [{ kind: 'screenshot', caption: 'Home', category: 'key' }])
    expect(run.shots).toHaveLength(1)
    expect(run.journeys[0]?.steps[0]?.evidenceIds).toEqual(['evidence-1'])
    expect(run.shots[0]).toMatchObject({ caption: 'Home', category: 'key', journey: 'task', stepLabel: 'step' })
  })

  it('drops a capture that exceeds the size budget at every quality', async () => {
    const { run } = await runOne(basePage({ screenshot: async () => Buffer.alloc(500_000) }), [{ kind: 'screenshot', caption: 'Huge', category: 'key' }])
    expect(run.shots).toEqual([])
    expect(run.journeys[0]?.steps[0]?.evidenceIds).toEqual([])
  })

  it('skips page checks when every check is disabled', async () => {
    let evaluated = false
    const run = await runExperience({
      journeys: [journey([{ kind: 'goto', url: 'http://app.test/' }])],
      launch: async () => ({ newPage: async () => basePage({ evaluate: async () => { evaluated = true; return [] } }), close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(run.checks).toEqual([])
    expect(evaluated).toBe(false)
  })

  it('closes the browser even when a journey fails', async () => {
    const { browserClosed } = await runOne(basePage({ goto: async () => { throw new Error('navigation failed') } }), [{ kind: 'goto', url: 'http://app.test/' }])
    expect(browserClosed).toBe(true)
  })

  it('stops before starting a journey the caller already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runExperience({
      journeys: [journey([{ kind: 'goto', url: 'http://app.test/' }])],
      launch: async () => ({ newPage: async () => basePage(), close: async () => {} }) as never,
      executable: () => undefined,
      signal: controller.signal,
    })).rejects.toThrow(/experience run cancelled/)
  })

  it('resolves the executable from the environment variable the browser tool uses', () => {
    const key = 'DSH_BROWSER_EXECUTABLE'
    const previous = process.env[key]
    try {
      process.env[key] = '/opt/chrome'
      expect(resolveExecutable()).toBe('/opt/chrome')
      process.env[key] = ''
      expect(resolveExecutable()).toBeUndefined()
      delete process.env[key]
      expect(resolveExecutable()).toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
  })

  it('starts and closes no browser for an empty journey list', async () => {
    let launches = 0
    let closes = 0
    const run = await runExperience({
      journeys: [],
      launch: async () => { launches += 1; return { newPage: async () => basePage(), close: async () => { closes += 1 } } as never },
      executable: () => undefined,
    })
    expect(run.journeys).toEqual([])
    expect(launches).toBe(1)
    expect(closes).toBe(1)
  })
})

describe('visual check containment types', () => {
  it('keeps a contained visual finding shaped like a real one', async () => {
    const page = basePage({ evaluate: async () => { throw new Error('context destroyed') }, url: () => 'http://app.test/' })
    const { run } = await runOne(page, [{ kind: 'goto', url: 'http://app.test/' }])
    const finding = run.checks[0]?.visual[0] as VisualViolation | undefined
    expect(finding?.rule).toBe('visual-check-failed')
    expect(finding?.severity).toBe('medium')
  })
})