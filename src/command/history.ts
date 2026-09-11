/**
 * Persist and compare bounded Test Observatory run history.
 *
 * Only the status a run actually reported is stored. An earlier version also
 * rewrote a currently-passing test to `flaky` when recent runs disagreed; that
 * made the stored status a derived value, so `passed`/`failed` comparisons
 * stopped matching and a genuine regression could never be reported again.
 * Flakiness is not decidable from a handful of runs, so this module reports
 * only what it observed: a status change between the previous run and this one.
 * The single-run instability signal the report shows is the per-test attempt
 * count a framework itself reported, never an inferred flaky verdict.
 * @module @deepseek-ai/dsh-command-test/history
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ReportModel, ReportTest, Regression, RecoveredTest, TrendPoint } from '../report/types.ts'

/** One compact run record: what the run reported, with no derived fields. */
interface Snapshot {
  readonly runId: string
  readonly runAt: string
  readonly score: number
  readonly durationSeconds: number
  readonly tests: readonly Pick<ReportTest, 'name' | 'path' | 'status'>[]
}

/** The on-disk history document. */
interface History { readonly version: 1; readonly runs: readonly Snapshot[] }

/** History-derived report fields. */
export interface HistoryProjection {
  readonly trend: readonly TrendPoint[]
  readonly regressions: readonly Regression[]
  readonly recovered: readonly RecoveredTest[]
  readonly tests: readonly ReportTest[]
}

/** Rows retained on disk, newest last. */
export const MAX_RETAINED_RUNS = 20

/**
 * Stable identity of one test across runs.
 * @param test - the test to key.
 * @returns the identity string.
 */
const key = (test: Pick<ReportTest, 'name' | 'path'>): string => test.path + '::' + test.name

/**
 * Compare a report with the previous run, persist it, and return the
 * history-derived fields. The current run's own statuses are returned unchanged.
 * @param path - the history file to read and replace.
 * @param model - the report being written.
 * @returns the trend, the changes since the previous run, and the unchanged tests.
 */
export async function projectHistory(path: string, model: ReportModel): Promise<HistoryProjection> {
  let history: History = { version: 1, runs: [] }
  try {
    history = JSON.parse(await readFile(path, 'utf8')) as History
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const previous = history.runs.at(-1)
  const prior = new Map((previous?.tests ?? []).map(test => [key(test), test]))
  const regressions: Regression[] = []
  const recovered: RecoveredTest[] = []
  for (const test of model.tests) {
    const old = prior.get(key(test))
    if (old?.status === 'passed' && test.status === 'failed') regressions.push({ name: test.name, scope: test.suite, severity: 'HIGH' })
    if (old?.status === 'failed' && test.status === 'passed') recovered.push({ name: test.name, evidence: 'Passed after failing in ' + String(previous?.runId) })
  }
  const snapshot: Snapshot = {
    runId: model.meta.runId,
    runAt: model.meta.runAt,
    score: model.verdict.score,
    durationSeconds: model.summary.durationSeconds,
    tests: model.tests.map(({ name, path: testPath, status }) => ({ name, path: testPath, status })),
  }
  const runs = [...history.runs, snapshot].slice(-MAX_RETAINED_RUNS)
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = path + '.tmp-' + String(process.pid) + '-' + String(Date.now())
  try {
    await writeFile(temporaryPath, JSON.stringify({ version: 1, runs }, null, 2) + '\n')
    await rename(temporaryPath, path)
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
  return {
    trend: runs.map(run => ({ run: run.runId, score: run.score, durationSeconds: run.durationSeconds })),
    regressions,
    recovered,
    tests: model.tests,
  }
}
