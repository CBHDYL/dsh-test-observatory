/**
 * Suite-configuration loading and validation. The configuration is an external
 * input (a file a human wrote), so every field is validated here rather than
 * trusted: a malformed document fails with a message naming the exact problem.
 * @module @deepseek-ai/dsh-command-test/config
 */

import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { STRUCTURED_RESULT_FORMATS } from './types.ts'
import type { JourneySpec, StructuredResultFormat, SuiteCase, SuiteConfig, SuiteReportOptions } from './types.ts'
import type { BehaviorOverride, EnvironmentPolicy, InputPolicy, ModalityPolicy, RecoveryPolicy, TimingPolicy } from '../experience/behavior/types.ts'

/** A configuration problem a human must fix; never an internal failure. */
export class SuiteConfigError extends Error {
  /**
   * @param message - the exact problem, naming the offending field.
   */
  constructor(message: string) {
    super(message)
    this.name = 'SuiteConfigError'
  }
}

/**
 * Read one field from an unknown record.
 * @param value - the value to check.
 * @returns the value as a record, or null when it is not a mapping.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Require a non-empty string field.
 * @param record - the mapping holding the field.
 * @param key - the field name.
 * @param where - the position description used in the error.
 * @returns the validated string.
 */
function requireString(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SuiteConfigError(`${where}: "${key}" must be a non-empty string`)
  }
  return value
}

/**
 * Read an optional integer field that must be zero or greater. Used for values
 * where zero is meaningful, such as an expected exit code.
 * @param record - the mapping holding the field.
 * @param key - the field name.
 * @param where - the position description used in the error.
 * @returns the value, or undefined when absent.
 */
function optionalNonNegativeInt(record: Record<string, unknown>, key: string, where: string): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SuiteConfigError(`${where}: "${key}" must be a non-negative integer`)
  }
  return value
}

/**
 * Read an optional integer field that must be greater than zero. A zero timeout,
 * viewport dimension or wait duration cannot express the intent the field names,
 * so it is rejected rather than silently accepted.
 * @param record - the mapping holding the field.
 * @param key - the field name.
 * @param where - the position description used in the error.
 * @returns the value, or undefined when absent.
 */
function optionalPositiveInt(record: Record<string, unknown>, key: string, where: string): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new SuiteConfigError(`${where}: "${key}" must be a positive integer`)
  }
  return value
}

/**
 * Validate one test case.
 * @param raw - the raw case value.
 * @param index - zero-based position, used in the error.
 * @returns the validated case.
 */
function toCase(raw: unknown, index: number): SuiteCase {
  const where = `cases[${index}]`
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`)
  const name = requireString(record, 'name', where)
  const command = requireString(record, 'command', where)
  const expectedExitCode = optionalNonNegativeInt(record, 'expectedExitCode', where)
  const timeoutMs = optionalPositiveInt(record, 'timeoutMs', where)
  const suite = record['suite']
  const owner = record['owner']
  const rawResult = record['result']
  if (suite !== undefined && typeof suite !== 'string') {
    throw new SuiteConfigError(`${where}: "suite" must be a string`)
  }
  if (owner !== undefined && typeof owner !== 'string') {
    throw new SuiteConfigError(`${where}: "owner" must be a string`)
  }
  const result = rawResult === undefined ? undefined : toStructuredResult(rawResult, `${where}.result`)
  return {
    name,
    command,
    ...(expectedExitCode === undefined ? {} : { expectedExitCode }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(suite === undefined ? {} : { suite }),
    ...(owner === undefined ? {} : { owner }),
    ...(result === undefined ? {} : { result }),
  }
}

/**
 * The accepted formats, written the way a person says a list aloud: commas
 * between entries and a final "or". It reads the same constant the check uses,
 * so a new format cannot be accepted while the message still denies it.
 * @returns the format names, in one readable list.
 */
function listFormats(): string {
  const names = [...STRUCTURED_RESULT_FORMATS]
  const last = names.pop() as string
  return names.join(', ') + ' or ' + last
}

/** Validate one structured framework artifact declaration. */
function toStructuredResult(raw: unknown, where: string): NonNullable<SuiteCase['result']> {
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`)
  const format = requireString(record, 'format', where)
  if (!(STRUCTURED_RESULT_FORMATS as readonly string[]).includes(format)) {
    // The list in the message comes from the same constant the check uses, so a
    // new format cannot be accepted while the message still denies it.
    throw new SuiteConfigError(`${where}.format: must be ${listFormats()}`)
  }
  return { format: format as StructuredResultFormat, path: requireString(record, 'path', where) }
}

