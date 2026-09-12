/**
 * Human-facing `/test` command: execute a declared command suite and write a
 * Test Observatory HTML report. The command is the human entry point; the
 * report renderer owns the document, and this package owns configuration
 * loading, execution and where the file lands.
 * @module @cbhdyl/dsh-test-observatory/command
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { renderReport } from "../report/index.js";
import { SuiteConfigError, loadSuiteConfig } from "./config.js";
import { buildReportModel, runCase } from "./runner.js";
import { toExperienceSection } from "./experience.js";
import { describeDetection, detectProject } from "./detect.js";
import { readStructuredResult } from "./structured.js";
import { NARRATIVE_SYSTEM, applyNarrative, buildNarrativePrompt, llmNarrativeWriter, parseRunNarrative } from "./narrative.js";
import { llmDecide } from "../experience/agent.js";
import { confidenceOf, decideRunVerdict } from "../experience/verdict.js";
import { verifyReport } from "../report/selfcheck.js";
import { createHash } from 'node:crypto';
import { describeSnapshots } from "./snapshots.js";
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
        handler: invocation => execute(invocation, ctx),
    }), 'command-test lifecycle');
}
/**
 * Execute one `/test` invocation.
 * @param invocation - the parsed invocation.
 * @returns the human-facing outcome.
 */
/**
 * Annotate the report with the configured model's interpretation of its own
 * recorded facts. A missing service or a failed call leaves the report
 * complete and reports the reason to the caller; the narrative is never
 * allowed to fail the run.
 * @param ctx - the registrant context carrying the optional llm service.
 * @param model - the report model the run produced.
 * @param config - the loaded suite configuration.
 * @param signal - caller-owned cancellation.
 * @returns the annotated model and a note describing anything that went wrong.
 */
