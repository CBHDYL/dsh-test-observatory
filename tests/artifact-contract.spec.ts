// @vitest-environment jsdom
// The published entry points resolve to `lib/`, so this spec renders through the
// built bundle. Every other report spec imports `../src/report/render.ts`, which
// proves the sources are right and says nothing about the document a reader
// opens — the two drifted once and shipped a report that painted nothing.
//
// A negative control mutates the rendered document into the exact failure that
// shipped, so the assertions are known to be able to fail.
import { describe, expect, it } from 'vitest'
import { renderReport } from '../lib/report/index.js'
import { inspect, reportModel } from './support/report-inspection.ts'

describe('the built report package', () => {
  it('navigates only to pages the document contains', () => {
    const seen = inspect(renderReport(reportModel()))
    expect([...new Set(seen.documentPages)].sort()).toEqual([...seen.navPages].sort())
    expect([...new Set(seen.documentPages)].sort()).toEqual([...seen.scriptPages].sort())
  })

  it('opens on one painted page instead of hiding every page', () => {
    const seen = inspect(renderReport(reportModel()))
    expect([...new Set(seen.active)]).toEqual([seen.scriptPages[0]])
    expect(seen.activeTextLength).toBeGreaterThan(500)
    expect(seen.activeText).toContain('Headline')
  })

  it('carries provenance for every capture it shows', () => {
    const source = reportModel()
    const html = renderReport(source)
    for (const shot of source.evidence ?? []) {
      expect(html).toContain(shot.provenance?.artifactHash ?? 'missing-provenance')
    }
  })

  it('rejects a document whose pages are all hidden, the way the shipped one once was', () => {
    // The negative control: this is the exact defect that reached a reader. The
    // classes below are what the client script sets; removing them leaves the
    // stylesheet rule [data-page]:not(.page-active){display:none} hiding everything.
    const blank = renderReport(reportModel()).replaceAll('page-active', 'page-hidden')
    const seen = inspect(blank)
    expect(seen.active).toEqual([])
    expect(seen.activeTextLength).toBe(0)
  })
})
