import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureNcbiBlastRequester, ncbiBlastRequest } from '../src/domain/ncbiBlast'

afterEach(() => configureNcbiBlastRequester(null))

describe('NCBI BLAST request port', () => {
  it('delegates requests to the configured transport', async () => {
    const requester = vi.fn(async () => 'RID = TEST')
    configureNcbiBlastRequester(requester)
    const body = new URLSearchParams({ CMD: 'Put' })

    await expect(ncbiBlastRequest(body)).resolves.toBe('RID = TEST')
    expect(requester).toHaveBeenCalledWith(body, undefined)
  })

  it('fails clearly when no transport is installed', async () => {
    configureNcbiBlastRequester(null)
    await expect(ncbiBlastRequest(new URLSearchParams())).rejects.toThrow('has not been configured')
  })
})
