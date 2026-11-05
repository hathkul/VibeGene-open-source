/** Hash of the on-disk bytes last used for Sync to/from database. */

export async function hashSyncSourceBytes(bytes: Uint8Array): Promise<string> {
  const payload =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer
      : bytes.slice().buffer
  const digest = await crypto.subtle.digest('SHA-256', payload)
  const hashBytes = new Uint8Array(digest)
  let hex = ''
  for (const byte of hashBytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}
