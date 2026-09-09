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
        outcomes.push(await runCase(testCase, invocation.signal));
    }
    const outputPath = resolve(workspace, config.report?.outputPath ?? 'test-observatory-report.html');
    const experienceSection = config.journeys === undefined
        ? undefined
        : toExperienceSection(await runExperience({ journeys: config.journeys, signal: invocation.signal }));
    const model = buildReportModel(outcomes, {
        config,
        runAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        runId: String(Date.now()).slice(-6),
        branch: '',
        commit: '',
        environment: 'local',
        ...(experienceSection === undefined ? {} : { experienceSection }),
    });
    const document = renderReport(model);
    try {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, document, 'utf8');
    }
    catch (error) {
        return { kind: 'error', text: `report could not be written to ${outputPath}: ${error instanceof Error ? error.message : String(error)}` };
    }
    const failed = outcomes.filter(outcome => !outcome.passed);
    const headline = `${outcomes.length - failed.length}/${outcomes.length} passed. Report: ${outputPath}`;
    return failed.length === 0
        ? { kind: 'success', text: headline }
        : { kind: 'success', text: `${headline}\nFailed: ${failed.map(outcome => outcome.testCase.name).join(', ')}` };
}
