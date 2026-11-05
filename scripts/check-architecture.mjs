#!/usr/bin/env node

/**
 * Architecture guardrail for source dependencies and file budgets.
 *
 * This intentionally checks relative imports inside src/ plus a small set of
 * package-level infrastructure boundaries.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC_ROOT = join(ROOT, 'src')
const BASELINE_PATH = join(ROOT, 'scripts', 'architecture-baseline.json')
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const RESOLUTION_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const forbiddenImports = {
  // Domain code should not reach into UI/application shells or adapters.
  domain: new Set(['app', 'application', 'components', 'desktop', 'presentation', 'storage', 'ui', 'wasm', 'workerAdapters', 'workers']),
  // Persistence is an adapter. It may use domain code and neutral application
  // contracts/helpers, but not presentation, app shells, or worker implementations.
  storage: new Set(['app', 'components', 'desktop', 'presentation', 'ui', 'workerAdapters', 'workers']),
  // Application workflows coordinate domain and ports. They must not reach
  // into concrete adapters or render React; composition belongs at the shell.
  application: new Set(['app', 'components', 'desktop', 'presentation', 'storage', 'ui', 'wasm', 'workerAdapters', 'workers']),
  // Workers are execution adapters around domain protocols, not a second path
  // into persistence or the UI.
  workers: new Set(['app', 'application', 'components', 'desktop', 'presentation', 'storage', 'ui']),
  // UI primitives may depend on React and other UI primitives, but not on the
  // application shell or infrastructure adapters.
  ui: new Set(['app', 'desktop', 'presentation', 'storage', 'wasm', 'workerAdapters', 'workers']),
  // Presentation is a rendering boundary. Concrete persistence/native
  // adapters are assembled by the composition root and injected through
  // application protocols instead of imported by presentation modules.
  presentation: new Set(['desktop', 'storage', 'wasm', 'workerAdapters', 'workers']),
}

const forbiddenExternalImports = {
  // These are intentionally package-level checks: a type-only import of React
  // still couples domain code to the rendering layer, and a dynamic Tauri
  // import is still an infrastructure dependency.
  domain: [/^react(?:$|\/)/, /^react-dom(?:$|\/)/, /^dexie(?:$|\/)/, /^@tauri-apps\//],
  application: [/^react(?:$|\/)/, /^react-dom(?:$|\/)/, /^dexie(?:$|\/)/, /^@tauri-apps\//],
  storage: [/^react(?:$|\/)/, /^react-dom(?:$|\/)/, /^@tauri-apps\//],
  presentation: [/^@tauri-apps\//, /^dexie(?:$|\/)/],
  ui: [/^@tauri-apps\//, /^dexie(?:$|\/)/],
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
const maxNewSourceLines = baseline.maxNewSourceLines ?? 1000
const maxLinesByFile = baseline.maxLinesByFile ?? {}
const legacyLargeFileBaselines = baseline.legacyLargeFileBaselines ?? {}
const legacyLargeFileHeadroom = baseline.legacyLargeFileHeadroom ?? {
  minimumLines: 100,
  percent: 5,
  roundToLines: 50,
}

/** Compute a readable-growth ceiling for a known legacy large file. */
export function legacyFileCeiling(
  baselineLines,
  { minimumLines = 100, percent = 5, roundToLines = 50 } = legacyLargeFileHeadroom,
) {
  const proportionalHeadroom = Math.ceil(baselineLines * (percent / 100))
  const unroundedCeiling = baselineLines + Math.max(minimumLines, proportionalHeadroom)
  return Math.ceil(unroundedCeiling / roundToLines) * roundToLines
}

function sourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path)
  }
  return files
}

function relativeSourcePath(path, root = ROOT) {
  return normalize(relative(root, path)).replaceAll('\\', '/')
}

function layerFor(path, root = ROOT) {
  const sourcePath = relativeSourcePath(path, root)
  if (sourcePath.startsWith('src/domain/')) return 'domain'
  if (sourcePath.startsWith('src/application/')) return 'application'
  if (sourcePath.startsWith('src/storage/')) return 'storage'
  if (sourcePath.startsWith('src/desktop/')) return 'desktop'
  if (sourcePath.startsWith('src/workers/')) return 'workers'
  if (sourcePath.startsWith('src/workerAdapters/')) return 'workerAdapters'
  if (sourcePath.startsWith('src/components/')) return 'components'
  if (sourcePath.startsWith('src/ui/')) return 'ui'
  if (sourcePath.startsWith('src/presentation/')) return 'presentation'
  // Legacy/alternate database-manager presentation folder: treat like presentation
  // even before files exist so a future extraction cannot bypass adapter rules.
  if (sourcePath.startsWith('src/databaseManagerDialog/')) return 'presentation'
  if (sourcePath.startsWith('src/crossTab/')) return 'crossTab'
  if (sourcePath.startsWith('src/data/')) return 'data'
  if (sourcePath.startsWith('src/wasm/')) return 'wasm'
  if (sourcePath.startsWith('src/assets/')) return 'assets'
  if (sourcePath.startsWith('src/styles/')) return 'styles'
  if (sourcePath.startsWith('src/test-support/')) return 'testSupport'
  if (sourcePath.startsWith('src/theme/')) return 'theme'
  if (sourcePath.startsWith('src/')) return 'app'
  return 'other'
}

