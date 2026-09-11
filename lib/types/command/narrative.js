/**
 * Model-written interpretation of the facts one run captured.
 *
 * The model reads a bounded digest of what the browser and the test runners
 * already recorded and returns prose about it. It cannot add a fact: every
 * interpretation is keyed to a finding the run produced, and an interpretation
 * for a rule the run did not report is discarded. A run without a configured
 * model route carries no narrative at all, and the report says so by omitting
 * the section rather than by filling it with a template.
 * @module @cbhdyl/dsh-test-observatory/command/narrative
 */
/** Characters of one finding's evidence the digest carries. */
const DIGEST_DETAIL_LIMIT = 400;
/** Findings the digest carries, so a noisy scan cannot grow the request without bound. */
export const DIGEST_FINDING_LIMIT = 40;
/**
 * The instruction for one narrative call. It states the output contract, the
 * grounding rule, and the refusal the model must use instead of inventing.
 */
export const NARRATIVE_SYSTEM = [
    'You explain one software test run to the people who have to act on it.',
    'You receive a JSON digest of facts the run recorded. Every statement you make must be',
    'derived from that digest.',
    '',
    'Rules:',
    '- Never name an element, selector, URL, endpoint, file, or product behaviour that is absent from the digest.',
    '- Never claim a test passed or failed unless the digest says so.',
    '- Never propose a fix that needs a fact you were not given; say what to inspect instead.',
    '- The scan findings in the digest were not executed as tests. Never call one a failing test.',
    '- Write in plain present tense, one idea per sentence, no marketing language.',
    '',
    'Reply with JSON and nothing else:',
    '{"risk":"<one sentence>","findings":[{"rule":"<rule id from the digest>","interpretation":"<what it means for a user>","nextAction":"<what to change or inspect>"}]}',
    'Include one findings entry per digest finding you can explain, and omit the rest.',
].join('\n');
/**
 * Build a writer that asks the run's declared route for the narrative. Only
 * text deltas are read; reasoning and tool-call deltas are not narrative.
 * @param llm - the harness llm service.
 * @param route - the provider and model the run declared.
 * @returns the writer the command calls.
 */
export function llmNarrativeWriter(llm, route) {
    return async (request) => {
        let text = '';
        for await (const chunk of llm.stream({
            provider: route.provider,
            model: route.model,
            system: request.system,
            messages: [{ role: 'user', content: request.prompt }],
            signal: request.signal,
        })) {
            if (chunk.type === 'text-delta' && typeof chunk.text === 'string')
                text += chunk.text;
        }
        return text;
    };
}
/** Trim one evidence string to the digest budget. */
function clip(text) {
    return text.length <= DIGEST_DETAIL_LIMIT ? text : text.slice(0, DIGEST_DETAIL_LIMIT) + '…';
}
/**
 * Serialize the run's recorded facts for one narrative call. Only facts the
 * report already shows are included, so the model can never learn more than the
 * reader does.
 * @param model - the report model the run produced.
 * @returns the JSON digest the model receives.
 */
export function buildNarrativePrompt(model) {
    const executed = model.tests.filter(test => test.kind === 'test');
    const digest = {
        run: { project: model.meta.project, environment: model.meta.environment },
        counts: {
            testsExecuted: model.summary.total,
            passed: model.summary.passed,
            failed: model.summary.failed,
            skipped: model.summary.skipped,
            openScanFindings: model.summary.findings,
            durationSeconds: model.summary.durationSeconds,
        },
        failingTests: executed
            .filter(test => test.status === 'failed')
            .slice(0, 10)
            .map(test => ({ name: test.name, path: test.path, suite: test.suite, framework: test.framework ?? 'unknown', error: clip(test.error ?? '') })),
        openFindings: (model.checks ?? []).slice(0, DIGEST_FINDING_LIMIT).map(check => ({
            rule: check.rule,
            family: check.family,
            severity: check.severity,
            observation: clip(check.detail),
            page: check.persona,
            elements: (check.evidence ?? []).map(element => ({ selector: element.selector, text: clip(element.text ?? '') })),
        })),
        experience: model.experience === undefined ? null : {
            score: model.experience.total,
            tasksObserved: model.experience.tasksObserved,
            tasksCompleted: model.experience.tasksCompleted,
            dimensions: model.experience.dimensions.map(dimension => ({ label: dimension.label, earned: dimension.earned, available: dimension.available })),
        },
    };
    return JSON.stringify(digest, null, 1);
}
/** Reject a narrative field that is not usable prose. */
function prose(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`narrative ${field} must be a non-empty string`);
    return value.trim();
}
/**
 * Parse one model reply into the accepted narrative. The reply must be a JSON
 * object carrying a non-empty `risk`; anything else is a contract violation the
 * caller reports rather than a narrative it half-applies.
 * @param text - the model's reply.
 * @returns the parsed narrative.
 * @throws when the reply is not the contracted JSON object.
 */
export function parseRunNarrative(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start)
        throw new Error('narrative reply contains no JSON object');
    let parsed;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    }
    catch (error) {
        throw new Error('narrative reply is not valid JSON: ' + (error instanceof Error ? error.message : String(error)));
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('narrative reply must be a JSON object');
    const record = parsed;
    const rawFindings = record['findings'];
    if (rawFindings !== undefined && !Array.isArray(rawFindings))
        throw new Error('narrative findings must be an array when present');
    const findings = [];
    for (const raw of Array.isArray(rawFindings) ? rawFindings : []) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
            continue;
        const entry = raw;
        const rule = typeof entry['rule'] === 'string' ? entry['rule'].trim() : '';
        const interpretation = typeof entry['interpretation'] === 'string' ? entry['interpretation'].trim() : '';
        const nextAction = typeof entry['nextAction'] === 'string' ? entry['nextAction'].trim() : '';
        if (rule.length === 0 || interpretation.length === 0 || nextAction.length === 0)
            continue;
        findings.push({ rule, interpretation, nextAction });
    }
    return { risk: prose(record['risk'], 'risk'), findings };
}
/**
 * Merge an accepted narrative into the report. An interpretation is attached
 * only to a finding whose rule the run reported, so the model cannot introduce
 * a finding that did not happen.
 * @param model - the report model to annotate.
 * @param narrative - the accepted narrative.
 * @returns the annotated model.
 */
export function applyNarrative(model, narrative) {
    const byRule = new Map(narrative.findings.map(finding => [finding.rule, finding]));
    const checks = (model.checks ?? []).map((check) => {
        const match = byRule.get(check.rule);
        return match === undefined ? check : { ...check, interpretation: match.interpretation, nextAction: match.nextAction };
    });
    return {
        ...model,
        checks,
        verdict: { ...model.verdict, narrative: narrative.risk },
    };
}
