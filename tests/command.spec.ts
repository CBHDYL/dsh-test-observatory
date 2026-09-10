import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SuiteConfigError, loadSuiteConfig, parseSuiteConfig } from '../src/command/config.ts'
import { buildReportModel, runCase, truncate, MAX_CAPTURED_CHARS } from '../src/command/runner.ts'
import { describeDetection, detectProject } from '../src/command/detect.ts'
import { personaId, toExperienceSection } from '../src/command/experience.ts'
import type { CaseOutcome } from '../src/command/runner.ts'

let scratch: string | undefined

afterEach(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
  scratch = undefined
})

/** Build one settled outcome without spawning a process. */
function outcome(name: string, passed: boolean, durationMs: number): CaseOutcome {
  return {
    testCase: { name, command: 'true' },
    exitCode: passed ? 0 : 1,
    passed,
    durationMs,
    stdout: '',
    stderr: '',
  }
}

describe('parseSuiteConfig', () => {
  it('accepts a minimal declaration and applies no implicit defaults', () => {
    const config = parseSuiteConfig('cases:\n  - name: Unit\n    command: pnpm test\n')
    expect(config.cases).toEqual([{ name: 'Unit', command: 'pnpm test' }])
    expect(config.report).toEqual({})
  })

  it('keeps declared optional fields', () => {
    const config = parseSuiteConfig([
      'report:',
      '  title: RC',
      '  outputPath: out/r.html',
      'cases:',
      '  - name: Unit',
      '    command: pnpm test',
      '    expectedExitCode: 2',
      '    timeoutMs: 1000',
      '    suite: Core',
      '    owner: Team',
      '',
    ].join('\n'))
    expect(config.report).toEqual({ title: 'RC', outputPath: 'out/r.html' })
    expect(config.cases[0]).toEqual({
      name: 'Unit', command: 'pnpm test', expectedExitCode: 2, timeoutMs: 1000, suite: 'Core', owner: 'Team',
    })
  })

  it('rejects invalid YAML with a message naming the document', () => {
    expect(() => parseSuiteConfig('cases: [\n')).toThrow(SuiteConfigError)
    expect(() => parseSuiteConfig('cases: [\n')).toThrow(/not valid YAML/)
  })

  it('rejects a missing or empty cases list', () => {
    expect(() => parseSuiteConfig('report: {}')).toThrow(/"cases" must be a list/)
    expect(() => parseSuiteConfig('cases: []')).toThrow(/at least one test case/)
  })

  it('rejects malformed cases with the offending index', () => {
    expect(() => parseSuiteConfig('cases:\n  - name: ""\n    command: x')).toThrow(/cases\[0\]: "name"/)
    expect(() => parseSuiteConfig('cases:\n  - name: a\n    command: x\n    timeoutMs: -1')).toThrow(/timeoutMs/)
    expect(() => parseSuiteConfig('cases:\n  - name: a\n    command: x\n    suite: 3')).toThrow(/"suite" must be a string/)
  })

  it('rejects a non-mapping case and a non-string owner', () => {
    expect(() => parseSuiteConfig('cases:\n  - just a string')).toThrow(/cases\[0\]: must be a mapping/)
    expect(() => parseSuiteConfig('cases:\n  - name: a\n    command: x\n    owner: 7')).toThrow(/"owner" must be a string/)
  })

  it('rejects a document that is not a mapping', () => {
    expect(() => parseSuiteConfig('- one\n- two')).toThrow(/must be a mapping with a "cases" list/)
  })

  it('rejects malformed report options', () => {
    expect(() => parseSuiteConfig('report: []\ncases:\n  - name: a\n    command: x')).toThrow(/report: must be a mapping/)
    expect(() => parseSuiteConfig('report:\n  title: ""\ncases:\n  - name: a\n    command: x')).toThrow(/report\.title/)
  })
})

describe('loadSuiteConfig', () => {
  it('loads and validates a real file', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-command-test-config-'))
    const path = join(scratch, 'suite.yml')
    await writeFile(path, 'cases:\n  - name: Unit\n    command: pnpm test\n')
    await expect(loadSuiteConfig(path)).resolves.toEqual({ report: {}, cases: [{ name: 'Unit', command: 'pnpm test' }] })
  })

  it('reports a missing file by path', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-command-test-config-'))
    await expect(loadSuiteConfig(join(scratch, 'absent.yml'))).rejects.toThrow(/no configuration file at/)
  })

  it('reports an unreadable path', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-command-test-config-'))
    await expect(loadSuiteConfig(scratch)).rejects.toThrow(/cannot read/)
  })
})