function resolveImport(fromPath, importPath) {
  if (!importPath.startsWith('.')) return null
  const basePath = resolve(dirname(fromPath), importPath)
  const candidates = [
    basePath,
    ...RESOLUTION_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...RESOLUTION_EXTENSIONS.map((extension) => join(basePath, `index${extension}`)),
  ]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function importsIn(contents, sourcePath) {
  const imports = []
  const sourceFile = ts.createSourceFile(sourcePath, contents, ts.ScriptTarget.Latest, true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const literal = (node) => node && ts.isStringLiteral(node) ? node.text : null
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const value = literal(node.moduleSpecifier)
      if (value !== null) imports.push(value)
    }
    if (ts.isCallExpression(node)) {
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isMock = ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && ['vi', 'jest'].includes(node.expression.expression.text) &&
        ['mock', 'doMock'].includes(node.expression.name.text)
      const value = literal(node.arguments[0])
      if ((isDynamic || isMock) && value !== null) imports.push(value)
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Worker') {
      const url = node.arguments?.[0]
      if (url && ts.isNewExpression(url) && ts.isIdentifier(url.expression) && url.expression.text === 'URL' &&
          url.arguments?.length >= 2 && url.arguments[1].getText(sourceFile) === 'import.meta.url') {
        const value = literal(url.arguments[0])
        if (value !== null) imports.push(value)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return imports
}

/** Return architecture violations for one source file. Exported for scanner tests. */
export function findImportViolations({ sourcePath, source, root = ROOT }) {
  const sourceName = relativeSourcePath(sourcePath, root)
  const sourceLayer = layerFor(sourcePath, root)
  const errors = []
  for (const importPath of importsIn(source, sourcePath)) {
    if (!importPath.startsWith('.')) {
      const isForbiddenPackage = forbiddenExternalImports[sourceLayer]?.some((pattern) => pattern.test(importPath))
      if (isForbiddenPackage) {
        errors.push(`forbidden ${sourceLayer} package import: ${sourceName} -> ${importPath}`)
      }
      continue
    }

    const targetPath = resolveImport(sourcePath, importPath)
    const targetForLayer = targetPath ?? resolve(dirname(sourcePath), importPath)
    const targetLayer = layerFor(targetForLayer, root)
    const target = relativeSourcePath(targetForLayer, root)
    if (targetLayer === 'testSupport' && !/\.test\.[^.]+$/.test(sourceName)) {
      errors.push(`production module imports test-support: ${sourceName} -> ${target}`)
      continue
    }
    if (!forbiddenImports[sourceLayer]?.has(targetLayer)) continue
    errors.push(`forbidden ${sourceLayer} import: ${sourceName} -> ${target}`)
  }
  return errors
}

function gitTrackedFiles() {
  try {
    return new Set(
      execFileSync('git', ['ls-files', '--', 'src/**/*.ts', 'src/**/*.tsx'], {
        cwd: ROOT,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

function run() {
  const errors = []
  const trackedFiles = gitTrackedFiles()

  for (const filePath of sourceFiles(SRC_ROOT)) {
    const source = relativeSourcePath(filePath)
    const lineCount = readFileSync(filePath, 'utf8').split('\n').length - 1
    const fixedLimit = maxLinesByFile[source]
    const legacyBaseline = legacyLargeFileBaselines[source]
    const configuredLimit = fixedLimit ?? (
      legacyBaseline === undefined ? undefined : legacyFileCeiling(legacyBaseline)
    )
    const isBudgetedFile = configuredLimit !== undefined
    const isTracked = trackedFiles.has(source)

    if (configuredLimit !== undefined && lineCount > configuredLimit) {
      errors.push(`${source} has grown to ${lineCount} lines (budget: ${configuredLimit})`)
    } else if (!isBudgetedFile && lineCount > maxNewSourceLines) {
      const status = isTracked ? 'new or unbudgeted' : 'untracked'
      errors.push(`${source} is ${status} and has ${lineCount} lines (new-file budget: ${maxNewSourceLines})`)
    }

    errors.push(...findImportViolations({ sourcePath: filePath, source: readFileSync(filePath, 'utf8') }))
  }

  if (errors.length) {
    console.error(`Architecture check failed with ${errors.length} violation(s):`)
    for (const error of errors) console.error(`  - ${error}`)
    return 1
  }
  console.log(`Architecture check passed (${sourceFiles(SRC_ROOT).length} source files checked).`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run()
}