/**
 * Validate the report options.
 * @param raw - the raw report value.
 * @returns the validated options.
 */
function toReportOptions(raw: unknown): SuiteReportOptions {
  if (raw === undefined) return {}
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError('report: must be a mapping')
  const options: { title?: string; outputPath?: string; project?: string; historyPath?: string | false } = {}
  for (const key of ['title', 'outputPath', 'project'] as const) {
    const value = record[key]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new SuiteConfigError(`report.${key}: must be a non-empty string`)
    }
    options[key] = value
  }
  const historyPath = record['historyPath']
  if (historyPath !== undefined) {
    if (historyPath !== false && (typeof historyPath !== 'string' || historyPath.trim().length === 0)) throw new SuiteConfigError('report.historyPath: must be a non-empty string or false')
    options.historyPath = historyPath
  }
  return options
}

/**
 * Validate a declared persona behaviour: a preset id, or a preset plus overrides.
 * @param raw - the raw behaviour value.
 * @param where - the position description used in the error.
 * @returns the validated declaration.
 */
function toBehavior(raw: unknown, where: string): string | BehaviorOverride {
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) throw new SuiteConfigError(`${where}.behavior: must be a non-empty string`)
    return raw
  }
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError(`${where}.behavior: must be a preset name or a mapping`)
  const preset = requireString(record, 'preset', `${where}.behavior`)
  const override: { preset: string; input?: InputPolicy; timing?: TimingPolicy; modality?: ModalityPolicy; environment?: EnvironmentPolicy; recovery?: RecoveryPolicy } = { preset }
  const sections = ['input', 'timing', 'modality', 'environment', 'recovery'] as const
  for (const section of sections) {
    const value = record[section]
    if (value === undefined) continue
    const mapping = asRecord(value)
    if (mapping === null) throw new SuiteConfigError(`${where}.behavior.${section}: must be a mapping`)
    // The policy shapes are validated by the behaviour module at resolution time;
    // here only the container is checked, so a new policy field needs no edit.
    Object.assign(override, { [section]: mapping })
  }
  return override as BehaviorOverride
}

/**
 * Validate one declared journey and its steps.
 * @param raw - the raw journey value.
 * @param index - zero-based position, used in the error.
 * @returns the validated journey.
 */
function toJourney(raw: unknown, index: number): JourneySpec {
  const where = `journeys[${index}]`
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`)
  const persona = requireString(record, 'persona', where)
  const name = requireString(record, 'name', where)
  const device = record['device']
  if (typeof device !== 'string' || device.trim().length === 0) {
    throw new SuiteConfigError(`${where}: "device" must be a non-empty string`)
  }
  const rawSteps = record['steps']
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new SuiteConfigError(`${where}: "steps" must be a non-empty list`)
  }
  const behavior = record['behavior']
  const declared = behavior === undefined ? undefined : toBehavior(behavior, where)
  const viewport = record['viewport']
  if (viewport !== undefined) {
    const box = asRecord(viewport)
    if (box === null) throw new SuiteConfigError(`${where}.viewport: must be a mapping`)
    const width = optionalPositiveInt(box, 'width', `${where}.viewport`)
    const height = optionalPositiveInt(box, 'height', `${where}.viewport`)
    if (width === undefined || height === undefined) {
      throw new SuiteConfigError(`${where}.viewport: "width" and "height" are required`)
    }
  }
  return {
    persona,
    name,
    device,
    ...(declared === undefined ? {} : { behavior: declared }),
    ...(viewport === undefined ? {} : { viewport: viewport as { width: number; height: number } }),
    steps: rawSteps.map((entry, stepIndex) => toStep(entry, `${where}.steps[${stepIndex}]`)),
  }
}

/**
 * Validate one journey step and its actions.
 * @param raw - the raw step value.
 * @param where - the position description used in the error.
 * @returns the validated step.
 */
function toStep(raw: unknown, where: string): JourneySpec['steps'][number] {
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`)
  const label = requireString(record, 'label', where)
  const actions = record['actions']
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new SuiteConfigError(`${where}: "actions" must be a non-empty list`)
  }
  const timeoutMs = optionalPositiveInt(record, 'timeoutMs', where)
  return {
    label,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    actions: actions.map((entry, actionIndex) => toAction(entry, `${where}.actions[${actionIndex}]`)),
  }
}

