/**
 * What each deterministic check rule requires and how a page satisfies it.
 *
 * A finding that only names a rule tells a reader that something is wrong and
 * nothing about what to change. Every rule this package emits therefore has one
 * entry here, and an axe rule either has one too or carries axe's own
 * description and documentation link, so no finding reaches the report without
 * a stated requirement.
 * @module @cbhdyl/dsh-test-observatory/experience/rules
 */
/** What one rule requires and how a page satisfies it. */
export interface RuleGuidance {
    /** The requirement the rule checks, stated as what must hold. */
    readonly requirement: string;
    /** The change that satisfies it, phrased against the observed evidence. */
    readonly fix: string;
    /** Authoritative page documenting the rule, when one exists. */
    readonly helpUrl?: string;
}
/**
 * The guidance for one reported rule.
 * @param rule - the rule id as it appears in the report.
 * @returns the guidance, or undefined when the rule carries its own description.
 */
export declare function guidanceFor(rule: string): RuleGuidance | undefined;
/**
 * The guidance for one axe violation, preferring this package's own wording and
 * falling back to the description axe reported with the violation.
 * @param id - the bare axe rule id.
 * @param description - axe's own description of what the rule checks.
 * @param helpUrl - axe's documentation link for the rule.
 * @returns the guidance shown beside the finding.
 */
export declare function axeGuidance(id: string, description: string, helpUrl: string | undefined): RuleGuidance;
