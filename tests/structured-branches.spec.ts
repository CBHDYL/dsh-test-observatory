// Branch coverage for the structured-result parsers: the malformed, partial and
// alternate-field shapes each producer can emit, plus every artifact-level
// failure the caller must see instead of a silent empty report.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStructuredResult } from '../src/command/structured.ts'
import type { StructuredResultSpec } from '../src/command/types.ts'

const root = join(process.cwd(), '.tmp-test-observatory-structured-branches')
const base = { name: 'framework', command: 'true', owner: 'Quality' }

/** Write one artifact and return its path, relative to {@link root}. */
async function artifact(name: string, body: string): Promise<string> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, name), body)
  return name
}

/** Parse one JSON artifact through the public entry point. */
async function parse(format: StructuredResultSpec['format'], name: string, value: unknown): Promise<Awaited<ReturnType<typeof parseStructuredResult>>> {
  return parseStructuredResult({ format, path: await artifact(name, JSON.stringify(value)) }, base, root)
}

describe('structured parser branches', () => {
  it('rejects an artifact whose JSON cannot be read', async () => {
    const path = await artifact('truncated.json', '{"testResults": [')
    await expect(parseStructuredResult({ format: 'jest', path }, base, root)).rejects.toThrow()
  })

  it('rejects a JUnit artifact that declares no testcase', async () => {
    const path = await artifact('empty.xml', '<testsuites></testsuites>')
    await expect(parseStructuredResult({ format: 'junit', path }, base, root))
      .rejects.toThrow(/no recognizable test results/)
  })

  it('walks arrays and skips non-record entries at the root', async () => {
    const rows = await parse('jest', 'array-root.json', [
      null,
      'not a record',
      { testResults: [{ name: '/src/kept.test.ts', assertionResults: [{ fullName: 'kept', status: 'passed', duration: 5 }] }] },
    ])
    expect(rows.map(row => row.name)).toEqual(['kept'])
  })

  it('skips an assertion entry that is not a record', async () => {
    const rows = await parse('jest', 'nonrecord-assertion.json', {
      testResults: [{ name: '/src/a.test.ts', assertionResults: [null, { fullName: 'real', status: 'passed' }] }],
    })
    expect(rows.map(row => row.name)).toEqual(['real'])
  })

  it('rejects an artifact whose only case declares neither a name nor a status', async () => {
    await expect(parse('jest', 'unnamed.json', { testResults: [{ assertionResults: [{ status: 'passed' }] }] }))
      .rejects.toThrow(/no recognizable test results/)
  })

  it('names a Playwright case from its test title when the suite carries none', async () => {
    const rows = await parse('playwright', 'untitled-suite.json', {
      suites: [{ specs: [{ tests: [{ title: 'leaf title', status: 'expected', results: [] }] }] }],
    })
    expect(rows[0]?.name).toBe('leaf title')
    expect(rows[0]?.suite).toBe('playwright')
  })

  it('walks a nesting container to its assertion rows and keeps the file path', async () => {
    const rows = await parse('vitest', 'nested.json', {
      testResults: [{ name: '/src/nested.test.ts', assertionResults: [{ fullName: 'inner case', status: 'passed' }] }],
    })
    // A container without its own status becomes the suite label, and the file
    // path it carries is inherited as the row's path.
    expect(rows[0]?.suite).toBe('/src/nested.test.ts')
    expect(rows[0]?.path).toBe('/src/nested.test.ts')
  })

  it('reads a duration expressed as an object with milliseconds', async () => {
    const rows = await parse('vitest', 'duration-object.json', {
      testResults: [{ name: '/src/d.test.ts', assertionResults: [{ fullName: 'timed', status: 'passed', duration: { milliseconds: 1250 } }] }],
    })
    expect(rows[0]?.durationSeconds).toBe(1.25)
  })

  it('prefers an explicit failure message over the collected error list', async () => {
    const rows = await parse('jest', 'failure-message.json', {
      testResults: [{ assertionResults: [{ fullName: 'boom', status: 'failed', failureMessage: 'primary', failureMessages: ['secondary'] }] }],
    })
    expect(rows[0]?.error).toBe('primary')
  })

  it('joins several failure messages when no single message is given', async () => {
    const rows = await parse('jest', 'failure-messages.json', {
      testResults: [{ assertionResults: [{ fullName: 'boom', status: 'failed', failureMessages: ['one', 'two'] }] }],
    })
    expect(rows[0]?.error).toBe('one\ntwo')
  })

  it('reads an error object by its message field', async () => {
    const rows = await parse('vitest', 'error-object.json', {
      testResults: [{ assertionResults: [{ fullName: 'boom', status: 'failed', errors: [{ message: 'object message' }] }] }],
    })
    expect(rows[0]?.error).toBe('object message')
  })

  it('derives the attempt count from a Playwright-style retry index', async () => {
    const rows = await parse('vitest', 'retry-index.json', {
      testResults: [{ assertionResults: [{ fullName: 'retried', status: 'passed', retry: 2 }] }],
    })
    expect(rows[0]?.attempts).toBe(2)
  })

  it('keeps a Playwright entry whose status is carried by the outer test node', async () => {
    const rows = await parse('playwright', 'outer-status.json', {
      suites: [{ title: 'checkout.spec.ts', specs: [{ title: 'pays', tests: [{ status: 'expected', results: [] }] }] }],
    })
    expect(rows[0]).toMatchObject({ name: 'pays', status: 'passed' })
  })

  it('skips a Playwright test entry that is not a record', async () => {
    const rows = await parse('playwright', 'nonrecord-test.json', {
      suites: [{ title: 'checkout.spec.ts', specs: [{ title: 'pays', tests: [null, { status: 'expected', results: [] }] }] }],
    })
    expect(rows).toHaveLength(1)
  })

  it('classifies video and other attachments by content type', async () => {
    const rows = await parse('playwright', 'attachments.json', {
      suites: [{
        title: 'media.spec.ts',
        specs: [{
          title: 'records',
          tests: [{
            status: 'expected',
            results: [{
              status: 'passed',
              attachments: [
                { name: 'clip', contentType: 'video/webm', path: 'clip.webm' },
                { name: 'log', contentType: 'text/plain', path: 'run.log' },
                { name: 'no path', contentType: 'text/plain' },
              ],
            }],
          }],
        }],
      }],
    })
    expect(rows[0]?.attachments?.map(attachment => attachment.kind)).toEqual(['video', 'other'])
  })

  it('names an attachment from its file name when the artifact omits a name', async () => {
    const rows = await parse('playwright', 'unnamed-attachment.json', {
      suites: [{ title: 'a.spec.ts', specs: [{ title: 'x', tests: [{ status: 'expected', results: [{ status: 'passed', attachments: [{ path: '/tmp/deep/shot.png', contentType: 'image/png' }] }] }] }] }],
    })
    expect(rows[0]?.attachments?.[0]?.name).toBe('shot.png')
  })

  it('descends through child suites that are not records', async () => {
    const rows = await parse('playwright', 'suite-array.json', [
      { suites: [{ title: 'outer', suites: [{ title: 'inner', specs: [{ title: 'leaf', tests: [{ status: 'expected', results: [] }] }] }] }] },
    ])
    expect(rows[0]?.suite).toBe('outer › inner')
  })

  it('skips API entries without a URL or a status', async () => {
    const rows = await parse('api', 'api-skip.json', {
      results: [null, { method: 'GET' }, { method: 'GET', url: '/ok', status: 200 }, { method: 'POST', url: '/missing-status' }],
    })
    expect(rows.map(row => row.name)).toEqual(['GET /ok'])
  })

  it('labels a passing API check with its default method and keeps a custom name', async () => {
    const rows = await parse('api', 'api-defaults.json', {
      results: [{ name: 'health', url: '/health', status: 200 }],
    })
    expect(rows[0]).toMatchObject({ name: 'health', path: '/health', status: 'passed' })
    expect(rows[0]?.api?.method).toBe('GET')
    expect(rows[0]?.api?.durationMs).toBeUndefined()
  })

  it('accepts a bare array as the API result list', async () => {
    const rows = await parse('api', 'api-bare.json', [{ method: 'GET', url: '/x', actualStatus: 204, expectedStatus: 204 }])
    expect(rows[0]?.status).toBe('passed')
  })

  it('fails an API check whose recorded error is present', async () => {
    const rows = await parse('api', 'api-error.json', { results: [{ url: '/x', status: 200, error: 'socket hang up' }] })
    expect(rows[0]).toMatchObject({ status: 'failed', error: 'socket hang up' })
  })

  it('skips performance entries without a metric or a measurement', async () => {
    const rows = await parse('performance', 'perf-skip.json', {
      results: [null, { metric: 'latency' }, { value: 12 }, { name: 'named', value: 5, unit: 'ms' }],
    })
    expect(rows.map(row => row.name)).toEqual(['named'])
  })

  it('treats a minimum-direction threshold as passing only when met', async () => {
    const rows = await parse('performance', 'perf-min.json', {
      results: [
        { name: 'too slow', metric: 'rps', value: 100, unit: 'rps', threshold: 200, direction: 'min' },
        { name: 'fast enough', metric: 'rps', value: 300, unit: 'rps', threshold: 200, direction: 'min' },
      ],
    })
    expect(rows.map(row => row.status)).toEqual(['failed', 'passed'])
    expect(rows[0]?.error).toContain('breached min 200rps')
  })

  it('accepts a bare array as the performance result list and defaults the unit', async () => {
    const rows = await parse('performance', 'perf-bare.json', [{ metric: 'ttfb', value: 40 }])
    expect(rows[0]?.performance).toMatchObject({ unit: 'ms', direction: 'max' })
    expect(rows[0]?.error).toBeUndefined()
  })

  it('keeps JUnit cases that declare a class but no file, without inventing a path', async () => {
    const path = await artifact('class-only.xml', '<testsuite><testcase name="only" classname="pkg.mod" time="0.5"/></testsuite>')
    const rows = await parseStructuredResult({ format: 'junit', path }, base, root)
    // Only the pytest format derives a module path from classname; junit keeps the artifact path.
    expect(rows[0]).toMatchObject({ path, suite: 'pkg.mod', durationSeconds: 0.5 })
  })

  it('falls back to the artifact path for a JUnit case with no class location', async () => {
    const path = await artifact('no-class.xml', '<testsuite><testcase name="bare"/></testsuite>')
    const rows = await parseStructuredResult({ format: 'junit', path }, base, root)
    expect(rows[0]?.path).toBe(path)
    expect(rows[0]?.durationSeconds).toBe(0)
  })

  it('keeps the artifact class name as the suite and falls back to the declared suite only when absent', async () => {
    const path = await artifact('declared-suite.xml', '<testsuite><testcase name="a" classname="pkg.mod"/></testsuite>')
    const withClass = await parseStructuredResult({ format: 'pytest', path }, { ...base, suite: 'Declared' }, root)
    expect(withClass[0]?.suite).toBe('pkg.mod')
    const bare = await artifact('bare-case.xml', '<testsuite><testcase name="a"/></testsuite>')
    const withoutClass = await parseStructuredResult({ format: 'pytest', path: bare }, { ...base, suite: 'Declared' }, root)
    expect(withoutClass[0]?.suite).toBe('Declared')
  })
})