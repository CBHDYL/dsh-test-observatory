/**
 * Project detection for `/test auto`: read the working directory's manifests and
 * propose the suite declaration a project of that shape would want. Detection
 * only proposes commands the project already declares; it never invents one.
 * @module @deepseek-ai/dsh-command-test/detect
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** One detected check the project can run. */
export interface DetectedCheck {
  /** Human-readable case name. */
  readonly name: string
  /** Command that runs it. */
  readonly command: string
  /** Detected suite label. */
  readonly suite: string
}

/** What detection found in one project directory. */
export interface Detection {
  /** Project shape that was recognized. */
  readonly projectType: string
  /** Checks the project declares. */
  readonly checks: readonly DetectedCheck[]
}

/**
 * Read a file, returning undefined when it is absent or unreadable.
 * @param path - the file path.
 * @returns the file text, or undefined.
 */
async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Extract the npm scripts a Node project declares.
 * @param directory - the project directory.
 * @returns the package name and script names, or undefined when not a Node project.
 */
async function detectNode(directory: string): Promise<{ name: string; scripts: string[] } | undefined> {
  const text = await readOptional(join(directory, 'package.json'))
  if (text === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { name: 'Node project', scripts: [] }
  }
  if (typeof parsed !== 'object' || parsed === null) return { name: 'Node project', scripts: [] }
  const record = parsed as { name?: unknown; scripts?: unknown }
  const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : 'Node project'
  const scripts = typeof record.scripts === 'object' && record.scripts !== null
    ? Object.keys(record.scripts as Record<string, unknown>)
    : []
  return { name, scripts }
}

/**
 * Build the Node checks from the declared scripts, preferring the conventional
 * verification script names in the order a maintainer would run them.
 * @param scripts - the declared script names.
 * @returns the detected checks.
 */
function nodeChecks(scripts: readonly string[]): DetectedCheck[] {
  const preferred = ['test', 'typecheck', 'lint', 'build']
  const chosen = preferred.filter(name => scripts.includes(name))
  return chosen.map(name => ({
    name: 'pnpm run ' + name,
    command: 'pnpm run ' + name,
    suite: name === 'test' ? 'Unit' : 'Static',
  }))
}

/**
 * Detect the checks a project directory declares.
 * @param directory - the session working directory.
 * @returns the detection result.
 */
export async function detectProject(directory: string): Promise<Detection> {
  const node = await detectNode(directory)
  if (node !== undefined) return { projectType: node.name, checks: nodeChecks(node.scripts) }

  const pyproject = await readOptional(join(directory, 'pyproject.toml'))
  if (pyproject !== undefined) {
    const checks: DetectedCheck[] = [{ name: 'pytest', command: 'python3 -m pytest', suite: 'Unit' }]
    return { projectType: 'Python project', checks }
  }

  const goMod = await readOptional(join(directory, 'go.mod'))
  if (goMod !== undefined) {
    return {
      projectType: 'Go module',
      checks: [
        { name: 'go test', command: 'go test ./...', suite: 'Unit' },
        { name: 'go vet', command: 'go vet ./...', suite: 'Static' },
      ],
    }
  }

  const cargo = await readOptional(join(directory, 'Cargo.toml'))
  if (cargo !== undefined) {
    return {
      projectType: 'Cargo package',
      checks: [
        { name: 'cargo test', command: 'cargo test', suite: 'Unit' },
        { name: 'cargo clippy', command: 'cargo clippy -- -D warnings', suite: 'Static' },
      ],
    }
  }

  return { projectType: 'unrecognized project', checks: [] }
}

/**
 * Render a detection as the YAML declaration a human can paste and run.
 * @param detection - what detection found.
 * @param directory - the directory that was inspected, used in the heading.
 * @returns the report text.
 */
export function describeDetection(detection: Detection, directory: string): string {
  if (detection.checks.length === 0) {
    return [
      'No runnable checks detected in ' + directory + ' (' + detection.projectType + ').',
      'Declare them yourself in test-observatory.yml:',
      '',
      '  cases:',
      '    - name: Unit tests',
      '      command: <your test command>',
    ].join('\n')
  }
  const lines = [
    'Detected ' + detection.projectType + ' in ' + directory + ':',
    ...detection.checks.map(check => '  - ' + check.name + '  (' + check.command + ')'),
    '',
    'Paste this into test-observatory.yml, then run /test:',
    '',
    'report:',
    '  project: ' + detection.projectType,
    '  outputPath: test-observatory-report.html',
    'cases:',
  ]
  for (const check of detection.checks) {
    lines.push('  - name: ' + check.name)
    lines.push('    command: ' + check.command)
    lines.push('    suite: ' + check.suite)
  }
  return lines.join('\n')
}
