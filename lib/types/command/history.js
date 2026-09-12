/**
 * Persist and compare bounded Test Observatory run history.
 *
 * Only the status a run actually reported is stored. An earlier version also
 * rewrote a currently-passing test to `flaky` when recent runs disagreed; that
 * made the stored status a derived value, so `passed`/`failed` comparisons
 * stopped matching and a genuine regression could never be reported again.
 * Flakiness is not decidable from a handful of runs, so this module reports
 * only what it observed: a status change between the previous run and this one.
 * A comparison also needs both runs to be the same revision, so the commit is
 * stored with every snapshot and a trend, regression or recovery is derived
 * only from stored runs that recorded the same one.
 * The single-run instability signal the report shows is the per-test attempt
 * count a framework itself reported, never an inferred flaky verdict.
 * @module @cbhdyl/dsh-test-observatory/command/history
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
/** Rows retained on disk, newest last. */
export const MAX_RETAINED_RUNS = 20;
/**
 * Stable identity of one test across runs.
 * @param test - the test to key.
 * @returns the identity string.
 */
const key = (test) => test.path + '::' + test.name;
/**
 * Compare a report with the previous run, persist it, and return the
 * history-derived fields. The current run's own statuses are returned unchanged.
 * @param path - the history file to read and replace.
 * @param model - the report being written.
 * @returns the trend, the changes since the previous run, and the unchanged tests.
 */
export async function projectHistory(path, model) {
    let history = { version: 1, runs: [] };
    try {
        history = JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    const commit = model.meta.commit;
    const snapshot = {
        runId: model.meta.runId,
        runAt: model.meta.runAt,
        score: model.verdict.score,
        durationSeconds: model.summary.durationSeconds,
        commit,
        tests: model.tests.map(({ name, path: testPath, status }) => ({ name, path: testPath, status })),
    };
    const runs = [...history.runs, snapshot].slice(-MAX_RETAINED_RUNS);
    // A run that recorded no revision has nothing to be compared with — not even
    // another run that recorded none, because two unknowns are not known to be
    // the same code. Only a non-empty commit shared with this run makes a stored
    // run comparable, and a snapshot written before this field existed records
    // none, so it stays out of every comparison rather than joining one by default.
    const comparable = commit.length === 0 ? [] : runs.filter(run => run.commit === commit);
    const previous = comparable.at(-2);
    const prior = new Map((previous?.tests ?? []).map(test => [key(test), test]));
    const regressions = [];
    const recovered = [];
    for (const test of model.tests) {
        const old = prior.get(key(test));
        if (old?.status === 'passed' && test.status === 'failed')
            regressions.push({ name: test.name, scope: test.suite, severity: 'HIGH' });
        if (old?.status === 'failed' && test.status === 'passed')
            recovered.push({ name: test.name, evidence: 'Passed after failing in ' + String(previous?.runId) });
    }
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = path + '.tmp-' + String(process.pid) + '-' + String(Date.now());
    try {
        await writeFile(temporaryPath, JSON.stringify({ version: 1, runs }, null, 2) + '\n');
        await rename(temporaryPath, path);
    }
    catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
    return {
        trend: comparable.map(run => ({ run: run.runId, score: run.score, durationSeconds: run.durationSeconds })),
        regressions,
        recovered,
        tests: model.tests,
    };
}
