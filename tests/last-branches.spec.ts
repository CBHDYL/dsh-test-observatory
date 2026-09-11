// The last reachable paths: a signal-killed command, an untimed wait, the
// tool's own renderer and call presenter, an empty stderr stream, and the
// combined verdict when failing tests coexist with a perfect experience score.
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { buildReportModel } from '../src/command/runner.ts'
import type { CaseOutcome } from '../src/command/runner.ts'
import { runExperience } from '../src/experience/runner.ts'
import * as toolPlugin from '../src/tool/index.ts'

/** One settled command outcome. */
function outcome(name: string, passed: boolean, durationMs: number, stderr = ''): CaseOutcome {
  return { testCase: { name, command: 'true' }, exitCode: passed ? 0 : 1, passed, durationMs, stdout: '', stderr }
}

/** Build the model inputs shared by the verdict tests. */
const inputs = { config: { cases: [] }, runAt: 'now', runId: 'r', branch: '', commit: '', environment: 'local' }

/** A perfect experience section, so only the tests decide the verdict. */
const perfectExperience = {
  experience: { total: 100, band: 'Excellent', tasksObserved: 1, tasksCompleted: 1, blockers: 0, recoverablePoints: 0, dimensions: [], visualFindings: 0, accessibilityFindings: 0 },
  personas: [], journeys: [], evidence: [], findings: [], checks: [],
}

describe('report model edge cases', () => {
  it('omits stderr when a case produced none but keeps it when it did', () => {
    const quiet = buildReportModel([outcome('quiet', true, 10)], inputs)
    expect(quiet.tests[0]?.stderr).toBeUndefined()
    const noisy = buildReportModel([outcome('noisy', true, 10, 'warning')], inputs)
    expect(noisy.tests[0]?.stderr).toBe('warning')
  })

  it('keeps the failure headline when a perfect experience score cannot offset failing tests', () => {
    const model = buildReportModel([outcome('a', true, 10), outcome('b', false, 10)], { ...inputs, experienceSection: perfectExperience })
    expect(model.verdict.headline).toContain('1 of 2 tests failed')
    expect(model.verdict.label).toBe('Suite failing')
    expect(model.verdict.summary).toContain('did not produce its expected exit code')
    expect(model.verdict.risk).toContain('Failing commands are reported')
  })
})

describe('tool report renderer and call presenter', () => {
  /** Capture the registered tool definition. */
  function mountTool(): ToolDefinition {
    let definition: ToolDefinition | undefined
    const ctx = { tools: { register: (registered: ToolDefinition) => { definition = registered; return () => undefined } } } as unknown as Context
    toolPlugin.apply(ctx)
    if (definition === undefined) throw new Error('no tool registered')
    return definition
  }

  it('renders a one-line summary of the settled run', () => {
    const definition = mountTool()
    const blocks = definition.output.render({}, { reportPath: '/tmp/r.html', summary: { total: 3, passed: 2, failed: 1, durationMs: 12 }, results: [] } as never)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'text' })
    expect((blocks[0] as { text: string }).text).toContain('Ran 3 tests: 2 passed, 1 failed')
  })

  it('presents the call as a generic card naming the cases', () => {
    const definition = mountTool()
    if (definition.presentCall === undefined) throw new Error('no call presenter')
    const view = definition.presentCall({ testCases: [{ name: 'alpha', command: 'a' }, { name: 'beta', command: 'b' }], reportPath: '/tmp/r.html' }) as { title: string; rawInput: { testCases: readonly string[] } }
    expect(view.title).toBe('Run tests')
    expect(view.rawInput.testCases).toEqual(['alpha', 'beta'])
  })
})

describe('signal-terminated command', () => {
  it('records a null exit code when the process dies by signal', async () => {
    let definition: ToolDefinition | undefined
    const ctx = { tools: { register: (registered: ToolDefinition) => { definition = registered; return () => undefined } } } as unknown as Context
    toolPlugin.apply(ctx)
    if (definition === undefined) throw new Error('no tool registered')
    const reportPath = join(await mkdtemp(join(tmpdir(), 'observatory-last-')), 'report.html')
    const exec = { signal: new AbortController().signal } as unknown as ToolRunContext
    const value = await definition.execute({ testCases: [{ name: 'killed', command: 'kill -TERM $$' }], reportPath }, exec) as unknown as { results: { exitCode: number | null; passed: boolean }[] }
    // A signal death has no numeric exit code, and therefore cannot match the expectation.
    expect(value.results[0]?.exitCode).toBeNull()
    expect(value.results[0]?.passed).toBe(false)
  }, 30_000)

  it('applies the declared timeout when one is supplied', async () => {
    let definition: ToolDefinition | undefined
    const ctx = { tools: { register: (registered: ToolDefinition) => { definition = registered; return () => undefined } } } as unknown as Context
    toolPlugin.apply(ctx)
    if (definition === undefined) throw new Error('no tool registered')
    const reportPath = join(await mkdtemp(join(tmpdir(), 'observatory-last-')), 'report.html')
    const exec = { signal: new AbortController().signal } as unknown as ToolRunContext
    const value = await definition.execute({ testCases: [{ name: 'slow', command: 'sleep 5', timeoutMs: 250 }], reportPath }, exec) as unknown as { results: { passed: boolean }[] }
    expect(value.results[0]?.passed).toBe(false)
  }, 30_000)
})

describe('journey wait without a selector', () => {
  it('waits a fixed duration when the action names no element', async () => {
    const waited: number[] = []
    const page = {
      goto: async () => {},
      waitForLoadState: async () => {},
      url: () => 'http://app.test/',
      evaluate: async () => [],
      addScriptTag: async () => {},
      close: async () => {},
      waitForTimeout: async (ms: number) => { waited.push(ms) },
    }
    const run = await runExperience({
      journeys: [{ persona: 'P', device: 'D', name: 'task', steps: [{ label: 'step', actions: [{ kind: 'wait' }] }] }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(run.journeys[0]?.passed).toBe(true)
    expect(waited).toEqual([500])
  })

  it('survives a page that never stops fetching', async () => {
    const page = {
      goto: async () => {},
      waitForLoadState: async () => { throw new Error('timeout waiting for networkidle') },
      url: () => 'http://app.test/',
      evaluate: async () => [],
      addScriptTag: async () => {},
      close: async () => {},
    }
    const run = await runExperience({
      journeys: [{ persona: 'P', device: 'D', name: 'task', steps: [{ label: 'step', actions: [{ kind: 'goto', url: 'http://app.test/' }] }] }],
      launch: async () => ({ newPage: async () => page, close: async () => {} }) as never,
      executable: () => undefined,
      visualChecks: false,
      accessibilityChecks: false,
    })
    expect(run.journeys[0]?.passed).toBe(true)
  })
})
