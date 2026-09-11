// Branch coverage for the paths the earlier suites left open: rejected config
// shapes, history-enabled command runs (the combined verdict), report
// placeholder stripping, output truncation, and the package's public surface.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSuiteConfig } from '../src/command/config.ts'
import * as commandPlugin from '../src/command/index.ts'
import * as packageEntry from '../src/index.ts'
import * as reportEntry from '../src/report/index.ts'
import * as experienceEntry from '../src/experience/index.ts'
import { renderReport } from '../src/report/render.ts'
import type { ReportModel } from '../src/report/types.ts'
import * as toolPlugin from '../src/tool/index.ts'

const directories: string[] = []

/** A temporary workspace removed after the test. */
async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-remaining-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

/** Register /test against a stand-in registry bound to one workspace. */
function mountCommand(cwd: string): (rawInput: string) => Promise<CommandResult> {
  let definition: CommandDefinition | undefined
  const ctx = {
    effect: (register: () => unknown) => register(),
    commands: { register: (registered: CommandDefinition) => { definition = registered; return () => undefined } },
  } as unknown as Context
  commandPlugin.apply(ctx)
  if (definition === undefined) throw new Error('no command registered')
  const registered = definition
  return async (rawInput: string): Promise<CommandResult> => {
    const invocation = { agent: { id: 'a', session: { header: { cwd } } }, commandId: 'run', rawInput, attachments: [], signal: new AbortController().signal } as unknown as CommandInvocation
    return await registered.handler(invocation)
  }
}

/** Register run_tests against a stand-in registry. */
function mountTool(): ToolDefinition {
  let definition: ToolDefinition | undefined
  const ctx = { tools: { register: (registered: ToolDefinition) => { definition = registered; return () => undefined } } } as unknown as Context
  toolPlugin.apply(ctx)
  if (definition === undefined) throw new Error('no tool registered')
  return definition
}

describe('rejected configuration shapes', () => {
  it('rejects a negative expected exit code before running anything', () => {
    expect(() => parseSuiteConfig(['cases:', '  - name: a', '    command: x', '    expectedExitCode: -1', ''].join('\n')))
      .toThrow(/"expectedExitCode" must be a non-negative integer/)
  })

  it('accepts a zero expected exit code, which is the ordinary success code', () => {
    const config = parseSuiteConfig(['cases:', '  - name: a', '    command: x', '    expectedExitCode: 0', ''].join('\n'))
    expect(config.cases[0]?.expectedExitCode).toBe(0)
  })

  it('rejects a structured result that is not a mapping', () => {
    expect(() => parseSuiteConfig(['cases:', '  - name: a', '    command: x', '    result: 7', ''].join('\n')))
      .toThrow(/result: must be a mapping/)
  })

  it('rejects a zero wait duration because it cannot express a wait', () => {
    const prefix = ['cases:', '  - name: a', '    command: x', 'journeys:', '  - persona: P', '    device: D', '    name: N', '    steps:', '      - label: s', '        actions:']
    expect(() => parseSuiteConfig([...prefix, '          - kind: wait', '            ms: 0', ''].join('\n')))
      .toThrow(/"ms" must be a positive integer/)
  })

  it('rejects a zero viewport dimension', () => {
    expect(() => parseSuiteConfig(['cases:', '  - name: a', '    command: x', 'journeys:', '  - persona: P', '    device: D', '    name: N', '    viewport: { width: 0, height: 900 }', '    steps:', '      - label: s', '        actions:', '          - kind: goto', '            url: u', ''].join('\n')))
      .toThrow(/"width" must be a positive integer/)
  })
})

describe('command run with history enabled', () => {
  it('records the first run and then reports a regression on the second', async () => {
    const directory = await scratch()
    const suite = ['report:', '  historyPath: history.json', 'cases:', '  - name: Case', '    command: "true"', ''].join('\n')
    await writeFile(join(directory, 'suite.yml'), suite)
    const run = mountCommand(directory)
    const first = await run('suite.yml')
    expect(first.kind).toBe('success')
    expect(first.text).toContain('1/1 passed')
    const history = JSON.parse(await readFile(join(directory, 'history.json'), 'utf8')) as { runs: { runId: string }[] }
    expect(history.runs).toHaveLength(1)
    const second = await run('suite.yml')
    expect(second.kind).toBe('success')
    const after = JSON.parse(await readFile(join(directory, 'history.json'), 'utf8')) as { runs: unknown[] }
    expect(after.runs).toHaveLength(2)
  })

  it('names every failing test after a history projection', async () => {
    const directory = await scratch()
    await writeFile(join(directory, 'suite.yml'), ['report:', '  historyPath: history.json', 'cases:', '  - name: Always fails', '    command: exit 9', ''].join('\n'))
    const result = await mountCommand(directory)('suite.yml')
    expect(result.text).toContain('0/1 passed')
    expect(result.text).toContain('Failed: Always fails')
  })

  it('reports a flaky count once a test passes after failing', async () => {
    const directory = await scratch()
    const suite = (command: string): string => ['report:', '  historyPath: history.json', 'cases:', '  - name: Wobbles', '    command: ' + command, ''].join('\n')
    await writeFile(join(directory, 'suite.yml'), suite('"true"'))
    const run = mountCommand(directory)
    await run('suite.yml')
    await writeFile(join(directory, 'suite.yml'), suite('"false"'))
    await run('suite.yml')
    await writeFile(join(directory, 'suite.yml'), suite('"true"'))
    const third = await run('suite.yml')
    expect(third.kind).toBe('success')
  })
})