describe('parseSuiteConfig journeys', () => {
  const journeyYaml = [
    'journeys:',
    '  - persona: First-time visitor',
    '    device: Desktop · Chrome',
    '    name: Checkout',
    '    viewport:',
    '      width: 1440',
    '      height: 900',
    '    steps:',
    '      - label: Open',
    '        actions:',
    '          - kind: goto',
    '            url: http://example.test/',
    '          - kind: screenshot',
    '            caption: Shot',
    '            category: key',
    'cases:',
    '  - name: a',
    '    command: x',
    '',
  ].join('\n')

  it('parses a complete journey declaration', () => {
    const config = parseSuiteConfig(journeyYaml)
    expect(config.journeys).toHaveLength(1)
    expect(config.journeys?.[0]?.viewport).toEqual({ width: 1440, height: 900 })
    expect(config.journeys?.[0]?.steps[0]?.actions).toEqual([
      { kind: 'goto', url: 'http://example.test/' },
      { kind: 'screenshot', caption: 'Shot', category: 'key' },
    ])
  })

  it('parses every action kind', () => {
    const config = parseSuiteConfig([
      'journeys:',
      '  - persona: P',
      '    device: D',
      '    name: N',
      '    steps:',
      '      - label: s',
      '        actions:',
      '          - kind: click',
      '            selector: "#a"',
      '          - kind: fill',
      '            selector: "#b"',
      '            value: v',
      '          - kind: expectText',
      '            text: hello',
      '          - kind: expectVisible',
      '            selector: "#c"',
      'cases:',
      '  - name: a',
      '    command: x',
      '',
    ].join('\n'))
    expect(config.journeys?.[0]?.steps[0]?.actions).toHaveLength(4)
  })

  it('rejects a non-mapping journey entry and a non-mapping step', () => {
    expect(() => parseSuiteConfig('journeys:\n  - just a string\ncases:\n  - name: a\n    command: x')).toThrow(/journeys\[0\]: must be a mapping/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps:\n      - just a string\ncases:\n  - name: a\n    command: x')).toThrow(/steps\[0\]: must be a mapping/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps:\n      - label: s\n        actions:\n          - just a string\ncases:\n  - name: a\n    command: x')).toThrow(/actions\[0\]: must be a mapping/)
  })

  it('carries a step timeout when declared', () => {
    const config = parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps:\n      - label: s\n        timeoutMs: 500\n        actions:\n          - kind: goto\n            url: u\ncases:\n  - name: a\n    command: x')
    expect(config.journeys?.[0]?.steps[0]?.timeoutMs).toBe(500)
  })

  it('rejects malformed journeys with the offending position', () => {
    expect(() => parseSuiteConfig('journeys: []\ncases:\n  - name: a\n    command: x')).not.toThrow()
    expect(() => parseSuiteConfig('journeys: {}\ncases:\n  - name: a\n    command: x')).toThrow(/"journeys" must be a list/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\ncases:\n  - name: a\n    command: x')).toThrow(/journeys\[0\]: "name"/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\ncases:\n  - name: a\n    command: x')).toThrow(/"device" must be a non-empty string/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\ncases:\n  - name: a\n    command: x')).toThrow(/"steps" must be a non-empty list/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps: []\ncases:\n  - name: a\n    command: x')).toThrow(/"steps" must be a non-empty list/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps:\n      - label: s\ncases:\n  - name: a\n    command: x')).toThrow(/"actions" must be a non-empty list/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps:\n      - label: s\n        actions:\n          - kind: nope\ncases:\n  - name: a\n    command: x')).toThrow(/"kind" must be goto/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    steps:\n      - label: s\n        actions:\n          - kind: screenshot\n            caption: c\n            category: nope\ncases:\n  - name: a\n    command: x')).toThrow(/"category" must be key/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    viewport: {}\n    steps:\n      - label: s\n        actions:\n          - kind: goto\n            url: u\ncases:\n  - name: a\n    command: x')).toThrow(/"width" and "height" are required/)
    expect(() => parseSuiteConfig('journeys:\n  - persona: P\n    name: N\n    device: D\n    viewport: 3\n    steps:\n      - label: s\n        actions:\n          - kind: goto\n            url: u\ncases:\n  - name: a\n    command: x')).toThrow(/viewport: must be a mapping/)
  })
})

