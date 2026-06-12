import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canCreateProjectOwnershipRecords,
  getProjectOwner,
} from './rate-limiter'

describe('project ownership tracking', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed for new ownership records in production without Redis', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(canCreateProjectOwnershipRecords()).toBe(false)
  })

  it('allows local development without Redis-backed ownership records', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(canCreateProjectOwnershipRecords()).toBe(true)
  })

  it('uses a signed HttpOnly cookie as the project owner key', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('V0_API_KEY', 'test-secret')

    const owner = getProjectOwner(new Request('https://example.com'))
    expect(owner.key).toMatch(/^owner:/)
    expect(owner.cookie).toContain('HttpOnly')
    expect(owner.cookie).toContain('Secure')

    const cookieValue = owner.cookie?.match(/v0_project_owner=([^;]+)/)?.[1]
    expect(cookieValue).toBeTruthy()

    const repeatOwner = getProjectOwner(
      new Request('https://example.com', {
        headers: {
          cookie: `v0_project_owner=${cookieValue}`,
        },
      }),
    )

    expect(repeatOwner).toEqual({ key: owner.key })
  })
})
