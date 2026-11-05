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
  if (type !== 'BPOS') continue

  const chain: string[] = []
  while (current.length > 0 && current[0] !== 0) {
    chain.push(`0x${current[0]!.toString(16)}:${current.length}`)
    current = decodeZtrFormat(current)
  }
  console.log('BPOS chain', chain.join(' -> '))
  const positions: number[] = []
  for (let index = 4; index + 4 <= current.length; index += 4) {
    positions.push(current.readUInt32BE(index))
  }
  console.log('positions', positions.length, 'max', Math.max(...positions), 'first10', positions.slice(0, 10))
}
