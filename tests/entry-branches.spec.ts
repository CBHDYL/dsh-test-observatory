// Branch coverage for the remaining entry-point paths: the accessibility scan's
// injected-script step, wait-action validation, history write failure handling,
// report section stripping, and the tool's argument-schema rejections.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSuiteConfig } from '../src/command/config.ts'
import { projectHistory } from '../src/command/history.ts'
import * as commandPlugin from '../src/command/index.ts'
import { renderReport } from '../src/report/render.ts'
import type { ReportModel } from '../src/report/types.ts'
import { checkAccessibility } from '../src/experience/a11y.ts'
import * as toolPlugin from '../src/tool/index.ts'

const scratchDirectories: string[] = []

/** A fresh temporary directory, removed after the test. */
async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-branches-'))
  scratchDirectories.push(directory)
  return directory
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  for (const directory of scratchDirectories.splice(0)) await rm(directory, { recursive: true, force: true })
})

/** A page stub that records the script it was asked to inject. */
function fakePage(options: { injected?: string[]; violations?: unknown[]; throwOnAdd?: boolean }) {
  return {
    addScriptTag: async (init: { content: string }) => {
      if (options.throwOnAdd === true) throw new Error('page closed')
      options.injected?.push(init.content)
    },
    evaluate: async () => options.violations,
  }
}

describe('accessibility scan', () => {
  it('injects the axe bundle into the page before scanning', async () => {
    const injected: string[] = []
    const page = fakePage({ injected, violations: [] })
    const findings = await checkAccessibility(page as never)
    expect(injected).toHaveLength(1)
    expect(injected[0]).toContain('axe')
    expect(findings).toEqual([])
  })

  it('maps a blocking axe impact to a high severity finding', async () => {
    const page = fakePage({ violations: [{ id: 'image-alt', impact: 'critical', help: 'Images must have alternative text', nodes: 3 }] })
    const findings = await checkAccessibility(page as never)
    expect(findings[0]).toMatchObject({ rule: 'axe:image-alt', severity: 'high' })
    expect(findings[0]?.detail).toContain('3 node(s)')
  })

  it('maps a null impact to a non-blocking finding', async () => {
    const page = fakePage({ violations: [{ id: 'region', impact: null, help: 'All content should be in a landmark', nodes: 1 }] })
    const findings = await checkAccessibility(page as never)
    expect(findings[0]?.severity).toBe('medium')
  })

  it('propagates an injection failure so the caller can contain it', async () => {
    const page = fakePage({ throwOnAdd: true, violations: [] })
    await expect(checkAccessibility(page as never)).rejects.toThrow(/page closed/)
  })
})

describe('wait action validation', () => {
  const prefix = ['cases:', '  - name: a', '    command: x', 'journeys:', '  - persona: P', '    device: D', '    name: N', '    steps:', '      - label: s', '        actions:']

  it('accepts a wait with no ms and no selector', () => {
    const config = parseSuiteConfig([...prefix, '          - kind: wait', ''].join('\n'))
    expect(config.journeys?.[0]?.steps[0]?.actions).toEqual([{ kind: 'wait' }])
  })

  it('accepts a wait targeting a selector', () => {
    const config = parseSuiteConfig([...prefix, '          - kind: wait', '            ms: 250', '            selector: "#ready"', ''].join('\n'))
    expect(config.journeys?.[0]?.steps[0]?.actions).toEqual([{ kind: 'wait', ms: 250, selector: '#ready' }])
  })

  it('rejects a wait selector that is empty or not a string', () => {
    expect(() => parseSuiteConfig([...prefix, '          - kind: wait', '            selector: ""', ''].join('\n')))
      .toThrow(/"selector" must be a non-empty string/)
    expect(() => parseSuiteConfig([...prefix, '          - kind: wait', '            selector: 7', ''].join('\n')))
      .toThrow(/"selector" must be a non-empty string/)
  })

  it('rejects a wait whose ms is not a positive integer', () => {
    expect(() => parseSuiteConfig([...prefix, '          - kind: wait', '            ms: 0', ''].join('\n')))
      .toThrow(/ms/)
  })
})

