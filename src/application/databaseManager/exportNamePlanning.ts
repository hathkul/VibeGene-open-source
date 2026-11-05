export function exportBaseName(name: string): string {
  return name.replace(/\.(dna|prot|gb|gbk|genbank|fasta|fa|json)$/i, '').trim() || 'Untitled'
}

/** Ensure zip/folder entries do not overwrite each other when names collide. */
export function uniquifyExportFileNames<T extends { fileName: string }>(files: readonly T[]): T[] {
  const used = new Set<string>()
  return files.map((file) => {
    const dot = file.fileName.lastIndexOf('.')
    const stem = dot > 0 ? file.fileName.slice(0, dot) : file.fileName
    const extension = dot > 0 ? file.fileName.slice(dot) : ''
    let candidate = file.fileName
    let copy = 2
    const lowerUsed = () => new Set([...used].map((name) => name.toLowerCase()))
    while (lowerUsed().has(candidate.toLowerCase())) {
      candidate = `${stem} (${copy})${extension}`
      copy += 1
    }
    used.add(candidate)
    return { ...file, fileName: candidate }
  })
}
