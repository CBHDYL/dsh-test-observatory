// Coverage for the model-written interpretation layer: what a run may ask a
// model, what it accepts back, and what it does when the route is missing or
// the call fails. The command-level cases reuse the stand-in context from
// tests/command-entry.spec.ts for the reason recorded there.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { describe, expect, it } from 'vitest'
import * as commandPlugin from '../src/command/index.ts'
import {
  DIGEST_FINDING_LIMIT,
  NARRATIVE_SYSTEM,
  applyNarrative,
  buildNarrativePrompt,
  llmNarrativeWriter,
  parseRunNarrative,
} from '../src/command/narrative.ts'
import type { NarrativeLlm } from '../src/command/narrative.ts'
import { renderReport } from '../src/report/render.ts'
import type { CheckFinding, ReportModel, ReportTest } from '../src/report/types.ts'

/** One finding the run recorded. */
function finding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    rule: 'axe:color-contrast',
    detail: 'Elements must meet minimum color contrast ratio thresholds (11 node(s))',
    severity: 'high',
    family: 'accessibility',
    persona: 'First-time visitor',
    evidence: [{ tag: 'button', selector: '#submit', text: 'Pay', box: { x: 0, y: 0, width: 10, height: 10, space: 'viewport' } }],
    ...overrides,
  } as CheckFinding
}

/** One executed test row. */
function test(overrides: Partial<ReportTest> = {}): ReportTest {
  return { kind: 'test', name: 'renders', path: 'a.test.ts', status: 'failed', suite: 'Unit', durationSeconds: 1, owner: 'Team', error: 'expected 1 to be 2', ...overrides }
}

/** A report model with the fields the digest reads. */
function model(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    meta: { project: 'Atlas', branch: '', commit: '', environment: 'local', runAt: 'now', runId: '1' },
    verdict: { score: 80, headline: 'h', label: 'l', summary: 's', confidence: 'c', risk: 'r' },
    kpis: [],
    summary: { total: 2, passed: 1, failed: 1, findings: 1, skipped: 0, flaky: 0, durationSeconds: 3, coveragePercent: null },
    trend: [], causes: [], slowest: [], timeline: [], regressions: [], recovered: [],
    tests: [test(), test({ name: 'passes', status: 'passed', error: undefined })],
    checks: [finding()],
    ...overrides,
  } as ReportModel
}

describe('narrative digest', () => {
  it('carries the run numbers a reader can see, and the findings with their elements', () => {
    const digest = JSON.parse(buildNarrativePrompt(model())) as Record<string, never>
    expect(digest['counts']).toEqual({ testsExecuted: 2, passed: 1, failed: 1, skipped: 0, openScanFindings: 1, durationSeconds: 3 })
    const findings = digest['openFindings'] as unknown as readonly { rule: string; elements: readonly { selector: string }[] }[]
    expect(findings[0]?.rule).toBe('axe:color-contrast')
    expect(findings[0]?.elements[0]?.selector).toBe('#submit')
  })

  it('names the failing tests and never the passing ones', () => {
    const digest = JSON.parse(buildNarrativePrompt(model())) as Record<string, readonly { name: string }[]>
    expect(digest['failingTests']?.map(entry => entry.name)).toEqual(['renders'])
  })

  it('bounds the findings it carries', () => {
    const many = Array.from({ length: DIGEST_FINDING_LIMIT + 5 }, (_unused, index) => finding({ rule: 'rule-' + String(index) }))
    const digest = JSON.parse(buildNarrativePrompt(model({ checks: many }))) as Record<string, readonly unknown[]>
    expect(digest['openFindings']).toHaveLength(DIGEST_FINDING_LIMIT)
  })

  it('forbids calling a scan finding a failing test', () => {
    expect(NARRATIVE_SYSTEM).toContain('Never call one a failing test')
  })
})

describe('narrative reply', () => {
  it('accepts the contracted object', () => {
    const parsed = parseRunNarrative('{"risk":"One test fails.","findings":[{"rule":"axe:color-contrast","interpretation":"Low contrast.","nextAction":"Darken the button."}]}')
    expect(parsed.risk).toBe('One test fails.')
    expect(parsed.findings).toHaveLength(1)
  })

  it('reads a reply wrapped in prose or a code fence', () => {
    const parsed = parseRunNarrative('Here you go:\n```json\n{"risk":"Fine.","findings":[]}\n```')
    expect(parsed.risk).toBe('Fine.')
  })

  it('rejects a reply that carries no risk sentence', () => {
    expect(() => parseRunNarrative('{"findings":[]}')).toThrow(/risk must be a non-empty string/)
  })

  it('rejects a reply that is not JSON at all', () => {
    expect(() => parseRunNarrative('I could not read the digest.')).toThrow(/no JSON object/)
  })

  it('drops an incomplete findings entry instead of failing the whole reply', () => {
    const parsed = parseRunNarrative('{"risk":"Fine.","findings":[{"rule":"a","interpretation":"b"},{"rule":"c","interpretation":"d","nextAction":"e"}]}')
    expect(parsed.findings.map(entry => entry.rule)).toEqual(['c'])
  })
})

