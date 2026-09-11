/**
 * Accessibility scanning through axe-core. The library is injected into the
 * page and run there, so the scan sees the same rendered DOM the user does;
 * the result is mapped onto the report's violation vocabulary.
 *
 * axe reports, for every violation, the nodes that tripped it and a target
 * selector for each. Those targets and their measured rectangles are kept, so a
 * violation can be marked on a screenshot rather than only counted.
 * @module @deepseek-ai/dsh-experience-runner/a11y
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
/** Accessibility impact levels axe reports that block a task or degrade it. */
const BLOCKING = new Set(['critical', 'serious']);
/** Elements kept per violation, so one noisy rule cannot bloat the model. */
export const MAX_AXE_NODES = 10;
/** Longest visible-text excerpt kept on a node reference. */
const TEXT_LIMIT = 80;
/** Whether a run reports a structured axe payload. */
function asAxeReport(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const violations = value.violations;
    return Array.isArray(violations) ? value : undefined;
}
/** Whether a node's target is the observed selectors it claims to be. */
function targetsOf(node) {
    return Array.isArray(node.target) ? node.target.filter((entry) => typeof entry === 'string') : [];
}
/** Whether the node's target is the nested selector list axe may report. */
function nestedTargetsOf(node) {
    return Array.isArray(node.target)
        ? node.target.filter((entry) => Array.isArray(entry)).flat()
        : [];
}
/** The first selector axe reported for a node, when it reported any. */
function selectorOf(node) {
    const flat = targetsOf(node);
    const nested = nestedTargetsOf(node);
    return flat[0] ?? nested[0] ?? undefined;
}
/** A readable tag name inferred from the node's markup. */
function tagOf(node, selector) {
    const fromHtml = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(node.html ?? '')?.[1];
    if (fromHtml !== undefined)
        return fromHtml.toLowerCase();
    const fromSelector = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(selector ?? '')?.[1];
    return (fromSelector ?? 'element').toLowerCase();
}
/** The node's visible text, collapsed and truncated for display. */
function textOf(node) {
    const stripped = (node.html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped.length === 0)
        return undefined;
    return stripped.length > TEXT_LIMIT ? stripped.slice(0, TEXT_LIMIT) + '…' : stripped;
}
/** The element evidence for one axe node that reported a selector. */
function evidenceOf(node) {
    const selector = selectorOf(node);
    if (selector === undefined)
        return undefined;
    const text = textOf(node);
    const element = { tag: tagOf(node, selector), selector, ...(text === undefined ? {} : { text }) };
    // axe does not report geometry; a zero box states plainly that the rectangle
    // is unknown rather than guessing one.
    const box = { x: 0, y: 0, width: 0, height: 0, space: 'viewport' };
    return { element, box };
}
/**
 * Resolve the axe-core browser bundle path.
 * @returns the absolute path of the axe source file.
 */
function axePath() {
    const require = createRequire(import.meta.url);
    return require.resolve('axe-core/axe.min.js');
}
/**
 * Run an axe-core scan over the page's current state.
 * @param page - the page to scan.
 * @returns the violations, one per axe rule with the nodes that tripped it.
 */
export async function checkAccessibility(page) {
    const source = await readFile(axePath(), 'utf8');
    await page.addScriptTag({ content: source });
    const results = await page.evaluate(async () => {
        const axe = window.axe;
        const report = await axe.run(document);
        return report.violations.map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.map(node => ({
                ...(node.target === undefined ? {} : { target: node.target }),
                ...(node.html === undefined ? {} : { html: node.html }),
            })),
        }));
    });
    const report = asAxeReport({ violations: results });
    if (report === undefined)
        throw new Error('axe-core returned no structured violations');
    return report.violations.map(violation => {
        const evidence = violation.nodes
            .slice(0, MAX_AXE_NODES)
            .map(evidenceOf)
            .filter((entry) => entry !== undefined);
        return {
            rule: 'axe:' + violation.id,
            detail: violation.help + ' (' + String(violation.nodes.length) + ' node(s))',
            severity: violation.impact !== null && BLOCKING.has(violation.impact) ? 'high' : 'medium',
            evidence,
        };
    });
}
