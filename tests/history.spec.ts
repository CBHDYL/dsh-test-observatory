import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectHistory } from '../src/command/history.ts'
import type { ReportModel, TestStatus } from '../src/report/types.ts'

const root = join(process.cwd(), '.tmp-test-observatory-history')
const path = join(root, 'history.json')

/** One report carrying a single test with the given status. */
const model = (runId: string, status: TestStatus): ReportModel => ({
  meta: { project: 'p', branch: '', commit: '', environment: 'local', runAt: runId, runId },
  verdict: { score: status === 'failed' ? 0 : 100, headline: '', label: '', summary: '', confidence: '', risk: '' },
  kpis: [],
  summary: { total: 1, passed: status === 'passed' ? 1 : 0, failed: status === 'failed' ? 1 : 0, skipped: 0, flaky: 0, durationSeconds: 1, coveragePercent: null },
  trend: [], causes: [], slowest: [], timeline: [], regressions: [], recovered: [],
  tests: [{ name: 'case', path: 'a.ts', status, suite: 'unit', durationSeconds: 1, owner: 'team' }],
})

describe('projectHistory', () => {
  it('records a trend and reports a regression when a passing test starts failing', async () => {
    await rm(root, { recursive: true, force: true })
    let projection = await projectHistory(path, model('r1', 'passed'))
    expect(projection.trend).toHaveLength(1)
    expect(projection.regressions).toEqual([])
    projection = await projectHistory(path, model('r2', 'failed'))
    expect(projection.regressions[0]?.name).toBe('case')
    expect(projection.tests[0]?.status).toBe('failed')
    expect(projection.trend).toHaveLength(2)
  })

  it('reports a recovery when a failing test passes again', async () => {
    await rm(root, { recursive: true, force: true })
    await projectHistory(path, model('r1', 'failed'))
    const projection = await projectHistory(path, model('r2', 'passed'))
    expect(projection.recovered[0]?.name).toBe('case')
    expect(projection.recovered[0]?.evidence).toContain('r1')
  })

  it('returns the current run statuses unchanged, never a derived one', async () => {
    await rm(root, { recursive: true, force: true })
    await projectHistory(path, model('r1', 'passed'))
    await projectHistory(path, model('r2', 'failed'))
    const projection = await projectHistory(path, model('r3', 'passed'))
    // A pass after a failure stays a pass: flakiness needs more evidence than
    // three runs, and inventing it here hid real regressions.
    expect(projection.tests[0]?.status).toBe('passed')
  })

  it('still reports a regression after an earlier pass-fail-pass sequence', async () => {
    await rm(root, { recursive: true, force: true })
    await projectHistory(path, model('r1', 'passed'))
    await projectHistory(path, model('r2', 'failed'))
    await projectHistory(path, model('r3', 'passed'))
    const projection = await projectHistory(path, model('r4', 'failed'))
    expect(projection.regressions[0]?.name).toBe('case')
    expect(projection.tests[0]?.status).toBe('failed')
  })

  it('claims nothing when a stored status is a value only older versions wrote', async () => {
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    await writeFile(path, JSON.stringify({
      version: 1,
      runs: [{ runId: 'legacy', runAt: 'legacy', score: 0, durationSeconds: 1, tests: [{ name: 'case', path: 'a.ts', status: 'flaky' }] }],
    }) + '\n')
    const projection = await projectHistory(path, model('r2', 'passed'))
    expect(projection.regressions).toEqual([])
    expect(projection.recovered).toEqual([])
    expect(projection.tests[0]?.status).toBe('passed')
  })

  it('persists only the statuses the run reported', async () => {
    await rm(root, { recursive: true, force: true })
    await projectHistory(path, model('r1', 'passed'))
    await projectHistory(path, model('r2', 'failed'))
    await projectHistory(path, model('r3', 'passed'))
    const saved = JSON.parse(await readFile(path, 'utf8')) as { runs: { tests: { status: string }[] }[] }
    expect(saved.runs.map(run => run.tests[0]?.status)).toEqual(['passed', 'failed', 'passed'])
  })

  it('leaves no temporary file after atomic persistence', async () => {
    await rm(root, { recursive: true, force: true })
    await projectHistory(path, model('r', 'passed'))
    expect((await readdir(root)).filter(name => name.includes('.tmp-'))).toEqual([])
  })

  it('bounds retained history to twenty runs', async () => {
    await rm(root, { recursive: true, force: true })
    for (let index = 0; index < 23; index++) await projectHistory(path, model('r' + String(index), 'passed'))
    const saved = JSON.parse(await readFile(path, 'utf8')) as { runs: { runId: string }[] }
    expect(saved.runs).toHaveLength(20)
    expect(saved.runs[0]?.runId).toBe('r3')
  })

  it('surfaces corrupt history instead of silently replacing it', async () => {
    await mkdir(root, { recursive: true })
    await writeFile(path, 'bad')
    await expect(projectHistory(path, model('r', 'passed'))).rejects.toThrow()
  })
})
