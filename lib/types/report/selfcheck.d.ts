/**
 * Check a generated report against the claims it makes.
 *
 * Every one of these rules exists because the report once broke it: a count
 * that disagreed with the rows beneath it, a journey cleared with nothing
 * asserted, a verdict that ignored the findings on the page. A report is a
 * claim about a product, so the claim is checked before it is handed over
 * rather than after somebody acts on it.
 * @module @cbhdyl/dsh-test-observatory/report/selfcheck
 */
import type { ReportModel } from './types.ts';
/** One way a generated report contradicts itself. */
export interface SelfCheckViolation {
    /** Stable rule id. */
    readonly rule: string;
    /** What the report says and what the underlying data says. */
    readonly detail: string;
}
/**
 * Compare a report against its own data.
 *
 * Only contradictions between the document and the facts inside it are
 * reported. A report that establishes little is not a violation — saying so
 * plainly is the point — but a report that says two different things is.
 * @param model - the report about to be written.
 * @returns every contradiction found; an empty list means the report is coherent.
 */
export declare function verifyReport(model: ReportModel): readonly SelfCheckViolation[];
