// Coverage for duplicate-evidence detection. Two journeys that open the same
// page capture byte-identical images; presenting both as separate evidence
// claims two observations where the run made one.
import { describe, expect, it } from 'vitest'
import { findDuplicateEvidence } from '../src/experience/integrity.ts'

describe('duplicate evidence', () => {
  it('names the earlier capture a repeat points at', () => {
    const duplicates = findDuplicateEvidence([
      { id: 'evidence-1', imageDataUri: 'data:image/png;base64,AAAA' },
      { id: 'evidence-2', imageDataUri: 'data:image/png;base64,BBBB' },
      { id: 'evidence-3', imageDataUri: 'data:image/png;base64,AAAA' },
    ])
    expect(duplicates).toEqual([{ id: 'evidence-3', firstId: 'evidence-1' }])
  })

  it('reports nothing when every capture differs', () => {
    expect(findDuplicateEvidence([
      { id: 'a', imageDataUri: 'data:image/png;base64,AAAA' },
      { id: 'b', imageDataUri: 'data:image/png;base64,BBBB' },
    ])).toEqual([])
  })

  it('points every later repeat at the first capture, not at its predecessor', () => {
    const same = 'data:image/png;base64,AAAA'
    expect(findDuplicateEvidence([
      { id: 'a', imageDataUri: same },
      { id: 'b', imageDataUri: same },
      { id: 'c', imageDataUri: same },
    ])).toEqual([{ id: 'b', firstId: 'a' }, { id: 'c', firstId: 'a' }])
  })
})
