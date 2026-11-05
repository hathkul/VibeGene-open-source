import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PDF_URL =
  'https://www.sigmaaldrich.com/deepweb/assets/sigmaaldrich/product/documents/347/251/11082035001bul.pdf'

async function extractPdfText(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/pdf,*/*',
    },
  })
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
  const data = new Uint8Array(await response.arrayBuffer())
  if (!new TextDecoder().decode(data.slice(0, 5)).startsWith('%PDF')) {
    throw new Error('not a pdf')
  }
  const pdf = await getDocument({ data }).promise
  let text = ''
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`
  }
  return text
}

const text = await extractPdfText(PDF_URL)
const root = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(root, 'roche-pdf-text.txt'), text)
console.log('wrote', text.length, 'chars')
