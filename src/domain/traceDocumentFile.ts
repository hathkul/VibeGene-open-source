/** Raw chromatogram documents use the AB1 extension regardless of case. */
export function isTraceDocumentFileName(fileName: string): boolean {
  return /\.ab1$/i.test(fileName.trim())
}
