// SARIF 2.1.0: the one findings format a standards body owns, and therefore the
// one parser that reads linters and vulnerability scanners alike.
import { describe, expect, it } from 'vitest'
import { parseSarif } from '../src/command/sarif.ts'

/** One minimal SARIF document wrapping the given results. */
function sarif(results: readonly unknown[], version = '2.1.0', toolName = 'ruff'): unknown {
  return { version, runs: [{ tool: { driver: { name: toolName } }, results }] }
}

describe('parseSarif', () => {
  it('reads a result with its rule, level, message and location', () => {
    const findings = parseSarif(sarif([{
      ruleId: 'F401',
      level: 'warning',
      message: { text: 'imported but unused' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/app.py' }, region: { startLine: 12 } } }],
    }]))
    expect(findings).toEqual([{ rule: 'F401', level: 'warning', message: 'imported but unused', file: 'src/app.py', line: 12 }])
  })

  it('falls back to the tool name when no rule is named', () => {
    const findings = parseSarif(sarif([{ level: 'error', message: { text: 'something' } }], '2.1.0', 'trivy'))
    expect(findings[0]?.rule).toBe('trivy')
  })

  it('falls back to the rule id when no message is given', () => {
    const findings = parseSarif(sarif([{ ruleId: 'E501', level: 'note' }]))
    expect(findings[0]?.message).toBe('E501')
  })

  it('treats an unstated level as a warning rather than as a pass', () => {
    const findings = parseSarif(sarif([{ ruleId: 'X', message: { text: 'm' } }]))
    expect(findings[0]?.level).toBe('warning')
  })

  it('ignores a level it does not recognise rather than dropping the finding', () => {
    const findings = parseSarif(sarif([{ ruleId: 'X', level: 'catastrophic', message: { text: 'm' } }]))
    expect(findings[0]?.level).toBe('warning')
  })

  it('reads results across several runs in one document', () => {
    const document = {
      version: '2.1.0',
      runs: [
        { tool: { driver: { name: 'ruff' } }, results: [{ ruleId: 'F401', message: { text: 'a' } }] },
        { tool: { driver: { name: 'trivy' } }, results: [{ ruleId: 'CVE-1', message: { text: 'b' } }] },
      ],
    }
    expect(parseSarif(document).map(finding => finding.rule)).toEqual(['F401', 'CVE-1'])
  })

  it('keeps a finding with no location', () => {
    const findings = parseSarif(sarif([{ ruleId: 'X', message: { text: 'm' } }]))
    expect(findings[0]?.file).toBeUndefined()
    expect(findings[0]?.line).toBeUndefined()
  })

  it('reads a markdown message when no plain text is given', () => {
    const findings = parseSarif(sarif([{ ruleId: 'X', message: { markdown: '**bold**' } }]))
    expect(findings[0]?.message).toBe('**bold**')
  })

  it('skips a run or result that is not an object', () => {
    const document = { version: '2.1.0', runs: [null, 'x', { tool: { driver: { name: 't' } }, results: [null, { ruleId: 'R', message: { text: 'm' } }] }] }
    expect(parseSarif(document).map(finding => finding.rule)).toEqual(['R'])
  })

  it('returns nothing for a document with no results', () => {
    expect(parseSarif(sarif([]))).toEqual([])
  })

  it('rejects a document that declares no version', () => {
    expect(() => parseSarif({ runs: [] })).toThrow(/declares no version/)
  })

  it('rejects a version it does not implement, naming the supported one', () => {
    // 2.2 has not been released; a producer claiming it is an error worth seeing.
    expect(() => parseSarif(sarif([], '2.2.0'))).toThrow(/unsupported SARIF version "2.2.0"/)
    expect(() => parseSarif(sarif([], '1.0.0'))).toThrow(/implements 2.1.0/)
  })

  it('rejects a value that is not an object at all', () => {
    expect(() => parseSarif('not sarif')).toThrow(/not a SARIF document/)
    expect(() => parseSarif(null)).toThrow(/not a SARIF document/)
  })
})
