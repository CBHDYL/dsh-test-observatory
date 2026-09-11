// Snapshot counts from a report. The field names and the values each one takes
// were read from a real Vitest JSON report, not from documentation, and the
// assertions below use those observed values.
import { describe, expect, it } from 'vitest'
import { describeSnapshots, hasUnreviewedBaselines, readSnapshotCounts } from '../src/command/snapshots.ts'

/** A report document declaring the given snapshot block. */
function report(snapshot: unknown): unknown {
  return { numTotalTests: 2, snapshot, testResults: [] }
}

describe('readSnapshotCounts', () => {
  it('reads the block a first run writes', () => {
    // Observed on a run that created two baselines.
    const counts = readSnapshotCounts(report({ added: 2, matched: 0, unmatched: 0, updated: 0, unchecked: 0, total: 2, filesUnmatched: 0 }))
    expect(counts).toMatchObject({ added: 2, matched: 0, unmatched: 0, unchecked: 0, total: 2 })
  })

  it('reads a mismatch, which is the value that demands attention', () => {
    // Observed on a second run where one baseline no longer matched.
    const counts = readSnapshotCounts(report({ added: 0, matched: 1, unmatched: 1, updated: 0, unchecked: 2, total: 2, filesUnmatched: 0 }))
    expect(counts?.unmatched).toBe(1)
    expect(counts?.matched).toBe(1)
  })

  it('counts a stale baseline as unchecked', () => {
    // Observed after deleting a test that had a baseline.
    const counts = readSnapshotCounts(report({ added: 0, matched: 1, unmatched: 0, updated: 0, unchecked: 3, total: 1, filesUnmatched: 0 }))
    expect(counts?.unchecked).toBe(3)
  })

  it('adds the per-file unmatched count to the unchecked total', () => {
    const counts = readSnapshotCounts(report({ unchecked: 1, filesUnmatched: 2 }))
    expect(counts?.unchecked).toBe(3)
  })

  it('reports undefined when the report has no snapshot block', () => {
    expect(readSnapshotCounts(report(undefined))).toBeUndefined()
    expect(readSnapshotCounts({})).toBeUndefined()
    expect(readSnapshotCounts(report([]))).toBeUndefined()
  })

  it('reports undefined for a value that is not a report', () => {
    expect(readSnapshotCounts(null)).toBeUndefined()
    expect(readSnapshotCounts('nope')).toBeUndefined()
  })

  it('treats a missing, negative or non-numeric field as zero', () => {
    const counts = readSnapshotCounts(report({ matched: 'many', unmatched: -1, total: 2.7 }))
    expect(counts).toMatchObject({ matched: 0, unmatched: 0, total: 2 })
  })

  it('floors a fractional count', () => {
    expect(readSnapshotCounts(report({ matched: 1.9 }))?.matched).toBe(1)
  })
})

describe('hasUnreviewedBaselines', () => {
  it('is true when a baseline was written rather than compared', () => {
    expect(hasUnreviewedBaselines({ matched: 0, added: 1, unmatched: 0, updated: 0, unchecked: 0, total: 1 })).toBe(true)
    expect(hasUnreviewedBaselines({ matched: 0, added: 0, unmatched: 0, updated: 0, unchecked: 1, total: 1 })).toBe(true)
    expect(hasUnreviewedBaselines({ matched: 0, added: 0, unmatched: 0, updated: 1, unchecked: 0, total: 1 })).toBe(true)
  })

  it('is false when everything was compared', () => {
    expect(hasUnreviewedBaselines({ matched: 4, added: 0, unmatched: 0, updated: 0, unchecked: 0, total: 4 })).toBe(false)
  })
})

describe('describeSnapshots', () => {
  it('says nothing when the report had no snapshots', () => {
    expect(describeSnapshots(undefined)).toBeUndefined()
    expect(describeSnapshots({ matched: 0, added: 0, unmatched: 0, updated: 0, unchecked: 0, total: 0 })).toBeUndefined()
  })

  it('names a mismatch in the terms a reader needs', () => {
    const sentence = describeSnapshots({ matched: 1, added: 0, unmatched: 2, updated: 0, unchecked: 0, total: 3 })
    expect(sentence).toContain('2 did not match')
  })

  it('does not describe a written baseline as verified', () => {
    // Nothing compared a freshly written baseline to anything, so the wording
    // must not imply it was checked.
    const sentence = describeSnapshots({ matched: 0, added: 2, unmatched: 0, updated: 0, unchecked: 2, total: 2 })
    expect(sentence).toContain('written for the first time')
    expect(sentence).toContain('not compared')
    expect(sentence).not.toContain('verified')
    expect(sentence).not.toContain('passed')
  })

  it('explains that an unchecked entry may mean the test is gone', () => {
    const sentence = describeSnapshots({ matched: 1, added: 0, unmatched: 0, updated: 0, unchecked: 3, total: 1 })
    expect(sentence).toContain('its test is gone')
  })

  it('lists every kind of change at once', () => {
    const sentence = describeSnapshots({ matched: 1, added: 1, unmatched: 1, updated: 1, unchecked: 1, total: 4 })
    expect(sentence).toContain('1 compared')
    expect(sentence).toContain('1 did not match')
    expect(sentence).toContain('1 written for the first time')
    expect(sentence).toContain('1 refreshed')
    expect(sentence).toContain('1 not compared')
  })
})
