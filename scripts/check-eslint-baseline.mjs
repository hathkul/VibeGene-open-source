#!/usr/bin/env node

/**
 * ESLint regression guardrail.
 *
 * The repository has reviewed legacy ESLint debt. This script records that
 * debt as stable fingerprints and rejects only findings that are not in the
 * reviewed baseline. Fingerprints intentionally exclude line/column numbers:
 * inserting lines above an existing issue must not turn it into new debt.
 *
 * Run `npm run update:lint-baseline` only after reviewing intentional changes.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const BASELINE_PATH = resolve(SCRIPT_DIR, 'eslint-baseline.json')
const ESLINT_CLI = resolve(ROOT_DIR, 'node_modules', 'eslint', 'bin', 'eslint.js')

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeSourceLine(file, line) {
  if (!line || !existsSync(file)) return '<source unavailable>'
  const sourceLine = readFileSync(file, 'utf8').split(/\r?\n/)[line - 1]
  return sourceLine ? sourceLine.replace(/\s+/g, ' ').trim() : '<source unavailable>'
}

function severityName(severity) {
  return severity === 2 ? 'error' : severity === 1 ? 'warning' : 'unknown'
}

/**
 * React Hooks diagnostics append an absolute-path code frame to an otherwise
 * stable rule message. That frame changes whenever nearby lines move, so it
 * is useful to people reading ESLint output but must not be part of the debt
 * fingerprint. Some React Hooks diagnostics instead include their location as
 * an inline `(at line 123)` suffix; exclude that unstable location too. Keep
 * the explanatory message intact.
 */
export function canonicalizeMessage(message) {
  const normalized = message.replaceAll('\r\n', '\n')
  const codeFrameStart = /\n(?:[A-Za-z]:[\\/]|\/).+?:\d+:\d+\n[\s\S]*$/
  return normalized
    .replace(codeFrameStart, '')
    .replace(/\s+\(at line \d+\)/g, '')
    .trim()
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

export function findingId(finding) {
  const stable = [
    finding.file,
    finding.ruleId ?? '<fatal>',
    finding.messageId ?? '',
    canonicalizeMessage(finding.message),
    finding.severity,
    finding.source,
    finding.occurrence,
  ].join('|')
  return createHash('sha256').update(stable).digest('hex').slice(0, 24)
}

function runEslint() {
  if (!existsSync(ESLINT_CLI)) {
    throw new Error('ESLint is not installed. Run npm ci before checking the ESLint baseline.')
  }

  const result = spawnSync(process.execPath, [ESLINT_CLI, '.', '--format', 'json'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.signal) {
    throw new Error(`ESLint was terminated by signal ${result.signal}.`)
  }
  if (result.status !== 0 && result.status !== 1) {
    const diagnostic = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`ESLint exited with unexpected status ${result.status ?? 'unknown'}.${diagnostic ? `\n${diagnostic}` : ''}`)
  }

  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    const diagnostic = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`ESLint did not return a JSON report (exit ${result.status ?? 'unknown'}).${diagnostic ? `\n${diagnostic}` : ''}`)
  }
  if (!Array.isArray(report)) throw new Error('ESLint returned an invalid JSON report.')
  return report
}

export function collectFindings(report) {
  const messages = report.flatMap((result) => result.messages.map((message) => ({
    file: relative(ROOT_DIR, result.filePath).replaceAll('\\', '/'),
    absoluteFile: result.filePath,
    ruleId: message.ruleId,
    messageId: message.messageId,
    message: message.message,
    severity: message.severity,
    fatal: message.fatal === true,
    line: message.line ?? 0,
    column: message.column ?? 0,
    endLine: message.endLine ?? 0,
    endColumn: message.endColumn ?? 0,
  })))
  messages.sort((left, right) =>
    compareText(left.file, right.file)
    || left.line - right.line
    || left.column - right.column
    || compareText(left.ruleId ?? '', right.ruleId ?? '')
    || compareText(left.message, right.message),
  )

  const occurrenceByKey = new Map()
  return messages.map((message) => {
    const source = normalizeSourceLine(message.absoluteFile, message.line)
    const key = [message.file, message.ruleId ?? '<fatal>', message.messageId ?? '', canonicalizeMessage(message.message), message.severity, source].join('|')
    const occurrence = occurrenceByKey.get(key) ?? 0
    occurrenceByKey.set(key, occurrence + 1)
    const finding = { ...message, source, occurrence }
    return { ...finding, id: findingId(finding) }
  })
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return new Set()
  const payload = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  if (payload.version !== 1 || !Array.isArray(payload.findings) || !payload.findings.every((id) => typeof id === 'string')) {
    throw new Error('scripts/eslint-baseline.json must contain version 1 and a string findings array.')
  }
  return new Set(payload.findings)
}

function writeBaseline(findings) {
  const payload = {
    version: 1,
    generatedBy: 'npm run update:lint-baseline',
    // IDs are source-context fingerprints. Location is intentionally omitted
    // so line insertions do not invalidate reviewed debt.
    findings: findings.filter((finding) => !finding.fatal).map((finding) => finding.id).sort(compareText),
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function printFinding(finding) {
  const location = `${finding.file}:${finding.line}:${finding.column}`
  console.error(`  ${location} ${severityName(finding.severity)} ${finding.ruleId ?? 'fatal'} — ${finding.message}`)
  console.error(`    ${finding.source}`)
}

function run(argv = process.argv.slice(2)) {
  if (argv.some((argument) => argument !== '--update-baseline')) {
    throw new Error('Usage: node scripts/check-eslint-baseline.mjs [--update-baseline]')
  }
  const findings = collectFindings(runEslint())
  const fatalFindings = findings.filter((finding) => finding.fatal)
  if (argv.includes('--update-baseline')) {
    if (fatalFindings.length) {
      console.error(`Refusing to update the ESLint baseline: ${fatalFindings.length} fatal ESLint finding(s).`)
      for (const finding of fatalFindings) printFinding(finding)
      return 1
    }
    writeBaseline(findings)
    console.log(`ESLint baseline updated with ${findings.length} reviewed finding${findings.length === 1 ? '' : 's'}.`)
    return 0
  }

  const baseline = readBaseline()
  const fresh = findings.filter((finding) => finding.fatal || !baseline.has(finding.id))
  const matched = findings.length - fresh.length
  const resolved = [...baseline].filter((id) => !findings.some((finding) => finding.id === id)).length
  if (fresh.length === 0) {
    console.log(`ESLint baseline check passed (${matched} reviewed finding${matched === 1 ? '' : 's'}; ${resolved} resolved baseline finding${resolved === 1 ? '' : 's'} ignored).`)
    return 0
  }

  console.error(`ESLint baseline check failed: ${fresh.length} new finding${fresh.length === 1 ? '' : 's'}.`)
  for (const finding of fresh) printFinding(finding)
  console.error('\nFix the finding, or review it and run npm run update:lint-baseline.')
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
