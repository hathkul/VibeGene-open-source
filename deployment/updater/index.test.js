import { strict as assert } from 'node:assert'
import { test } from 'vitest'
import worker from './index.js'

const base = 'https://vibe-gene.com'
const path = '/updates/1.7.5/VibeGene_1.7.5_aarch64.AppImage'
function environment(entries) {
  return { ASSETS: { fetch: async request => entries[new URL(request.url).pathname] ?? new Response(null, { status: 404 }) } }
}

test('streams all parts in order and preserves their bytes', async () => {
  const env = environment({
    [`${path}.parts.json`]: Response.json({ size: 6, parts: 2 }),
    [`${path}.part-000`]: new Response(new Uint8Array([0, 1, 2])),
    [`${path}.part-001`]: new Response(new Uint8Array([253, 254, 255])),
  })
  const response = await worker.fetch(new Request(base + path), env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-length'), '6')
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 1, 2, 253, 254, 255])
})

test('supports HEAD, missing descriptors, and disallowed methods', async () => {
  const env = environment({ [`${path}.parts.json`]: Response.json({ size: 6, parts: 2 }) })
  const head = await worker.fetch(new Request(base + path, { method: 'HEAD' }), env)
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '6')
  assert.equal(await head.text(), '')
  assert.equal((await worker.fetch(new Request(base + '/updates/v/missing.AppImage'), env)).status, 404)
  assert.equal((await worker.fetch(new Request(base + path, { method: 'POST' }), env)).status, 405)
})

test('rejects invalid metadata and passes normal assets through', async () => {
  const env = environment({
    [`${path}.parts.json`]: Response.json({ size: 6, parts: 101 }),
    '/updates/darwin-aarch64.json': new Response('manifest'),
  })
  assert.equal((await worker.fetch(new Request(base + path), env)).status, 500)
  assert.equal(await (await worker.fetch(new Request(base + '/updates/darwin-aarch64.json'), env)).text(), 'manifest')
})
