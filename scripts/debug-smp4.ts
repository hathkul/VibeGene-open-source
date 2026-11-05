import { readFileSync } from 'node:fs'
import { decodeZtrFormat } from '../src/domain/ztrFilters'

const ztr = readFileSync('tests/fixtures/snapgene-trace0.ztr')
let offset = 10
while (offset + 8 <= ztr.length) {
  const type = String.fromCharCode(...ztr.subarray(offset, offset + 4))
  const metaLen = ztr.readUInt32BE(offset + 4)
  offset += 8 + metaLen
  const dataLen = ztr.readUInt32BE(offset)
  offset += 4
  let current = ztr.subarray(offset, offset + dataLen)
  offset += dataLen
  if (type !== 'SMP4') continue

  const chain: string[] = []
  while (current.length > 0 && current[0] !== 0) {
    chain.push(`0x${current[0]!.toString(16)}:${current.length}`)
    current = decodeZtrFormat(current)
  }
  console.log('SMP4 chain', chain.join(' -> '))
  const sampleData = current.subarray(2)
  console.log('per-channel samples', Math.floor(sampleData.length / 8))
  const a0 = sampleData.readUInt16BE(0)
  const a1 = sampleData.readUInt16BE(2)
  console.log('first A samples', a0, a1, sampleData.readUInt16BE(4), sampleData.readUInt16BE(6))
}