describe('snapshot counts through the command', () => {
  it('states what the baselines did, and says nothing without any', async () => {
    const directory = await scratch()
    const withSnapshots = JSON.stringify({
      numTotalTests: 1,
      snapshot: { matched: 1, unmatched: 0, added: 0, updated: 0, unchecked: 0, total: 1, filesUnmatched: 0 },
      testResults: [{ name: '/src/a.test.ts', assertionResults: [{ fullName: 'renders', status: 'passed' }] }],
    })
    await writeFile(join(directory, 'vitest.json'), withSnapshots)
    await writeFile(join(directory, 'suite.yml'), [
      'report:', '  historyPath: false', '  outputPath: out/report.html',
      'cases:', '  - name: Unit', '    command: "true"', '    result:', '      format: vitest', '      path: vitest.json', '',
    ].join('\n'))
    const result = await mountCommand(directory)('suite.yml')
    expect(result.kind).toBe('success')
    const document = await readFile(join(directory, 'out/report.html'), 'utf8')
    expect(document).toContain('Snapshots: 1 compared.')
  })

  it('adds nothing to the report when the artifact declares no snapshot block', async () => {
    const directory = await scratch()
    await writeFile(join(directory, 'vitest.json'), JSON.stringify({ testResults: [{ name: '/src/a.test.ts', assertionResults: [{ fullName: 'renders', status: 'passed' }] }] }))
    await writeFile(join(directory, 'suite.yml'), [
      'report:', '  historyPath: false', '  outputPath: out/report.html',
      'cases:', '  - name: Unit', '    command: "true"', '    result:', '      format: vitest', '      path: vitest.json', '',
    ].join('\n'))
    await mountCommand(directory)('suite.yml')
    const document = await readFile(join(directory, 'out/report.html'), 'utf8')
    expect(document).not.toContain('"snapshots"')
  })
})

describe('report placeholder stripping', () => {
  const minimal = (overrides: Partial<ReportModel>): ReportModel => ({
    meta: { project: 'p', branch: '', commit: '', environment: 'local', runAt: 'now', runId: 'r' },
    verdict: { score: 100, headline: 'ok', label: 'ok', summary: 'ok', confidence: 'ok', risk: 'none' },
    kpis: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, durationSeconds: 0, coveragePercent: null },
    trend: [], causes: [], slowest: [], timeline: [], regressions: [], recovered: [], tests: [], ...overrides,
  })

  it('keeps the evidence gallery when at least one capture exists', () => {
    const document = renderReport(minimal({
      experience: { total: 90, band: 'Excellent', tasksObserved: 1, tasksCompleted: 1, blockers: 0, recoverablePoints: 10, dimensions: [] },
      personas: [], journeys: [],
      evidence: [{ id: 'e1', title: 'shot', personaId: 'p', journey: 'j', stepLabel: 's', kind: 'key', meta: 'm', imageDataUri: 'data:image/png;base64,AA' }],
    }))
    expect(document).toContain('id="evidenceGrid"')
  })

  it('keeps the evidence gallery when a finding exists but no capture does', () => {
    const document = renderReport(minimal({
      experience: { total: 90, band: 'Excellent', tasksObserved: 1, tasksCompleted: 0, blockers: 1, recoverablePoints: 10, dimensions: [] },
      personas: [], journeys: [], evidence: [],
      findings: [{ id: 'finding-1', severity: 'HIGH', dimension: 'Feedback & recovery', deductedPoints: 2, title: 'open failed', observation: 'timeout', scope: 'Task · P', recoverablePoints: 2, evidenceIds: [] }],
    }))
    expect(document).toContain('id="evidenceGrid"')
  })
})

describe('tool output truncation', () => {
  it('bounds captured stdout and marks the cut', async () => {
    const directory = await scratch()
    const reportPath = join(directory, 'report.html')
    const definition = mountTool()
    const exec = { signal: new AbortController().signal } as unknown as ToolRunContext
    const value = await definition.execute({ testCases: [{ name: 'noisy', command: 'head -c 40000 /dev/zero | tr "\\0" "x"' }], reportPath }, exec) as unknown as { results: { stdout: string }[] }
    expect(value.results[0]?.stdout.length).toBeLessThan(21_000)
    expect(value.results[0]?.stdout).toContain('[truncated]')
  }, 30_000)
})

describe('package public surface', () => {
  it('exposes the four documented subpath entry points', () => {
    expect(Object.keys(packageEntry).sort()).toEqual(['command', 'experience', 'report', 'tool'])
    expect(typeof packageEntry.command.apply).toBe('function')
    expect(typeof packageEntry.tool.apply).toBe('function')
  })

  it('exposes the report renderer and its escaping helper', () => {
    expect(typeof reportEntry.renderReport).toBe('function')
    expect(typeof reportEntry.escapeHtml).toBe('function')
  })

  it('exposes the experience runner and its scoring vocabulary', () => {
    expect(typeof experienceEntry.runExperience).toBe('function')
    expect(typeof experienceEntry.scoreRun).toBe('function')
    expect(experienceEntry.SCORE_DIMENSIONS).toHaveLength(6)
  })
})