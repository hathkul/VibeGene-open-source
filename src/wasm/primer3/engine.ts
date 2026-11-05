import type { Primer3ModuleFactory } from './primer3.mjs'
import type { Primer3EngineInput } from '../../domain/primer3/types'

const INPUT_PATH = '/primer3_run/input.boulder'
const PRIMER_ERROR_PATTERN = /^PRIMER_ERROR=./m

type NodeProcessLike = { exitCode?: number | string | null }

let factoryPromise: Promise<Primer3ModuleFactory> | undefined

function loadFactory(): Promise<Primer3ModuleFactory> {
  factoryPromise ??= import('./primer3.mjs').then((module) => module.default)
  return factoryPromise
}

function parentDirectory(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/'
}

/** Execute primer3_core in a fresh WASM instance and return Boulder-IO stdout. */
export async function runPrimer3Engine(input: Primer3EngineInput): Promise<string> {
  const createModule = await loadFactory()
  const stdout: string[] = []
  const stderr: string[] = []
  let exitStatus: number | undefined
  let crash: unknown
  const nodeProcess = (globalThis as { process?: NodeProcessLike }).process
  const previousExitCode = nodeProcess?.exitCode
  try {
    const module = await createModule({
      thisProgram: 'primer3_core',
      print: (line) => stdout.push(line),
      printErr: (line) => stderr.push(line),
      onExit: (status) => {
        exitStatus = status
      },
    })
    for (const [path, contents] of Object.entries(input.files)) {
      if (!path.startsWith('/')) throw new Error(`Primer3 file paths must be absolute: ${path}`)
      module.FS.mkdirTree(parentDirectory(path))
      module.FS.writeFile(path, contents)
    }
    module.FS.mkdirTree(parentDirectory(INPUT_PATH))
    module.FS.writeFile(INPUT_PATH, input.boulder)
    try {
      const status = module.callMain(['-strict_tags', INPUT_PATH])
      exitStatus ??= status
    } catch (error) {
      crash = error
    }
  } finally {
    if (nodeProcess) nodeProcess.exitCode = previousExitCode
  }

  const output = stdout.length ? `${stdout.join('\n')}\n` : ''
  const failed = crash !== undefined || (exitStatus ?? 0) !== 0 || stderr.length > 0
  if (!failed || PRIMER_ERROR_PATTERN.test(output)) return output

  const details = [
    ...stderr,
    ...(crash !== undefined ? [crash instanceof Error ? crash.message : String(crash)] : []),
  ].join('\n')
  const status = exitStatus !== undefined ? ` (exit status ${exitStatus})` : ''
  throw new Error(`Primer3 failed${status}${details ? `: ${details}` : ''}`)
}
