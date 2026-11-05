export type Primer3ModuleFS = {
  writeFile(path: string, data: string | Uint8Array): void
  readFile(path: string, options: { encoding: 'utf8' }): string
  mkdirTree(path: string): void
  analyzePath(path: string): { exists: boolean }
}

export type Primer3Module = {
  FS: Primer3ModuleFS
  /** Runs primer3_core's main(); returns the exit status. */
  callMain(args: string[]): number
}

export type Primer3ModuleOptions = {
  print?: (line: string) => void
  printErr?: (line: string) => void
  onExit?: (status: number) => void
  onAbort?: (reason: unknown) => void
  thisProgram?: string
}

export type Primer3ModuleFactory = (options?: Primer3ModuleOptions) => Promise<Primer3Module>

declare const createPrimer3Module: Primer3ModuleFactory
export default createPrimer3Module
