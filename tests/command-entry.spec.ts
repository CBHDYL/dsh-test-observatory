// Coverage for the /test command module: registration through the command
// registry it declares, and every branch execute() owns — auto detection, usage
// errors, structured-result failures, report writing and the failure summary.
//
// The context is a minimal stand-in for the command service rather than a
// mounted Cordis root: this checkout's vendored cordis bundle omits the runtime
// FiberState value that scripts/test-invariants.ts reads, so every ctx.plugin()
// call inside a spec crashes (scripts/test-invariants.spec.ts fails the same
// way). Driving the handler directly keeps the module's own behaviour covered
// without depending on that broken harness.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { describe, expect, it } from 'vitest'
import * as commandPlugin from '../src/command/index.ts'

/** The slice of the command registry and context that the /test module uses. */
interface Harness {
  readonly definition: CommandDefinition
  run(rawInput: string): Promise<CommandResult>
}

/** Build a workspace directory the command can resolve relative paths against. */
async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'observatory-command-entry-'))
}

/** Register the plugin against a stand-in context and expose its definition. */
async function mount(cwd: string): Promise<Harness> {
  let definition: CommandDefinition | undefined
  const ctx = {
    effect: (register: () => unknown) => register(),
    commands: { register: (registered: CommandDefinition) => { definition = registered; return () => undefined } },
  } as unknown as Context
  commandPlugin.apply(ctx)
  if (definition === undefined) throw new Error('the plugin registered no command')
  const registered = definition
  const agent = { id: 'command-entry', session: { header: { cwd } } } as unknown as Agent
  return {
    definition: registered,
    async run(rawInput: string): Promise<CommandResult> {
      const invocation = { agent, commandId: 'run', rawInput, attachments: [], signal: new AbortController().signal } as unknown as CommandInvocation
      return await registered.handler(invocation)
    },
  }
}

describe('/test command wire-up', () => {
  it('registers one command carrying its input hint', async () => {
    const harness = await mount(await workspace())
    expect(harness.definition).toMatchObject({
      name: 'test',
      description: 'Run a declared test suite and write a Test Observatory HTML report',
      input: { hint: 'config file path, or "auto"' },
    })
  })

  it('prints detection advice for "auto" without running any case', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    const result = await (await mount(scratch)).run('auto')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('cases:')
  })

  it('reports a missing configuration file together with the usage text', async () => {
    const result = await (await mount(await workspace())).run('')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('no configuration file at')
    expect(result.text).toContain('Usage: /test')
  })

  it('reports an invalid configuration as an error with usage', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'broken.yml'), 'cases: []')
    const result = await (await mount(scratch)).run('broken.yml')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('at least one test case')
    expect(result.text).toContain('Usage: /test')
  })

  it('runs a declared case and writes the report it names', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'suite.yml'), ['report:', '  project: Entry', '  outputPath: out/report.html', '  historyPath: false', 'cases:', '  - name: Greets', '    command: echo hello', ''].join('\n'))
    const result = await (await mount(scratch)).run('suite.yml')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('1/1 passed')
    const document = await readFile(join(scratch, 'out/report.html'), 'utf8')
    expect(document).toContain('window.__OBSERVATORY__=')
    expect(document).toContain('Greets')
  })

  it('records run history beside the report by default', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'suite.yml'), ['cases:', '  - name: Greets', '    command: echo hello', ''].join('\n'))
    await (await mount(scratch)).run('suite.yml')
    const history = JSON.parse(await readFile(join(scratch, '.test-observatory/history.json'), 'utf8')) as { runs: unknown[] }
    expect(history.runs).toHaveLength(1)
  })

  it('names every failed test in the returned summary', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'suite.yml'), ['report:', '  historyPath: false', 'cases:', '  - name: Fails here', '    command: exit 4', ''].join('\n'))
    const result = await (await mount(scratch)).run('suite.yml')
    expect(result.text).toContain('0/1 passed')
    expect(result.text).toContain('Failed: Fails here')
  })

  it('refuses a structured result it cannot read and says which case', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'suite.yml'), ['report:', '  historyPath: false', 'cases:', '  - name: Broken artifact', '    command: "true"', '    result:', '      format: junit', '      path: missing.xml', ''].join('\n'))
    const result = await (await mount(scratch)).run('suite.yml')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('could not read structured result for Broken artifact')
  })

  it('expands a readable structured result into per-test rows', async () => {
    const scratch = await workspace()
    await writeFile(join(scratch, 'junit.xml'), '<testsuite><testcase name="alpha" classname="tests.alpha" time="0.1"/><testcase name="beta" classname="tests.beta" time="0.2"><failure message="boom"/></testcase></testsuite>')
    await writeFile(join(scratch, 'suite.yml'), ['report:', '  historyPath: false', 'cases:', '  - name: Suite', '    command: "true"', '    result:', '      format: pytest', '      path: junit.xml', ''].join('\n'))
    const result = await (await mount(scratch)).run('suite.yml')
    expect(result.text).toContain('1/2 passed')
    expect(result.text).toContain('Failed: beta')
  })

  it('surfaces a report write failure instead of reporting success', async () => {
    const scratch = await workspace()
    // A file where the output directory must be: mkdir then fails with ENOTDIR.
    await writeFile(join(scratch, 'blocked'), 'not a directory')
    await writeFile(join(scratch, 'suite.yml'), ['report:', '  historyPath: false', '  outputPath: blocked/report.html', 'cases:', '  - name: Greets', '    command: echo hello', ''].join('\n'))
    const result = await (await mount(scratch)).run('suite.yml')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('report could not be written to')
  })
})