async function annotate(ctx, model, config, signal) {
    const route = config.report?.narrative;
    if (route === undefined)
        return { model, note: '' };
    const llm = ctx.get('llm');
    if (llm === undefined)
        return { model, note: ' Model interpretation was requested but no llm service is mounted.' };
    try {
        const reply = await llmNarrativeWriter(llm, route)({ system: NARRATIVE_SYSTEM, prompt: buildNarrativePrompt(model), signal });
        return { model: applyNarrative(model, parseRunNarrative(reply)), note: '' };
    }
    catch (error) {
        return { model, note: ' Model interpretation failed: ' + (error instanceof Error ? error.message : String(error)) };
    }
}
async function execute(invocation, ctx) {
    const argument = invocation.rawInput.trim();
    if (argument === 'auto') {
        const directory = invocation.agent.session.header.cwd ?? process.cwd();
        const detection = await detectProject(directory);
        const suitePath = resolve(directory, DEFAULT_CONFIG);
        let declared;
        try {
            declared = { path: suitePath, cases: (await loadSuiteConfig(suitePath)).cases.length };
        }
        catch {
            // No readable suite in this directory, so detection proposes one instead.
            declared = undefined;
        }
        return { kind: 'success', text: describeDetection(detection, directory, declared) };
    }
    const workspace = invocation.agent.session.header.cwd ?? process.cwd();
    const configPath = resolve(workspace, argument.length === 0 ? DEFAULT_CONFIG : argument);
    // The workspace is the execution root: case commands already run there, so a
    // suite that lives elsewhere still resolves its relative artifact paths
    // against the workspace. A reader who pointed at another project's suite has
    // to be told which root was used, or a missing artifact looks like a bug.
    const suiteNote = dirname(configPath) === workspace
        ? ''
        : `\nNote: ${configPath} is outside the workspace, so its relative paths (result.path, outputPath, historyPath) resolve against ${workspace}.`;
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
    // One decision function for every goal-driven journey in this run.
    const agentRoute = config.report?.narrative;
    const agentLlm = ctx.get('llm');
    const agentDecide = agentRoute === undefined || agentLlm === undefined ? undefined : llmDecide(agentLlm, agentRoute);
    const outputPath = resolve(workspace, config.report?.outputPath ?? 'test-observatory-report.html');
    const experienceSection = config.journeys === undefined
        ? undefined
        : toExperienceSection(await runExperience({
            journeys: config.journeys,
            signal: invocation.signal,
            // A journey that declares a goal is driven by the agent, which needs the
            // same model route the narrative uses. Without one, the journey reports
            // that it could not run rather than passing vacuously.
            ...(agentDecide === undefined ? {} : { agentDecide }),
        }));
    const structuredTests = [];
    const snapshotCounts = [];
    for (const outcome of outcomes) {
        if (outcome.testCase.result === undefined)
            continue;
        try {
            const read = await readStructuredResult(outcome.testCase.result, outcome.testCase, workspace);
            structuredTests.push(...read.tests);
            if (read.snapshots !== undefined)
                snapshotCounts.push(read.snapshots);
        }
        catch (error) {
            // A declared structured result that cannot be read means the suite and
            // the artifacts on disk disagree. That is a fact about this one case, so
            // it is reported as a failed row rather than thrown away with the whole
            // report for the cases that did run.
            structuredTests.push({
                kind: 'test',
                name: outcome.testCase.name,
                path: outcome.testCase.result.path,
                status: 'failed',
                suite: outcome.testCase.suite ?? 'Suite',
                durationSeconds: Math.round(outcome.durationMs / 10) / 100,
                owner: outcome.testCase.owner ?? 'Unassigned',
                error: 'declared structured result could not be read: ' + (error instanceof Error ? error.message : String(error)),
            });
        }
    }
    const snapshotSentence = snapshotCounts.length === 0 ? undefined : describeSnapshots(snapshotCounts.reduce((total, counts) => ({
        matched: total.matched + counts.matched,
        added: total.added + counts.added,
        unmatched: total.unmatched + counts.unmatched,
        updated: total.updated + counts.updated,
        unchecked: total.unchecked + counts.unchecked,
        total: Math.max(total.total, counts.total),
    }), { matched: 0, added: 0, unmatched: 0, updated: 0, unchecked: 0, total: 0 }));
    let model = buildReportModel(outcomes, {
        config,
        runAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        runId: String(Date.now()).slice(-6),
        branch: '',
        commit: '',
        environment: 'local',
        ...(experienceSection === undefined ? {} : { experienceSection }),
        ...(structuredTests.length === 0 ? {} : { structuredTests }),
        ...(snapshotSentence === undefined ? {} : { snapshots: snapshotSentence }),
    });
    const historyPath = config.report?.historyPath;
    if (historyPath !== false) {
        try {
            const projection = await projectHistory(resolve(workspace, historyPath ?? '.test-observatory/history.json'), model);
            // History only ever reports the statuses a run produced, so a flaky count
            // here would be an inference this module cannot support. The instability
            // signal the report carries is the per-test attempt count a framework
            // itself reported (a test that needed more than one try), not a verdict.
            const executed = projection.tests.filter(test => test.kind === 'test');
            const historyCounts = { passed: executed.filter(test => test.status === 'passed').length, failed: executed.filter(test => test.status === 'failed').length, skipped: executed.filter(test => test.status === 'skipped').length, flaky: executed.filter(test => test.status === 'flaky').length };
            const findings = projection.tests.filter(test => test.kind === 'finding' && test.status === 'failed').length;
            const retried = executed.filter(test => (test.attempts ?? 1) > 1).length;
            const passRate = model.summary.total === 0 ? 0 : Math.round(historyCounts.passed / model.summary.total * 1000) / 10;
            const hasRisk = historyCounts.failed > 0 || historyCounts.flaky > 0 || retried > 0;
            model = {
                ...model,
                trend: projection.trend,
                regressions: projection.regressions,
                recovered: projection.recovered,
                tests: projection.tests,
                causes: historyCounts.failed > 0
                    ? [{ label: 'Failed structured test', count: historyCounts.failed }]
                    : findings > 0 ? [{ label: 'Open static-analysis result', count: findings }] : [],
                slowest: [...executed].sort((left, right) => right.durationSeconds - left.durationSeconds).slice(0, 10).map((test, index) => ({ rank: index + 1, name: test.name, suite: test.suite, durationSeconds: test.durationSeconds })),
                summary: { ...model.summary, ...historyCounts, findings },
                verdict: (() => {
                    const experienceScore = experienceSection?.experience.total;
                    const testScore = Math.round(passRate);
                    const combinedScore = experienceScore === undefined ? testScore : Math.min(testScore, experienceScore);
                    const experienceRisk = experienceScore !== undefined && experienceScore < 100;
                    const headline = historyCounts.failed > 0
                        ? historyCounts.failed + ' tests failed.'
                        : findings > 0
                            ? 'Every executed test passed; ' + findings + ' static-analysis result(s) need review.'
                            : retried > 0
                                ? retried + ' test(s) passed only after a retry.'
                                : findings > 0 ? 'Every executed test passed; ' + findings + ' static-analysis result(s) need review.'
                                    : experienceRisk ? 'Every executed test passed; the browser run recorded findings.' : 'Every test passed.';
                    const needsReview = hasRisk || experienceRisk;
                    return {
                        ...model.verdict,
                        score: combinedScore,
                        headline,
                        label: needsReview ? 'Suite needs review' : 'Suite passing',
                        summary: historyCounts.failed > 0 ? 'Review the failing tests before release.' : retried > 0 ? 'At least one test needed more than one attempt; treat its result as provisional.' : experienceRisk ? 'The executed tests passed. The browser run recorded findings the tests do not cover.' : 'The test suite completed without failures.',
                        confidence: passRate + '% test pass rate' + (findings > 0 ? ' · ' + String(findings) + ' open finding(s)' : ''),
                        risk: historyCounts.failed > 0 ? 'Historical comparison found tests that passed in the previous run and fail now.' : retried > 0 ? 'Historical comparison found tests that needed a retry, which a single run cannot distinguish from flakiness.' : experienceRisk ? 'No test failed. The browser run recorded findings the tests do not cover; inspect them before release.' : 'No failing test in this run.',
                    };
                })(),
                kpis: [
                    { label: 'Pass rate', value: passRate + '%', delta: historyCounts.passed + ' of ' + model.summary.total, ...(hasRisk ? { worse: true } : {}) },
                    { label: 'Total tests', value: String(model.summary.total), delta: model.summary.total + ' observed' },
                    model.kpis[2],
                    findings > 0 && historyCounts.failed + retried === 0
                        ? { label: 'Scan findings', value: String(findings), delta: 'not tests', worse: true }
                        : { label: 'Needs review', value: String(historyCounts.failed + retried), delta: historyCounts.failed > 0 ? historyCounts.failed + ' failed' : retried > 0 ? retried + ' retried' : 'none', ...(hasRisk ? { worse: true } : {}) },
                ],
            };
        }
        catch (error) {
            return { kind: 'error', text: `test history could not be updated: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    // The run verdict consumes the journeys' own verdicts and every finding the
    // browser recorded, so a cleared suite cannot read as a cleared product.
    const verdictInputs = {
        journeys: (experienceSection?.journeys ?? []).map(journey => ({ verdict: journey.verdict ?? 'INCONCLUSIVE', persona: journey.personaId })),
        findings: (experienceSection?.checks ?? []).map(check => ({ severity: check.severity, family: check.family, persona: check.persona })),
        failingTests: model.summary.failed,
        coverageKnown: model.summary.coveragePercent !== null,
        commit: model.meta.commit,
    };
    // A trend, a regression and a recovery are all claims about two runs of the
    // same code. Without a commit there is no way to know that, so the report
    // states what this run did instead of comparing it with runs it cannot place.
    if (model.meta.commit.length === 0 && (model.trend.length > 0 || model.regressions.length > 0 || model.recovered.length > 0)) {
        model = { ...model, trend: [], regressions: [], recovered: [] };
    }
    const runDecision = decideRunVerdict(verdictInputs);
    model = { ...model, verdict: { ...model.verdict, label: runDecision.verdict, confidence: confidenceOf(verdictInputs), reasons: [...runDecision.reasons] } };
    // A report is a claim about a product, so it is checked against its own data
    // before it is handed over rather than after somebody acts on it.
    // Every capture is placed in the run that produced it and linked to the
    // findings measured on the same page, so a reader can go from a picture to
    // the rule it is evidence for and back.
    model = {
        ...model,
        evidence: (model.evidence ?? []).map(shot => ({
            ...shot,
            provenance: {
                runId: model.meta.runId,
                capturedAt: model.meta.runAt,
                artifactHash: createHash('sha256').update(shot.imageDataUri ?? '').digest('hex').slice(0, 16),
                findingRules: (model.checks ?? []).filter(check => check.persona === shot.personaId).map(check => check.rule),
            },
        })),
    };
    const violations = verifyReport(model);
    const annotated = await annotate(ctx, model, config, invocation.signal);
    model = annotated.model;
    const document = renderReport(model);
    try {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, document, 'utf8');
    }
    catch (error) {
        return { kind: 'error', text: `report could not be written to ${outputPath}: ${error instanceof Error ? error.message : String(error)}` };
    }
    const failedTests = model.tests.filter(test => test.kind === 'test' && test.status === 'failed');
    const openFindings = model.tests.filter(test => test.kind === 'finding' && test.status === 'failed');
    const retriedCount = model.tests.filter(test => test.kind === 'test' && (test.attempts ?? 1) > 1).length;
    const unstable = retriedCount === 0 ? '' : ` ${retriedCount} passed only on retry.`;
    const findingLine = openFindings.length === 0 ? '' : ` ${openFindings.length} static-analysis result(s) need review, not tests.`;
    const selfCheck = violations.length === 0
        ? ''
        : ' The report contradicts itself: ' + violations.map(violation => violation.rule).join(', ') + '.';
    const headline = `${model.summary.passed}/${model.summary.total} tests passed.${unstable}${findingLine} Report: ${outputPath}${annotated.note}${selfCheck}`;
    const detail = failedTests.length === 0
        ? ''
        : `\nFailed: ${failedTests.map(test => test.name).join(', ')}`;
    return { kind: 'success', text: headline + detail + suiteNote };
}
