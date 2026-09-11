// The new formats through the public entry point, so a parser that works in
// isolation but is not reachable from configuration fails here.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSuiteConfig } from '../src/command/config.ts'
import { parseStructuredResult } from '../src/command/structured.ts'

const root = join(process.cwd(), '.tmp-test-observatory-pipeline')
const base = { name: 'framework', command: 'true', owner: 'Quality' }

/** Write one artifact and return its path, relative to {@link root}. */
async function artifact(name: string, body: string): Promise<string> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, name), body)
  return name
}

describe('structured result pipeline', () => {
  it('accepts sarif as a declared format', () => {
    const config = parseSuiteConfig(['cases:', '  - name: Lint', '    command: ruff check --output-format sarif .', '    result:', '      format: sarif', '      path: reports/ruff.sarif', ''].join('\n'))
    expect(config.cases[0]?.result).toEqual({ format: 'sarif', path: 'reports/ruff.sarif' })
  })

  it('turns a SARIF warning into a failing report row with its location', async () => {
    const path = await artifact('ruff.sarif', JSON.stringify({
      version: '2.1.0',
      runs: [{ tool: { driver: { name: 'ruff' } }, results: [{ ruleId: 'F401', level: 'warning', message: { text: 'imported but unused' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/app.py' }, region: { startLine: 3 } } }] }] }],
    }))
    const rows = await parseStructuredResult({ format: 'sarif', path }, base, root)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'failed', path: 'src/app.py', framework: 'sarif', error: 'imported but unused' })
    expect(rows[0]?.name).toContain('F401')
    expect(rows[0]?.name).toContain('src/app.py:3')
  })

  it('lets a SARIF note pass, because it reports no defect', async () => {
    const path = await artifact('notes.sarif', JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 't' } }, results: [{ ruleId: 'R', level: 'note', message: { text: 'informational' } }] }] }))
    const rows = await parseStructuredResult({ format: 'sarif', path }, base, root)
    expect(rows[0]?.status).toBe('passed')
    expect(rows[0]?.error).toBeUndefined()
  })

  it('refuses a SARIF document it cannot implement instead of reporting an empty pass', async () => {
    const path = await artifact('future.sarif', JSON.stringify({ version: '2.2.0', runs: [] }))
    await expect(parseStructuredResult({ format: 'sarif', path }, base, root)).rejects.toThrow(/unsupported SARIF version/)
  })

  it('refuses a truncated JUnit document instead of reporting every case as passing', async () => {
    const path = await artifact('cut.xml', '<testsuites><testsuite><testcase name="a"/><testcase name="b"')
    await expect(parseStructuredResult({ format: 'junit', path }, base, root)).rejects.toThrow(/truncated/)
  })

  it('reads a self-closing failure as a failure through the pipeline', async () => {
    const path = await artifact('pytest.xml', '<testsuite><testcase name="fails" classname="tests.t" time="0.1"><failure message="assert 1 == 2"/></testcase></testsuite>')
    const rows = await parseStructuredResult({ format: 'pytest', path }, base, root)
    expect(rows[0]).toMatchObject({ status: 'failed', error: 'assert 1 == 2', path: 'tests/t.py' })
  })

  it('carries rerun attempts into the report row', async () => {
    const path = await artifact('rerun.xml', '<testsuite><testcase name="wobbles" classname="tests.t"><flakyFailure message="first try"/></testcase></testsuite>')
    const rows = await parseStructuredResult({ format: 'junit', path }, base, root)
    expect(rows[0]?.attempts).toBe(2)
  })
})
