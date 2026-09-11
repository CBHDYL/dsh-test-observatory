// Coverage for the run_tests tool module: the definition it registers with the
// tool registry, its argument validation, execution, cancellation and report
// writing. The context is a minimal stand-in for the tool registry rather than a
// mounted Cordis root — see tests/command-entry.spec.ts for why this checkout
// cannot mount plugins inside a spec.
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import * as toolPlugin from '../src/tool/index.ts'

/** The output value run_tests returns, narrowed for assertions. */
interface ToolValue {
  readonly reportPath: string
  readonly summary: { readonly total: number; readonly passed: number; readonly failed: number; readonly durationMs: number }
  readonly results: readonly { readonly name: string; readonly exitCode: number | null; readonly passed: boolean; readonly stdout: string; readonly stderr: string }[]
}

/** Capture the definition the plugin registers against a stand-in registry. */
function mount(): ToolDefinition {
  let definition: ToolDefinition | undefined
  const ctx = {
    tools: { register: (registered: ToolDefinition) => { definition = registered; return () => undefined } },
  } as unknown as Context
  toolPlugin.apply(ctx)
  if (definition === undefined) throw new Error('the plugin registered no tool')
  return definition
}

/** Execute the tool with a real temporary report path. */
async function run(definition: ToolDefinition, args: unknown, signal = new AbortController().signal): Promise<ToolValue> {
  const exec = { signal } as unknown as ToolRunContext
  return await definition.execute(args, exec) as unknown as ToolValue
}

/** A fresh directory for one report. */
async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'observatory-tool-entry-'))
}

describe('run_tests tool wire-up', () => {
  it('registers the run_tests tool with its model-facing description', () => {
    const definition = mount()
    expect(definition.name).toBe('run_tests')
    expect(definition.description).toContain('Execute a list of shell-command test cases sequentially')
    const parameters = definition.parameters as { properties?: Record<string, unknown>; required?: readonly string[] }
    expect(Object.keys(parameters.properties ?? {})).toEqual(['testCases', 'reportPath', 'title'])
    expect(parameters.required).toEqual(['testCases', 'reportPath'])
  })

  it('reports pass, fail and a declared non-zero expectation', async () => {
    const reportPath = join(await scratch(), 'report.html')
    const value = await run(mount(), {
      testCases: [
        { name: 'passes', command: 'true' },
        { name: 'fails', command: 'false' },
        { name: 'expects 3', command: 'exit 3', expectedExitCode: 3 },
      ],
      reportPath,
    })
    expect(value.summary).toMatchObject({ total: 3, passed: 2, failed: 1 })
    expect(value.results.map(result => result.passed)).toEqual([true, false, true])
  })

  it('records captured stdout and stderr for the report', async () => {
    const reportPath = join(await scratch(), 'report.html')
    const value = await run(mount(), {
      testCases: [{ name: 'noisy', command: 'echo out; echo err 1>&2' }],
      reportPath,
    })
    expect(value.results[0]?.stdout).toContain('out')
    expect(value.results[0]?.stderr).toContain('err')
  })

  it('writes the shared Observatory report rather than a private format', async () => {
    const reportPath = join(await scratch(), 'report.html')
    await run(mount(), { testCases: [{ name: 'greets', command: 'echo hi' }], reportPath, title: 'Tool suite' })
    const document = await readFile(reportPath, 'utf8')
    expect(document).toContain('Tool suite — Test Observatory')
    expect(document).toContain('window.__OBSERVATORY__=')
    expect(document).toContain('.drawer{position:fixed')
  })

  it('rejects an empty test-case name before running anything', async () => {
    const reportPath = join(await scratch(), 'report.html')
    await expect(run(mount(), { testCases: [{ name: '   ', command: 'true' }], reportPath }))
      .rejects.toThrow(/`name` must be a non-empty string/)
  })

  it('rejects an empty command and names the offending case', async () => {
    const reportPath = join(await scratch(), 'report.html')
    await expect(run(mount(), { testCases: [{ name: 'blank', command: ' ' }], reportPath }))
      .rejects.toThrow(/invalid test case "blank"/)
  })

  it('rejects a non-positive timeout', async () => {
    const reportPath = join(await scratch(), 'report.html')
    await expect(run(mount(), { testCases: [{ name: 'slow', command: 'true', timeoutMs: 0 }], reportPath }))
      .rejects.toThrow(/timeoutMs.*positive/)
  })

  it('reports a spawn failure as a failed case rather than a tool error', async () => {
    const reportPath = join(await scratch(), 'report.html')
    const value = await run(mount(), {
      testCases: [{ name: 'missing binary', command: 'definitely-not-a-real-binary-xyz' }],
      reportPath,
    })
    expect(value.summary.failed).toBe(1)
    expect(value.results[0]?.passed).toBe(false)
  })

  it('surfaces a report write failure', async () => {
    const directory = await scratch()
    await expect(run(mount(), { testCases: [{ name: 'ok', command: 'true' }], reportPath: join(directory, 'missing-dir', 'report.html') }))
      .rejects.toThrow(/failed to write report/)
  })

  it('cancels through the tool-call abort code when the signal is already aborted', async () => {
    const reportPath = join(await scratch(), 'report.html')
    const controller = new AbortController()
    controller.abort()
    await expect(run(mount(), { testCases: [{ name: 'never runs', command: 'true' }], reportPath }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('accepts an empty test-case list and still writes a report', async () => {
    const reportPath = join(await scratch(), 'report.html')
    const value = await run(mount(), { testCases: [], reportPath })
    expect(value.summary.total).toBe(0)
    expect(await readFile(reportPath, 'utf8')).toContain('window.__OBSERVATORY__=')
  })
})