describe('personaId', () => {
  it('keeps non-Latin persona names distinct', () => {
    expect(personaId('首次访问用户')).toBe('首次访问用户')
    expect(personaId('熟练用户')).toBe('熟练用户')
    expect(personaId('首次访问用户')).not.toBe(personaId('熟练用户'))
  })

  it('slugs a Latin name and falls back only for an empty name', () => {
    expect(personaId('Error-prone user')).toBe('error-prone-user')
    expect(personaId('  ')).toBe('persona')
  })
})

describe('toExperienceSection', () => {
  it('gives two Chinese personas distinct ids and separate journeys', () => {
    const run = {
      shots: [],
      checks: [],
      journeys: [
        { persona: '首次访问用户', device: 'Desktop', name: '结账', passed: true, steps: [{ label: '打开', state: 'PASS' as const, durationMs: 10 }] },
        { persona: '熟练用户', device: 'Desktop', name: '批量下单', passed: false, steps: [{ label: '提交', state: 'FAIL' as const, durationMs: 10, error: '超时' }] },
      ],
    }
    const section = toExperienceSection(run)
    const ids = section.personas.map(persona => persona.id)
    expect(new Set(ids).size).toBe(2)
    expect(section.journeys.map(journey => journey.personaId)).toEqual(ids)
    expect(section.findings).toHaveLength(1)
  })
})

describe('detectProject', () => {
  it('detects a Node project and prefers the conventional scripts', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-'))
    await writeFile(join(scratch, 'package.json'), JSON.stringify({ name: 'atlas', scripts: { build: 'x', test: 'x', lint: 'x', deploy: 'x' } }))
    const detection = await detectProject(scratch)
    expect(detection.projectType).toBe('atlas')
    expect(detection.checks.map(check => check.name)).toEqual(['pnpm run test', 'pnpm run lint', 'pnpm run build'])
  })

  it('tolerates a package.json without scripts or a name', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-'))
    await writeFile(join(scratch, 'package.json'), '{}')
    const detection = await detectProject(scratch)
    expect(detection.projectType).toBe('Node project')
    expect(detection.checks).toEqual([])
  })

  it('tolerates malformed package.json', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-'))
    await writeFile(join(scratch, 'package.json'), '{not json')
    const detection = await detectProject(scratch)
    expect(detection.projectType).toBe('Node project')
  })

  it('tolerates a package.json that is not a JSON object', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-scalar-'))
    await writeFile(join(scratch, 'package.json'), '"just a string"')
    const detection = await detectProject(scratch)
    expect(detection.projectType).toBe('Node project')
    expect(detection.checks).toEqual([])
  })

  it('detects Python, Go and Cargo projects', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-'))
    await writeFile(join(scratch, 'pyproject.toml'), '[project]\nname = "x"\n')
    expect((await detectProject(scratch)).checks[0]?.command).toBe('python3 -m pytest')

    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-go-'))
    await writeFile(join(scratch, 'go.mod'), 'module x\n')
    expect((await detectProject(scratch)).checks.map(check => check.name)).toEqual(['go test', 'go vet'])

    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-cargo-'))
    await writeFile(join(scratch, 'Cargo.toml'), '[package]\nname = "x"\n')
    expect((await detectProject(scratch)).checks.map(check => check.name)).toEqual(['cargo test', 'cargo clippy'])
  })

  it('reports an unrecognized project without inventing checks', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-empty-'))
    const detection = await detectProject(scratch)
    expect(detection.projectType).toBe('unrecognized project')
    expect(detection.checks).toEqual([])
    expect(describeDetection(detection, scratch)).toContain('No runnable checks detected')
  })

  it('renders a detected project as a pasteable declaration', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-detect-render-'))
    await writeFile(join(scratch, 'package.json'), JSON.stringify({ name: 'atlas', scripts: { test: 'x' } }))
    const text = describeDetection(await detectProject(scratch), scratch)
    expect(text).toContain('cases:')
    expect(text).toContain('pnpm run test')
    expect(text).toContain('project: atlas')
  })
})