/**
 * Validate one journey action.
 * @param raw - the raw action value.
 * @param where - the position description used in the error.
 * @returns the validated action.
 */
function toAction(raw: unknown, where: string): JourneySpec['steps'][number]['actions'][number] {
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`)
  const kind = record['kind']
  switch (kind) {
    case 'goto':
      return { kind: 'goto', url: requireString(record, 'url', where) }
    case 'click':
      return { kind: 'click', selector: requireString(record, 'selector', where) }
    case 'expectVisible':
      return { kind: 'expectVisible', selector: requireString(record, 'selector', where) }
    case 'expectText':
      return { kind: 'expectText', text: requireString(record, 'text', where) }
    case 'fill':
      return { kind: 'fill', selector: requireString(record, 'selector', where), value: requireString(record, 'value', where) }
    case 'wait': {
      const ms = optionalPositiveInt(record, 'ms', where)
      const selector = record['selector']
      if (selector !== undefined && (typeof selector !== 'string' || selector.trim().length === 0)) {
        throw new SuiteConfigError(`${where}: "selector" must be a non-empty string`)
      }
      return {
        kind: 'wait',
        ...(ms === undefined ? {} : { ms }),
        ...(selector === undefined ? {} : { selector }),
      }
    }
    case 'screenshot': {
      const category = record['category']
      if (category !== 'key' && category !== 'fail' && category !== 'mobile' && category !== 'final') {
        throw new SuiteConfigError(`${where}: "category" must be key, fail, mobile or final`)
      }
      return { kind: 'screenshot', caption: requireString(record, 'caption', where), category }
    }
    default:
      throw new SuiteConfigError(`${where}: "kind" must be goto, click, fill, expectText, expectVisible, wait or screenshot`)
  }
}

/**
 * Parse and validate a suite configuration document.
 * @param text - the YAML document text.
 * @returns the validated configuration.
 */
export function parseSuiteConfig(text: string): SuiteConfig {
  let raw: unknown
  try {
    raw = parseYaml(text)
  } catch (error: unknown) {
    // The YAML parser throws YAMLError instances, which are Errors.
    throw new SuiteConfigError(`not valid YAML: ${(error as Error).message}`)
  }
  const record = asRecord(raw)
  if (record === null) throw new SuiteConfigError('the document must be a mapping with a "cases" list')
  const cases = record['cases']
  if (!Array.isArray(cases)) throw new SuiteConfigError('"cases" must be a list of test cases')
  if (cases.length === 0) throw new SuiteConfigError('"cases" must declare at least one test case')
  const rawJourneys = record['journeys']
  if (rawJourneys !== undefined && !Array.isArray(rawJourneys)) {
    throw new SuiteConfigError('"journeys" must be a list of browser journeys')
  }
  return {
    report: toReportOptions(record['report']),
    cases: cases.map((entry, index) => toCase(entry, index)),
    ...(rawJourneys === undefined ? {} : { journeys: rawJourneys.map((entry, index) => toJourney(entry, index)) }),
  }
}

/**
 * Read and validate a suite configuration file.
 * @param path - absolute or relative path of the configuration file.
 * @returns the validated configuration.
 */
export async function loadSuiteConfig(path: string): Promise<SuiteConfig> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') throw new SuiteConfigError(`no configuration file at ${path}`)
    // A failed read always rejects with a NodeJS ErrnoException.
    throw new SuiteConfigError(`cannot read ${path}: ${(error as Error).message}`)
  }
  return parseSuiteConfig(text)
}