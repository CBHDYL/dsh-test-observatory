/**
 * Human-facing `/test` command: execute a declared command suite and write a
 * Test Observatory HTML report. The command is the human entry point; the
 * report renderer owns the document, and this package owns configuration
 * loading, execution and where the file lands.
 * @module @deepseek-ai/dsh-command-test
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { renderReport } from "../report/index.js";
import { SuiteConfigError, loadSuiteConfig } from "./config.js";
import { buildReportModel, runCase } from "./runner.js";
import { toExperienceSection } from "./experience.js";
import { describeDetection, detectProject } from "./detect.js";
import { parseStructuredResult } from "./structured.js";
import { projectHistory } from "./history.js";
import { runExperience } from "../experience/index.js";
export const name = 'command-test';
export const inject = ['commands'];
/** Default configuration file name looked up in the working directory. */
const DEFAULT_CONFIG = 'test-observatory.yml';
const USAGE = `Usage: /test [<config-file>]
  /test                     run ./${DEFAULT_CONFIG}
  /test path/to/suite.yml   run the named configuration
  /test auto                print the detected test commands to declare`;
/**
 * Register the `/test` command.
 * @param ctx - context carrying the command registry.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.commands.register({
        name: 'test',
        description: 'Run a declared test suite and write a Test Observatory HTML report',
        input: { hint: 'config file path, or "auto"' },
        handler: invocation => execute(invocation),
    }), 'command-test lifecycle');
}
/**
 * Execute one `/test` invocation.
 * @param invocation - the parsed invocation.
 * @returns the human-facing outcome.
 */
async function execute(invocation) {
    const argument = invocation.rawInput.trim();
    if (argument === 'auto') {
        const directory = invocation.agent.session.header.cwd ?? process.cwd();
        return { kind: 'success', text: describeDetection(await detectProject(directory), directory) };
    }
    const workspace = invocation.agent.session.header.cwd ?? process.cwd();
    const configPath = resolve(workspace, argument.length === 0 ? DEFAULT_CONFIG : argument);
    let config;
    try {
        config = await loadSuiteConfig(configPath);
    }
    catch (error) {
        if (error instanceof SuiteConfigError)
            return { kind: 'error', text: `${error.message}\n\n${USAGE}` };
        throw error;
    }
    const outcomes = [];
    for (const testCase of config.cases) {
        outcomes.push(await runCase(testCase, invocation.signal, workspace));
    }
    const outputPath = resolve(workspace, config.report?.outputPath ?? 'test-observatory-report.html');
    const experienceSection = config.journeys === undefined
        ? undefined
        : toExperienceSection(await runExperience({ journeys: config.journeys, signal: invocation.signal }));
    const structuredTests = [];
    for (const outcome of outcomes) {
        if (outcome.testCase.result === undefined)
            continue;
        try {
            structuredTests.push(...await parseStructuredResult(outcome.testCase.result, outcome.testCase, workspace));
        }
        catch (error) {
            return { kind: 'error', text: `could not read structured result for ${outcome.testCase.name}: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    let model = buildReportModel(outcomes, {
        config,
        runAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        runId: String(Date.now()).slice(-6),
        branch: '',
        commit: '',
        environment: 'local',
        ...(experienceSection === undefined ? {} : { experienceSection }),
        ...(structuredTests.length === 0 ? {} : { structuredTests }),
    });
    const historyPath = config.report?.historyPath;
    if (historyPath !== false) {
        try {
            const projection = await projectHistory(resolve(workspace, historyPath ?? '.test-observatory/history.json'), model);
            const historyCounts = { passed: projection.tests.filter(test => test.status === 'passed').length, failed: projection.tests.filter(test => test.status === 'failed').length, skipped: projection.tests.filter(test => test.status === 'skipped').length, flaky: projection.tests.filter(test => test.status === 'flaky').length };
            const passRate = model.summary.total === 0 ? 0 : Math.round(historyCounts.passed / model.summary.total * 1000) / 10;
            const hasRisk = historyCounts.failed > 0 || historyCounts.flaky > 0;
            model = {
                ...model,
                trend: projection.trend,
                regressions: projection.regressions,
                recovered: projection.recovered,
                tests: projection.tests,
                causes: historyCounts.failed === 0 ? [] : [{ label: 'Failed structured test', count: historyCounts.failed }],
                slowest: [...projection.tests].sort((left, right) => right.durationSeconds - left.durationSeconds).slice(0, 10).map((test, index) => ({ rank: index + 1, name: test.name, suite: test.suite, durationSeconds: test.durationSeconds })),
                summary: { ...model.summary, ...historyCounts },
                verdict: (() => {
                    const experienceScore = experienceSection?.experience.total;
                    const testScore = Math.round(passRate);
                    const combinedScore = experienceScore === undefined ? testScore : Math.min(testScore, experienceScore);
                    const experienceRisk = experienceScore !== undefined && experienceScore < 100;
                    const headline = historyCounts.failed > 0
                        ? historyCounts.failed + ' tests failed.'
                        : historyCounts.flaky > 0
                            ? historyCounts.flaky + ' tests are flaky.'
                            : experienceRisk ? 'Automated tests passed; experience checks scored ' + experienceScore + '/100.' : 'Every test passed.';
                    const needsReview = hasRisk || experienceRisk;
                    return {
                        ...model.verdict,
                        score: combinedScore,
                        headline,
                        label: needsReview ? 'Suite needs review' : 'Suite passing',
                        summary: hasRisk ? 'Review failed and flaky tests before release.' : experienceRisk ? 'The test suite passed, but browser observations found release risks.' : 'The test suite completed without failures.',
                        confidence: passRate + '% stable pass rate' + (experienceScore === undefined ? '' : ' · ' + experienceScore + '/100 experience score'),
                        risk: hasRisk ? 'Historical comparison found unstable or failing tests.' : experienceRisk ? 'Experience checks scored ' + experienceScore + '/100; inspect browser findings before release.' : 'No failing or flaky test in this run.',
                    };
                })(),
                kpis: [
                    { label: 'Pass rate', value: passRate + '%', delta: historyCounts.passed + ' of ' + model.summary.total, ...(hasRisk ? { worse: true } : {}) },
                    { label: 'Total tests', value: String(model.summary.total), delta: model.summary.total + ' observed' },
                    model.kpis[2],
                    { label: 'Needs review', value: String(historyCounts.failed + historyCounts.flaky), delta: historyCounts.flaky ? historyCounts.flaky + ' flaky' : historyCounts.failed ? historyCounts.failed + ' failed' : 'none', ...(hasRisk ? { worse: true } : {}) },
                ],
            };
        }
        catch (error) {
            return { kind: 'error', text: `test history could not be updated: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    const document = renderReport(model);
    try {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, document, 'utf8');
    }
    catch (error) {
        return { kind: 'error', text: `report could not be written to ${outputPath}: ${error instanceof Error ? error.message : String(error)}` };
    }
    const failedTests = model.tests.filter(test => test.status === 'failed');
    const unstable = model.summary.flaky === 0 ? '' : ` ${model.summary.flaky} flaky.`;
    const headline = `${model.summary.passed}/${model.summary.total} passed.${unstable} Report: ${outputPath}`;
    return failedTests.length === 0
        ? { kind: 'success', text: headline }
        : { kind: 'success', text: `${headline}\nFailed: ${failedTests.map(test => test.name).join(', ')}` };
}