describe('runCase', () => {
  it('passes a zero-exit command and captures stdout', async () => {
    const result = await runCase({ name: 'ok', command: 'echo hello' }, new AbortController().signal)
    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello')
  })

  it('treats a non-zero exit as an ordinary failure, not a throw', async () => {
    const result = await runCase({ name: 'bad', command: 'exit 3' }, new AbortController().signal)
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(3)
  })

  it('honours a declared expected exit code', async () => {
    const result = await runCase({ name: 'expected', command: 'exit 2', expectedExitCode: 2 }, new AbortController().signal)
    expect(result.passed).toBe(true)
  })

  it('runs the command in the supplied working directory', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-cwd-'))
    await writeFile(join(scratch, 'marker.txt'), 'found')
    const result = await runCase({ name: 'pwd', command: 'cat marker.txt' }, new AbortController().signal, scratch)
    expect(result.passed).toBe(true)
    expect(result.stdout).toContain('found')
  })

  it('captures stderr separately from stdout', async () => {
    const result = await runCase({ name: 'err', command: 'echo out; echo err >&2' }, new AbortController().signal)
    expect(result.stdout).toContain('out')
    expect(result.stderr).toContain('err')
  })

  it('settles a timeout as a failed case with no exit code', async () => {
    const result = await runCase({ name: 'slow', command: 'sleep 5', timeoutMs: 150 }, new AbortController().signal)
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBeNull()
  })

  it('rejects with the abort reason when the caller cancels before the process settles', async () => {
    const controller = new AbortController()
    const promise = runCase({ name: 'cancel-early', command: 'sleep 5' }, controller.signal)
    controller.abort(new Error('cancelled by test'))
    await expect(promise).rejects.toThrow()
  })

  it('rejects when the caller cancels the run', async () => {
    const controller = new AbortController()
    const promise = runCase({ name: 'cancel', command: 'sleep 5' }, controller.signal)
    controller.abort()
    await expect(promise).rejects.toBeDefined()
  })
})

describe('truncate', () => {
  it('leaves short output unchanged and marks truncated output', () => {
    expect(truncate('short')).toBe('short')
    const long = 'x'.repeat(MAX_CAPTURED_CHARS + 10)
    const result = truncate(long)
    expect(result.endsWith('[truncated]')).toBe(true)
    expect(result.length).toBeLessThan(long.length + 20)
  })
})

describe('buildReportModel', () => {
  const inputs = { config: { cases: [] }, runAt: 'now', runId: '#7', branch: 'main', commit: 'abc', environment: 'local' }

  it('summarizes an all-passing run', () => {
    const model = buildReportModel([outcome('a', true, 100), outcome('b', true, 300)], inputs)
    expect(model.summary).toEqual({ total: 2, passed: 2, failed: 0, skipped: 0, flaky: 0, durationSeconds: 0.4, coveragePercent: null })
    expect(model.verdict.score).toBe(100)
    expect(model.verdict.label).toBe('Suite passing')
    expect(model.regressions).toEqual([])
  })

  it('summarizes a failing run and ranks the slowest cases', () => {
    const model = buildReportModel([outcome('a', true, 100), outcome('b', false, 900)], inputs)
    expect(model.summary.passed).toBe(1)
    expect(model.summary.failed).toBe(1)
    expect(model.slowest[0]?.name).toBe('b')
    expect(model.causes).toEqual([{ label: 'Non-zero exit', count: 1 }])
    expect(model.verdict.label).toBe('Suite failing')
  })

  it('formats a run longer than a minute as minutes and seconds', () => {
    const model = buildReportModel([outcome('slow', true, 125_000)], inputs)
    expect(model.kpis.find(kpi => kpi.label === 'Duration')?.value).toBe('2m 5s')
  })

  it('uses the configured project name and tolerates an empty run', () => {
    const model = buildReportModel([], { ...inputs, config: { report: { project: 'Atlas' }, cases: [] } })
    expect(model.meta.project).toBe('Atlas')
    expect(model.summary.total).toBe(0)
    expect(model.verdict.score).toBe(0)
  })
})