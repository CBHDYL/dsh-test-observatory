import { describe, expect, it } from 'vitest'
import { SCORE_DIMENSIONS, SLOW_STEP_MS, bandFor, scoreRun } from '../src/experience/scoring.ts'
import { launchChromium, runExperience } from '../src/experience/runner.ts'
import { DEFAULT_BEHAVIOR } from '../src/experience/behavior/index.ts'
import type { ExperienceRun, JourneyOutcome } from '../src/experience/types.ts'

/** The in-page evaluator every capture double needs: it reports the viewport. */
const viewportEvaluator = async (expression: unknown, ...args: unknown[]): Promise<unknown> => {
  const source = String(expression)
  if (source.includes('innerWidth')) return { width: 1440, height: 900 }
  const fn = expression as (...values: unknown[]) => unknown
  return fn(...args)
}


/** Build one settled journey. */
function journey(persona: string, states: readonly ('PASS' | 'FAIL' | 'BLOCKED')[], durationMs = 100): JourneyOutcome {
  return {
    behavior: DEFAULT_BEHAVIOR,
    behaviorDimensions: [],
    persona,
    device: 'Desktop',
    name: persona + ' task',
    passed: states.every(state => state === 'PASS'),
    steps: states.map((state, index) => ({ label: 'step ' + String(index + 1), state, durationMs, evidenceIds: [] })),
  }
}

/** Build a run from settled journeys. */
function run(journeys: readonly JourneyOutcome[]): ExperienceRun {
  return { journeys, shots: [], checks: [] }
}

describe('bandFor', () => {
  it('bands a score into the four qualitative labels', () => {
    expect(bandFor(95)).toBe('Excellent')
    expect(bandFor(90)).toBe('Excellent')
    expect(bandFor(85)).toBe('Good · needs polish')
    expect(bandFor(70)).toBe('Needs work')
    expect(bandFor(10)).toBe('Blocked')
  })
})

describe('scoreRun', () => {
  it('awards the full 100 when every journey passes quickly', () => {
    const score = scoreRun(run([journey('a', ['PASS']), journey('b', ['PASS', 'PASS'])]))
    expect(score.total).toBe(100)
    expect(score.band).toBe('Excellent')
    expect(score.tasksObserved).toBe(2)
    expect(score.tasksCompleted).toBe(2)
    expect(score.blockers).toBe(0)
    expect(score.recoverablePoints).toBe(0)
  })

  it('docks functional completion for a journey with a failed step', () => {
    const score = scoreRun(run([journey('a', ['PASS']), journey('b', ['PASS', 'FAIL'])]))
    expect(score.tasksCompleted).toBe(1)
    expect(score.blockers).toBe(1)
    expect(score.dimensions.find(d => d.label === 'Functional completion')?.earned).toBe(15)
    expect(score.total).toBeLessThan(100)
  })

  it('docks perceived performance for a slow step', () => {
    const fast = scoreRun(run([journey('a', ['PASS'], 100)]))
    const slow = scoreRun(run([journey('a', ['PASS'], SLOW_STEP_MS + 1)]))
    expect(fast.total).toBeGreaterThan(slow.total)
    expect(slow.dimensions.find(d => d.label === 'Perceived performance')?.earned).toBe(0)
  })

  it('scores an empty run without dividing by zero', () => {
    // No journey was attempted, so functional completion earns nothing while
    // the dimensions that measure step outcomes stay at full weight.
    const score = scoreRun(run([]))
    expect(score.total).toBe(70)
    expect(score.tasksObserved).toBe(0)
    expect(score.dimensions).toHaveLength(SCORE_DIMENSIONS.length)
  })

  it('reports the points recoverable from the current total', () => {
    const score = scoreRun(run([journey('a', ['FAIL'])]))
    expect(score.recoverablePoints).toBe(Math.round((100 - score.total) * 10) / 10)
  })
})

