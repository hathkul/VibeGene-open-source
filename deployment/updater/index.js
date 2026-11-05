// Static manifests and small artifacts are served directly. Larger AppImages
// are stored in numbered assets and streamed back as their original byte stream.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!/^\/updates\/[\w.-]+\/[\w.-]+\.AppImage$/.test(url.pathname)) {
      return env.ASSETS.fetch(request)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const descriptorResponse = await env.ASSETS.fetch(new Request(`${url.origin}${url.pathname}.parts.json`))
    if (!descriptorResponse.ok) return new Response('Not found', { status: 404 })
    const descriptor = await descriptorResponse.json()
    if (!Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 ||
        !Number.isInteger(descriptor.parts) || descriptor.parts < 1 || descriptor.parts > 100) {
      return new Response('Invalid artifact metadata', { status: 500 })
    }
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(descriptor.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    }
    if (request.method === 'HEAD') return new Response(null, { headers })
    let part = 0
    let reader
    const body = new ReadableStream({
      async pull(controller) {
        try {
          while (true) {
            if (!reader) {
              if (part === descriptor.parts) return controller.close()
              const suffix = String(part++).padStart(3, '0')
              const response = await env.ASSETS.fetch(new Request(`${url.origin}${url.pathname}.part-${suffix}`))
              if (!response.ok || !response.body) throw new Error('Missing artifact part')
              reader = response.body.getReader()
            }
            const result = await reader.read()
            if (!result.done) return controller.enqueue(result.value)
            reader.releaseLock()
            reader = undefined
          }
        } catch (error) {
          controller.error(error)
        }
      },
      async cancel(reason) {
        if (reader) await reader.cancel(reason)
      },
    })
    return new Response(body, { headers })
  },
}
