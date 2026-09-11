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
  readonly rule: string
  /** Result level: error and warning fail, note and none do not. */
  readonly level: 'error' | 'warning' | 'note' | 'none'
  /** Human-readable message. */
  readonly message: string
  /** Source file, when the location reports one. */
  readonly file?: string
  /** One-based line, when the location reports one. */
  readonly line?: number
}

/** Result levels this parser accepts. */
const LEVELS = new Set(['error', 'warning', 'note', 'none'])

/** Read a string field from an unknown value. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Read an object field from an unknown value. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Read an array field from an unknown value. */
function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

/** Read a finite number from an unknown value. */
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Parse a SARIF 2.1.0 document into findings.
 * @param value - the parsed JSON document.
 * @returns every finding the document reports.
 * @throws when the document is not SARIF, or declares a version this parser does
 *   not implement.
 */
export function parseSarif(value: unknown): SarifFinding[] {
  const document = record(value)
  if (document === undefined || text(document['version']) === undefined) {
    throw new Error('the artifact is not a SARIF document: it declares no version')
  }
  const version = text(document['version']) as string
  if (version !== '2.1.0') {
    throw new Error('unsupported SARIF version "' + version + '"; this parser implements 2.1.0')
  }
  const findings: SarifFinding[] = []
  for (const rawRun of array(document['runs'])) {
    const run = record(rawRun)
    if (run === undefined) continue
    const toolName = text(record(record(run['tool'])?.['driver'])?.['name']) ?? 'sarif'
    for (const rawResult of array(run['results'])) {
      const result = record(rawResult)
      if (result === undefined) continue
      const ruleId = text(result['ruleId']) ?? toolName
      const message = text(record(result['message'])?.['text'])
        ?? text(record(result['message'])?.['markdown'])
        ?? ruleId
      const declared = text(result['level'])
      const level = declared !== undefined && LEVELS.has(declared) ? declared as SarifFinding['level'] : 'warning'
      const location = record(array(result['locations'])[0])
      const physical = record(location?.['physicalLocation'])
      const artifact = record(physical?.['artifactLocation'])
      const region = record(physical?.['region'])
      const file = text(artifact?.['uri'])
      const line = count(region?.['startLine'])
      findings.push({
        rule: ruleId,
        level,
        message,
        ...(file === undefined ? {} : { file }),
        ...(line === undefined ? {} : { line }),
      })
    }
  }
  return findings
}
