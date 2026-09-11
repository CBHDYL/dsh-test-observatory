// JUnit XML dialects. This format has no specification, so each entry here is a
// shape a real producer emits — and the traps are the point: a truncated
// document reads as a fully passing run unless truncation is treated as an error.
import { describe, expect, it } from 'vitest'
import { parseJUnitDocument } from '../src/command/junit.ts'

describe('parseJUnitDocument', () => {
  it('reads a root testsuites document', () => {
    const cases = parseJUnitDocument('<testsuites><testsuite name="unit"><testcase name="a" classname="pkg.mod" time="0.25"/></testsuite></testsuites>')
    expect(cases).toHaveLength(1)
    expect(cases[0]).toMatchObject({ name: 'a', classname: 'pkg.mod', status: 'passed', durationSeconds: 0.25 })
  })

  it('reads a root testsuite document, which Surefire emits', () => {
    const cases = parseJUnitDocument('<testsuite name="unit"><testcase name="a" classname="pkg.Mod"/></testsuite>')
    expect(cases.map(entry => entry.name)).toEqual(['a'])
  })

  it('reads a self-closing failure, which Pytest emits', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="fails"><failure message="assert 1 == 2"/></testcase></testsuite>')
    expect(cases[0]).toMatchObject({ status: 'failed', error: 'assert 1 == 2' })
  })

  it('prefers a failure body over its message attribute', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="fails"><failure message="short">long\nstack</failure></testcase></testsuite>')
    expect(cases[0]?.error).toBe('long\nstack')
  })

  it('unwraps a CDATA failure body', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="fails"><failure><![CDATA[expected 2, got 3]]></failure></testcase></testsuite>')
    expect(cases[0]?.error).toBe('expected 2, got 3')
  })

  it('counts an error element as a failure', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="errors"><error message="boom"/></testcase></testsuite>')
    expect(cases[0]?.status).toBe('failed')
  })

  it('reads a skipping case as skipped in both forms', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="a"><skipped/></testcase><testcase name="b"><skipped message="later"/></testcase></testsuite>')
    expect(cases.map(entry => entry.status)).toEqual(['skipped', 'skipped'])
  })

  it('decodes the XML entities a case name may carry', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="a &lt; b &amp; c"/></testsuite>')
    expect(cases[0]?.name).toBe('a < b & c')
  })

  it('skips a case that declares no name rather than inventing one', () => {
    const cases = parseJUnitDocument('<testsuite><testcase classname="pkg.mod"/><testcase name="real"/></testsuite>')
    expect(cases.map(entry => entry.name)).toEqual(['real'])
  })

  it('omits the duration when the attribute is absent or unusable', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="a"/><testcase name="b" time="nonsense"/></testsuite>')
    expect(cases[0]?.durationSeconds).toBeUndefined()
    expect(cases[1]?.durationSeconds).toBeUndefined()
  })

  it('reads rerun attempts without changing the outcome', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="wobbles"><flakyFailure message="first try"/></testcase></testsuite>')
    expect(cases[0]).toMatchObject({ status: 'passed', attempts: 2 })
  })

  it('counts several reruns', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="wobbles"><flakyFailure/><rerunFailure/><rerunFailure/></testcase></testsuite>')
    expect(cases[0]?.attempts).toBe(4)
  })

  it('reports no attempts for a case that ran once', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="steady"/></testsuite>')
    expect(cases[0]?.attempts).toBeUndefined()
  })

  it('rejects a truncated document instead of reporting every case as passing', () => {
    // The document stops before its closing tag: its cases would otherwise all
    // read as passes, which is the format's most dangerous failure mode.
    const truncated = '<testsuites><testsuite name="unit"><testcase name="a"/><testcase name="b"'
    expect(() => parseJUnitDocument(truncated)).toThrow(/truncated/)
  })

  it('accepts a document whose root closes', () => {
    expect(() => parseJUnitDocument('<testsuites><testsuite><testcase name="a"/></testsuite></testsuites>')).not.toThrow()
  })

  it('returns nothing for a document with no cases', () => {
    expect(parseJUnitDocument('<testsuites></testsuites>')).toEqual([])
  })

  it('preserves document order', () => {
    const cases = parseJUnitDocument('<testsuite><testcase name="z"/><testcase name="a"/><testcase name="m"/></testsuite>')
    expect(cases.map(entry => entry.name)).toEqual(['z', 'a', 'm'])
  })
})
