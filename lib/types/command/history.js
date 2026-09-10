/** Persist and compare bounded Test Observatory run history. */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const key = (test) => test.path + '::' + test.name;
/** Compare a report with prior runs, persist it, and return history-derived fields. */
export async function projectHistory(path, model) {
    let history = { version: 1, runs: [] };
    try {
        history = JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    const previous = history.runs.at(-1);
    const prior = new Map(previous?.tests.map(test => [key(test), test]));
    const regressions = [];
    const recovered = [];
    const tests = model.tests.map(test => {
        const old = prior.get(key(test));
        if (old?.status === 'passed' && test.status === 'failed')
            regressions.push({ name: test.name, scope: test.suite, severity: 'HIGH' });
        if (old?.status === 'failed' && test.status === 'passed')
            recovered.push({ name: test.name, evidence: 'Passed after failing in ' + previous?.runId });
        const statuses = history.runs.slice(-4).flatMap(run => run.tests.filter(item => key(item) === key(test)).map(item => item.status));
        const flaky = test.status === 'passed' && statuses.includes('passed') && statuses.includes('failed');
        return flaky ? { ...test, status: 'flaky' } : test;
    });
    const snapshot = { runId: model.meta.runId, runAt: model.meta.runAt, score: model.verdict.score, durationSeconds: model.summary.durationSeconds, tests: model.tests.map(({ name, path: testPath, status }) => ({ name, path: testPath, status })) };
    const runs = [...history.runs, snapshot].slice(-20);
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = path + '.tmp-' + process.pid + '-' + Date.now();
    try {
        await writeFile(temporaryPath, JSON.stringify({ version: 1, runs }, null, 2) + '\n');
        await rename(temporaryPath, path);
    }
    catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
    return { trend: runs.map(run => ({ run: run.runId, score: run.score, durationSeconds: run.durationSeconds })), regressions, recovered, tests };
}