describe('history write failure', () => {
  const model = (): ReportModel => ({
    meta: { project: 'p', branch: '', commit: '', environment: 'local', runAt: 'now', runId: 'r1' },
    verdict: { score: 100, headline: 'ok', label: 'ok', summary: 'ok', confidence: 'ok', risk: 'none' },
    kpis: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, durationSeconds: 0, coveragePercent: null },
    trend: [], causes: [], slowest: [], timeline: [], regressions: [], recovered: [],
    tests: [{ name: 't', path: 'p.ts', status: 'passed', suite: 'S', durationSeconds: 1, owner: 'O' }],
  })

  it('removes its temporary file and rethrows when persistence fails', async () => {
    const directory = await scratch()
    // A directory where the history file must be written: the rename target cannot be replaced.
    const blocked = join(directory, 'history.json')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(blocked, { recursive: true })
    await writeFile(join(blocked, 'child'), 'x')
    await expect(projectHistory(blocked, model())).rejects.toThrow()
    const { readdir } = await import('node:fs/promises')
    const leftovers = (await readdir(directory)).filter(name => name.includes('.tmp-'))
    expect(leftovers).toEqual([])
  })
})

describe('report section stripping', () => {
  const minimal = (overrides: Partial<ReportModel>): ReportModel => ({
    meta: { project: 'p', branch: '', commit: '', environment: 'local', runAt: 'now', runId: 'r' },
    verdict: { score: 100, headline: 'ok', label: 'ok', summary: 'ok', confidence: 'ok', risk: 'none' },
    kpis: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, durationSeconds: 0, coveragePercent: null },
    trend: [], causes: [], slowest: [], timeline: [], regressions: [], recovered: [], tests: [], ...overrides,
  })

  it('drops the experience section when no simulation data exists', () => {
    const document = renderReport(minimal({}))
    expect(document).not.toContain('id="experience"')
    expect(document).not.toContain('id="checksSection"')
  })

  it('keeps the experience section when simulation data exists', () => {
    const document = renderReport(minimal({
      experience: { total: 90, band: 'Excellent', tasksObserved: 1, tasksCompleted: 1, blockers: 0, recoverablePoints: 10, dimensions: [] },
      personas: [{ id: 'p', name: 'P', device: 'D', tasks: 1, completionPercent: 100, headline: 'Completed' }],
      journeys: [],
    }))
    expect(document).toContain('id="experience"')
  })
})

describe('model-facing tool argument schema', () => {
  /** Capture the registered tool definition. */
  function mountTool(): ToolDefinition {
    let definition: ToolDefinition | undefined
    const ctx = { tools: { register: (registered: ToolDefinition) => { definition = registered; return () => undefined } } } as unknown as Context
    toolPlugin.apply(ctx)
    if (definition === undefined) throw new Error('no tool registered')
    return definition
  }

  it('rejects arguments the schema does not accept before running anything', async () => {
    const definition = mountTool()
    const exec = { signal: new AbortController().signal } as unknown as ToolRunContext
    await expect(definition.execute({ testCases: [] }, exec)).rejects.toThrow(/reportPath/)
  })
})

describe('command handler containment', () => {
  /** Register the plugin against a stand-in command registry for one workspace. */
  function mountCommand(cwd?: string): (rawInput: string) => Promise<CommandResult> {
    let definition: CommandDefinition | undefined
    const ctx = {
      effect: (register: () => unknown) => register(),
      commands: { register: (registered: CommandDefinition) => { definition = registered; return () => undefined } },
    } as unknown as Context
    commandPlugin.apply(ctx)
    if (definition === undefined) throw new Error('no command registered')
    const registered = definition
    return async (rawInput: string) => {
      const header = cwd === undefined ? {} : { cwd }
      const invocation = { agent: { id: 'a', session: { header } }, commandId: 'run', rawInput, attachments: [], signal: new AbortController().signal } as unknown as CommandInvocation
      return await registered.handler(invocation)
    }
  }

  it('falls back to the process directory when the session declares none', async () => {
    const result = await mountCommand()('auto')
    expect(result.kind).toBe('success')
  })

  it('reports a history file it cannot read rather than overwriting it', async () => {
    const directory = await scratch()
    await writeFile(join(directory, 'history.json'), 'not json')
    await writeFile(join(directory, 'suite.yml'), ['report:', '  historyPath: history.json', 'cases:', '  - name: ok', '    command: "true"', ''].join('\n'))
    const result = await mountCommand(directory)('suite.yml')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('test history could not be updated')
  })

  it('writes the default report name into the session working directory', async () => {
    const directory = await scratch()
    await writeFile(join(directory, 'suite.yml'), ['report:', '  historyPath: false', 'cases:', '  - name: ok', '    command: "true"', ''].join('\n'))
    const result = await mountCommand(directory)('suite.yml')
    expect(result.kind).toBe('success')
    expect(await readFile(join(directory, 'test-observatory-report.html'), 'utf8')).toContain('window.__OBSERVATORY__=')
  })
})