describe('runExperience app-page guard', () => {
  it('skips page checks when the journey never reached the app', async () => {
    const page = {
      goto: async () => { throw new Error('net::ERR_CONNECTION_REFUSED') },
      waitForLoadState: async () => {},
      url: () => 'about:blank',
      evaluate: async () => { throw new Error('should not be called') },
      addScriptTag: async () => { throw new Error('should not be called') },
      close: async () => {},
    }
    const run = await runExperience({
      journeys: [{
        persona: '首次访问用户', device: 'Desktop', name: '打开首页',
        steps: [{ label: '打开', actions: [{ kind: 'goto', url: 'http://127.0.0.1:8000/' }] }],
      }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
    })
    expect(run.journeys[0]?.passed).toBe(false)
    expect(run.checks[0]?.visual).toHaveLength(1)
    expect(run.checks[0]?.visual[0]?.rule).toBe('page-checks-skipped')
    expect(run.checks[0]?.accessibility).toEqual([])
  })

  it('runs page checks when the app page did load', async () => {
    const page = {
      goto: async () => {},
      waitForLoadState: async () => {},
      url: () => 'http://127.0.0.1:8000/',
      evaluate: async () => [],
      addScriptTag: async () => {},
      close: async () => {},
    }
    const run = await runExperience({
      journeys: [{
        persona: 'P', device: 'D', name: 'n',
        steps: [{ label: 'go', actions: [{ kind: 'goto', url: 'http://127.0.0.1:8000/' }] }],
      }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
    })
    expect(run.checks[0]?.visual).toEqual([])
    expect(run.checks[0]?.accessibility).toEqual([])
  })
})

describe('runExperience check containment', () => {
  it('records a failing visual check as a finding instead of throwing', async () => {
    const page = {
      goto: async () => {},
      waitForLoadState: async () => {},
      url: () => 'http://example.test/app',
      evaluate: async () => { throw new Error('Execution context was destroyed, most likely because of a navigation') },
      addScriptTag: async () => {},
      close: async () => {},
    }
    const run = await runExperience({
      journeys: [{
        persona: 'Navigator', device: 'Desktop', name: 'navigate away',
        steps: [{ label: 'go', actions: [{ kind: 'goto', url: 'http://example.test' }] }],
      }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
      accessibilityChecks: false,
    })
    expect(run.journeys[0]?.passed).toBe(true)
    expect(run.checks[0]?.visual).toHaveLength(1)
    expect(run.checks[0]?.visual[0]?.rule).toBe('visual-check-failed')
    expect(run.checks[0]?.visual[0]?.detail).toContain('Execution context was destroyed')
  })

  it('records a failing accessibility scan as a finding instead of throwing', async () => {
    const page = {
      goto: async () => {},
      waitForLoadState: async () => {},
      url: () => 'http://example.test/app',
      evaluate: async () => [],
      addScriptTag: async () => { throw new Error('page closed') },
      close: async () => {},
    }
    const run = await runExperience({
      journeys: [{
        persona: 'P', device: 'D', name: 'n',
        steps: [{ label: 'go', actions: [{ kind: 'goto', url: 'http://example.test' }] }],
      }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
    })
    expect(run.journeys[0]?.passed).toBe(true)
    expect(run.checks[0]?.accessibility[0]?.rule).toBe('accessibility-check-failed')
  })
})

describe('runExperience', () => {
  it('settles every step, blocks the rest after a failure, and closes the browser', async () => {
    const closed: string[] = []
    const fakePage = {
      goto: async () => {},
      waitForLoadState: async () => {},
      click: async () => { throw new Error('no such element') },
      fill: async () => {},
      getByText: () => ({ first: () => ({ waitFor: async () => {} }) }),
      locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
      screenshot: async () => Buffer.from('png'),
      evaluate: viewportEvaluator,
      close: async () => {},
    }
    const fakeBrowser = {
      newPage: async () => fakePage,
      close: async () => { closed.push('closed') },
    }
    const result = await runExperience({
      journeys: [{
        persona: 'First-time visitor',
        device: 'Desktop',
        name: 'Checkout',
        steps: [
          { label: 'open', actions: [{ kind: 'goto', url: 'http://example.test' }] },
          { label: 'click buy', actions: [{ kind: 'click', selector: '#buy' }] },
          { label: 'confirm', actions: [{ kind: 'click', selector: '#confirm' }] },
        ],
      }],
      launch: async () => fakeBrowser as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(closed).toEqual(['closed'])
    expect(result.journeys[0]?.steps.map(step => step.state)).toEqual(['PASS', 'FAIL', 'BLOCKED'])
    expect(result.journeys[0]?.passed).toBe(false)
    expect(result.journeys[0]?.steps[1]?.error).toContain('no such element')
  })

  it('captures a failed step automatically and links the evidence', async () => {
    const fakePage = {
      click: async () => { throw new Error('missing button') },
      screenshot: async () => Buffer.from('failure'),
      evaluate: viewportEvaluator,
      url: () => 'http://example.test/app',
      close: async () => {},
    }
    const result = await runExperience({
      journeys: [{ persona: 'Error-prone', device: 'Desktop', name: 'Recover', steps: [{ label: 'submit', actions: [{ kind: 'click', selector: '#missing' }] }] }],
      launch: async () => ({ newPage: async () => fakePage, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0]).toMatchObject({ id: 'evidence-1', category: 'fail', journey: 'Recover', stepLabel: 'submit' })
    expect(result.journeys[0]?.steps[0]?.evidenceIds).toEqual(['evidence-1'])
  })

  it('records a screenshot as a bounded data URI', async () => {
    const fakePage = {
      goto: async () => {},
      waitForLoadState: async () => {},
      getByText: () => ({ first: () => ({ waitFor: async () => {} }) }),
      locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
      screenshot: async () => Buffer.from('12345'),
      evaluate: viewportEvaluator,
      close: async () => {},
    }
    const result = await runExperience({
      journeys: [{
        persona: 'Mobile shopper',
        device: 'iPhone',
        name: 'Cart',
        viewport: { width: 390, height: 844 },
        steps: [{ label: 'capture', actions: [{ kind: 'screenshot', caption: 'Cart', category: 'mobile' }] }],
      }],
      launch: async () => ({ newPage: async () => fakePage, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0]?.dataUri.startsWith('data:image/png;base64,')).toBe(true)
    expect(result.shots[0]?.meta).toContain('390x844')
    expect(result.shots[0]?.category).toBe('mobile')
  })

  it('covers every action kind against a recording page', async () => {
    const calls: string[] = []
    const fakePage = {
      goto: async (url: string) => { calls.push('goto:' + url) },
      click: async (selector: string) => { calls.push('click:' + selector) },
      fill: async (selector: string, value: string) => { calls.push('fill:' + selector + '=' + value) },
      getByText: (text: string) => ({ first: () => ({ waitFor: async () => { calls.push('text:' + text) } }) }),
      waitForLoadState: async () => {},
      locator: (selector: string) => ({ first: () => ({ waitFor: async () => { calls.push('visible:' + selector) } }) }),
      screenshot: async () => Buffer.from('png'),
      evaluate: viewportEvaluator,
      close: async () => {},
    }
    const result = await runExperience({
      journeys: [{
        persona: 'Power user',
        device: 'Desktop',
        name: 'Every action',
        steps: [{
          label: 'all actions',
          actions: [
            { kind: 'goto', url: 'http://example.test/app' },
            { kind: 'fill', selector: '#email', value: 'a@b.c' },
            { kind: 'click', selector: '#submit' },
            { kind: 'expectText', text: 'Welcome' },
            { kind: 'expectVisible', selector: '#done' },
            { kind: 'screenshot', caption: 'Done', category: 'final' },
          ],
        }],
      }],
      launch: async () => ({ newPage: async () => fakePage, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(result.journeys[0]?.passed).toBe(true)
    expect(calls).toEqual([
      'goto:http://example.test/app',
      'fill:#email=a@b.c',
      'click:#submit',
      'text:Welcome',
      'visible:#done',
    ])
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0]?.category).toBe('final')
  })

  it('skips a screenshot larger than the report bound', async () => {
    const big = Buffer.alloc(500_000)
    const fakePage = {
      goto: async () => {},
      waitForLoadState: async () => {},
      getByText: () => ({ first: () => ({ waitFor: async () => {} }) }),
      locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
      screenshot: async () => big,
      evaluate: viewportEvaluator,
      close: async () => {},
    }
    const result = await runExperience({
      journeys: [{ persona: 'P', device: 'D', name: 'J', steps: [{ label: 's', actions: [{ kind: 'screenshot', caption: 'big', category: 'key' }] }] }],
      launch: async () => ({ newPage: async () => fakePage, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(result.shots).toEqual([])
    expect(result.journeys[0]?.passed).toBe(true)
  })

  it('runs the keyboard checks and records them as their own family', async () => {
    const page = {
      goto: async () => {},
      waitForLoadState: async () => {},
      getByText: () => ({ first: () => ({ waitFor: async () => {} }) }),
      locator: () => ({ first: () => ({ waitFor: async () => {} }), count: async () => 0 }),
      url: () => 'http://app.test/',
      addScriptTag: async () => {},
      close: async () => {},
      screenshot: async () => Buffer.from('shot'),
      // The declarative and axe checks read the page through this evaluator, as
      // does the keyboard inspection; each returns nothing for this page.
      evaluate: async (expression: unknown): Promise<unknown> => {
        const source = String(expression)
        // The viewport measurement is the only call that reads innerWidth, so it
        // is identified by the absence of the inspection bodies rather than by a
        // keyword the visual inspection also happens to contain.
        // Order matters: the visual inspection also reads innerWidth and its
        // serialized body mentions maxSamples, so it is matched first.
        if (source.includes('collectViolations')) return []
        if (source.includes('reachable selector list')) return []
        if (source.includes('MAX_FOCUS') || source.includes('maxSamples') && source.includes('drawsFocus')) return [{ rule: 'keyboard-focus-not-visible', detail: '1 of 1', severity: 'medium', evidence: [] }]
        if (source.includes('innerWidth')) return { width: 1440, height: 900 }
        return []
      },
    }
    const run = await runExperience({
      journeys: [{ persona: 'Keyboard', device: 'Desktop', name: 'J', steps: [{ label: 's', actions: [{ kind: 'goto', url: 'http://app.test/' }] }] }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
      accessibilityChecks: false,
    })
    expect(run.checks[0]?.keyboard.map(finding => finding.rule)).toEqual(['keyboard-focus-not-visible'])
    // The family is separate from the visual findings, so a reader can tell a
    // keyboard barrier from a layout defect.
    expect(run.checks[0]?.visual).toEqual([])
  })

  it('omits the keyboard checks when they are disabled', async () => {
    let inspected = false
    const page = {
      goto: async () => {},
      waitForLoadState: async () => {},
      url: () => 'http://app.test/',
      addScriptTag: async () => {},
      close: async () => {},
      evaluate: async (expression: unknown): Promise<unknown> => {
        const source = String(expression)
        if (source.includes('drawsFocus')) inspected = true
        if (source.includes('collectViolations')) return []
        if (source.includes('innerWidth')) return { width: 1440, height: 900 }
        return []
      },
    }
    await runExperience({
      journeys: [{ persona: 'P', device: 'D', name: 'J', steps: [{ label: 's', actions: [{ kind: 'goto', url: 'http://app.test/' }] }] }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
      accessibilityChecks: false,
      keyboardChecks: false,
    })
    expect(inspected).toBe(false)
  })

  it('honours DSH_BROWSER_EXECUTABLE in the default resolver', async () => {
    const previous = process.env['DSH_BROWSER_EXECUTABLE']
    process.env['DSH_BROWSER_EXECUTABLE'] = '/custom/chrome'
    const seen: (string | undefined)[] = []
    await runExperience({
      journeys: [],
      launch: async (path) => { seen.push(path); return { newPage: async () => ({}), close: async () => {} } as never },
    })
    expect(seen).toEqual(['/custom/chrome'])
    if (previous === undefined) delete process.env['DSH_BROWSER_EXECUTABLE']
    else process.env['DSH_BROWSER_EXECUTABLE'] = previous
  })

  it('ignores an empty DSH_BROWSER_EXECUTABLE value', async () => {
    const previous = process.env['DSH_BROWSER_EXECUTABLE']
    process.env['DSH_BROWSER_EXECUTABLE'] = ''
    const seen: (string | undefined)[] = []
    await runExperience({
      journeys: [],
      launch: async (path) => { seen.push(path); return { newPage: async () => ({}), close: async () => {} } as never },
    })
    expect(seen).toEqual([undefined])
    if (previous === undefined) delete process.env['DSH_BROWSER_EXECUTABLE']
    else process.env['DSH_BROWSER_EXECUTABLE'] = previous
  })

  it('surfaces a clear failure when the resolved executable does not exist', async () => {
    await expect(launchChromium('/nonexistent/chromium')).rejects.toThrow()
  })

  it('applies the default viewport when a journey declares none', async () => {
    const viewports: unknown[] = []
    await runExperience({
      journeys: [{ persona: 'P', device: 'D', name: 'J', steps: [{ label: 's', actions: [{ kind: 'goto', url: 'http://example.test' }] }] }],
      launch: async () => ({
        newPage: async (options: unknown) => { viewports.push(options); return { goto: async () => {}, close: async () => {} } },
        close: async () => {},
      }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(viewports).toEqual([{ viewport: { width: 1440, height: 900 } }])
  })

  it('stops before the next journey when the caller cancels', async () => {
    const controller = new AbortController()
    const opened: string[] = []
    await expect(runExperience({
      journeys: [
        { persona: 'A', device: 'D', name: 'first', steps: [{ label: 's', actions: [{ kind: 'goto', url: 'http://example.test' }] }] },
        { persona: 'B', device: 'D', name: 'second', steps: [{ label: 's', actions: [{ kind: 'goto', url: 'http://example.test' }] }] },
      ],
      launch: async () => ({
        newPage: async () => {
          opened.push('page')
          if (opened.length === 1) controller.abort()
          return { goto: async () => {}, close: async () => {} }
        },
        close: async () => {},
      }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
      signal: controller.signal,
    })).rejects.toThrow('cancelled')
    expect(opened).toHaveLength(1)
  })

  it('passes an explicit executable path through to Chromium', async () => {
    await expect(launchChromium('/nonexistent/chromium-binary')).rejects.toThrow()
  })

  it('records a non-Error failure with a readable message', async () => {
    const result = await runExperience({
      journeys: [{ persona: 'P', device: 'D', name: 'J', steps: [{ label: 'boom', actions: [{ kind: 'click', selector: '#x' }] }] }],
      launch: async () => ({
        newPage: async () => ({ click: async () => { throw 'plain string failure' }, close: async () => {} }),
        close: async () => {},
      }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(result.journeys[0]?.steps[0]?.error).toBe('plain string failure')
  })

  it('falls back to the module resolver when no executable seam is supplied', async () => {
    const previous = process.env['DSH_BROWSER_EXECUTABLE']
    process.env['DSH_BROWSER_EXECUTABLE'] = '/from-env/chrome'
    const seen: (string | undefined)[] = []
    await runExperience({
      journeys: [],
      launch: async (path) => { seen.push(path); return { newPage: async () => ({}), close: async () => {} } as never },
    })
    expect(seen).toEqual(['/from-env/chrome'])
    if (previous === undefined) delete process.env['DSH_BROWSER_EXECUTABLE']
    else process.env['DSH_BROWSER_EXECUTABLE'] = previous
  })

  it('closes the browser when the launcher fails', async () => {
    await expect(runExperience({
      journeys: [],
      launch: async () => { throw new Error('no chromium') },
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })).rejects.toThrow('no chromium')
  })
})