describe('narrative application', () => {
  it('attaches an interpretation only to a rule the run reported', () => {
    const applied = applyNarrative(model(), {
      risk: 'One test fails.',
      findings: [
        { rule: 'axe:color-contrast', interpretation: 'Low contrast.', nextAction: 'Darken it.' },
        { rule: 'axe:invented', interpretation: 'Not real.', nextAction: 'Nothing.' },
      ],
    })
    expect(applied.checks?.[0]?.interpretation).toBe('Low contrast.')
    expect(applied.checks?.[0]?.nextAction).toBe('Darken it.')
    expect(applied.verdict.narrative).toBe('One test fails.')
    expect(JSON.stringify(applied)).not.toContain('Not real.')
  })
})

describe('narrative writer', () => {
  it('concatenates text deltas and ignores reasoning deltas', async () => {
    const llm: NarrativeLlm = {
      stream: () => (async function* () {
        yield { type: 'reasoning-delta', text: 'thinking' }
        yield { type: 'text-delta', text: '{"risk":' }
        yield { type: 'text-delta', text: '"ok","findings":[]}' }
        yield { type: 'finish' }
      })(),
    }
    const reply = await llmNarrativeWriter(llm, { provider: 'p', model: 'm' })({ system: 's', prompt: 'p', signal: new AbortController().signal })
    expect(reply).toBe('{"risk":"ok","findings":[]}')
  })
})

/** A workspace the command can resolve its configuration against. */
async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'observatory-narrative-'))
}

/** Mount the command against a stand-in context carrying an optional llm. */
function mount(cwd: string, llm: NarrativeLlm | undefined): (rawInput: string) => Promise<CommandResult> {
  let definition: CommandDefinition | undefined
  const ctx = {
    effect: (register: () => unknown) => register(),
    get: () => llm,
    commands: { register: (registered: CommandDefinition) => { definition = registered; return () => undefined } },
  } as unknown as Context
  commandPlugin.apply(ctx)
  if (definition === undefined) throw new Error('the plugin registered no command')
  const registered = definition
  const agent = { id: 'narrative', session: { header: { cwd } } } as unknown as Agent
  return async (rawInput: string) => {
    const invocation = { agent, commandId: 'run', rawInput, attachments: [], signal: new AbortController().signal } as unknown as CommandInvocation
    return registered.handler(invocation)
  }
}

/** A suite declaring one case and a narrative route. */
async function suite(): Promise<string> {
  const directory = await workspace()
  await writeFile(join(directory, 'test-observatory.yml'), [
    'report:',
    '  outputPath: report.html',
    '  historyPath: false',
    '  narrative:',
    '    provider: test-provider',
    '    model: test-model',
    'cases:',
    '  - name: passes',
    '    command: "true"',
    '',
  ].join('\n'))
  return directory
}

describe('narrative through the /test command', () => {
  it('writes the model sentence into the report', async () => {
    const directory = await suite()
    const llm: NarrativeLlm = { stream: () => (async function* () { yield { type: 'text-delta', text: '{"risk":"Nothing failed.","findings":[]}' } })() }
    const result = await mount(directory, llm)('')
    expect(result.kind).toBe('success')
    const document = await readFile(join(directory, 'report.html'), 'utf8')
    expect(JSON.parse(/window\.__OBSERVATORY__=([\s\S]*?);<\/script>/.exec(document)?.[1] ?? '{}')).toMatchObject({ verdict: { narrative: 'Nothing failed.' } })
  })

  it('keeps the report and says so when no llm service is mounted', async () => {
    const directory = await suite()
    const result = await mount(directory, undefined)('')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('no llm service is mounted')
    expect(await readFile(join(directory, 'report.html'), 'utf8')).toContain('window.__OBSERVATORY__=')
  })

  it('keeps the report and names the failure when the model call fails', async () => {
    const directory = await suite()
    const llm: NarrativeLlm = { stream: () => (async function* () { throw new Error('provider refused') })() }
    const result = await mount(directory, llm)('')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('Model interpretation failed: provider refused')
  })

  it('adds no model text when the run declares no route', async () => {
    const directory = await workspace()
    await writeFile(join(directory, 'test-observatory.yml'), ['report:', '  outputPath: report.html', '  historyPath: false', 'cases:', '  - name: passes', '    command: "true"', ''].join('\n'))
    let called = false
    const llm: NarrativeLlm = { stream: () => { called = true; return (async function* () {})() } }
    const result = await mount(directory, llm)('')
    expect(result.kind).toBe('success')
    expect(called).toBe(false)
    const document = await readFile(join(directory, 'report.html'), 'utf8')
    const written = JSON.parse(/window\.__OBSERVATORY__=([\s\S]*?);<\/script>/.exec(document)?.[1] ?? '{}') as { verdict?: { narrative?: string } }
    expect(written.verdict?.narrative).toBeUndefined()
    expect(renderReport(model())).toContain('window.__OBSERVATORY__=')
  })
})
