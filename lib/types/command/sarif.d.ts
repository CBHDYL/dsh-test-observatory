/**
 * SARIF 2.1.0 parsing.
 *
 * SARIF is the only findings format standardised by a standards body, which is
 * why several unrelated tools — linters, vulnerability scanners, security
 * analysers — can all be read through this one parser. Each result becomes a
 * report row so a lint or security finding appears beside the tests rather than
 * in a separate tool nobody opens.
 *
 * The version is checked rather than assumed: 2.2 has not been released, so a
 * document claiming it is a producer error worth surfacing.
 * @module @cbhdyl/dsh-test-observatory/command/sarif
 */
/** One finding parsed from a SARIF document. */
export interface SarifFinding {
    /** Rule id, falling back to the tool name when the document names no rule. */
    readonly rule: string;
    /** Result level: error and warning fail, note and none do not. */
    readonly level: 'error' | 'warning' | 'note' | 'none';
    /** Human-readable message. */
    readonly message: string;
    /** Source file, when the location reports one. */
    readonly file?: string;
    /** One-based line, when the location reports one. */
    readonly line?: number;
}
/**
 * Turn the location a scanner reports into a path a reader can compare with
 * their own tree.
 *
 * Scanners report a URI, and several — Ruff among them — report an absolute
 * `file://` one, which says nothing about where the file sits in the project.
 * The workspace prefix is therefore stripped when the location is inside it, and
 * a relative location is kept as it is.
 * @param uri - the reported location.
 * @param root - absolute workspace path, without a trailing separator.
 * @returns a workspace-relative path, or the original when it is not inside.
 */
export declare function normaliseLocation(uri: string, root: string | undefined): string;
/**
 * Parse a SARIF 2.1.0 document into findings.
 * @param value - the parsed JSON document.
 * @returns every finding the document reports.
 * @throws when the document is not SARIF, or declares a version this parser does
 *   not implement.
 */
export declare function parseSarif(value: unknown, workspace?: string): SarifFinding[];
