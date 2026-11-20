const DEFAULT_DEMO_TITLE = 'VibeGene-pDemo'
const PRODUCT_TITLE = 'VibeGene — DNA Editing, Cloning & Sequence Analysis'

export function browserDocumentTitle(title: string, isNative: boolean): string {
  return !isNative && title === DEFAULT_DEMO_TITLE ? PRODUCT_TITLE : title
}
