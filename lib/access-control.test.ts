import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserIP: vi.fn(),
  getUserProjects: vi.fn(),
  isProjectTrackingEnabled: vi.fn(),
}))

vi.mock('@/lib/rate-limiter', () => mocks)

import {
  authorizeChatAccess,
  authorizeProjectAccess,
  getChatProjectId,
} from './access-control'

describe('getChatProjectId', () => {
  it('reads the direct projectId from a chat response', () => {
    expect(getChatProjectId({ id: 'chat_1', projectId: 'prj_1' })).toBe(
      'prj_1',
    )
  })

  it('falls back to a nested project id', () => {
    expect(getChatProjectId({ id: 'chat_1', project: { id: 'prj_1' } })).toBe(
      'prj_1',
    )
  })

  it('returns null when a chat response has no project identity', () => {
    expect(getChatProjectId({ id: 'chat_1' })).toBeNull()
  })
})

describe('authorizeProjectAccess', () => {
  beforeEach(() => {
    mocks.getUserIP.mockReturnValue('203.0.113.10')
    mocks.getUserProjects.mockResolvedValue(['prj_allowed'])
    mocks.isProjectTrackingEnabled.mockReturnValue(true)
  })

  it('allows projects associated with the requester IP', async () => {
    await expect(
      authorizeProjectAccess(new Request('https://example.com'), 'prj_allowed'),
    ).resolves.toMatchObject({
      authorized: true,
      userIP: '203.0.113.10',
    })
  })

  it('denies projects that are not associated with the requester IP', async () => {
    const result = await authorizeProjectAccess(
      new Request('https://example.com'),
      'prj_other',
    )

    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.response.status).toBe(403)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps local single-user demo mode working without project tracking', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mocks.isProjectTrackingEnabled.mockReturnValue(false)

    await expect(
      authorizeProjectAccess(new Request('https://example.com'), 'prj_any'),
    ).resolves.toMatchObject({
      authorized: true,
      userIP: '203.0.113.10',
    })
  })

  it('fails closed in production without project tracking', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.isProjectTrackingEnabled.mockReturnValue(false)

    const result = await authorizeProjectAccess(
      new Request('https://example.com'),
      'prj_any',
    )

    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.response.status).toBe(503)
    }
  })
})

describe('authorizeChatAccess', () => {
  beforeEach(() => {
    mocks.getUserIP.mockReturnValue('203.0.113.10')
    mocks.getUserProjects.mockResolvedValue(['prj_allowed'])
    mocks.isProjectTrackingEnabled.mockReturnValue(true)
  })

  it('allows chats that belong to an associated project', async () => {
    const client = {
      chats: {
        getById: vi.fn().mockResolvedValue({
          id: 'chat_1',
          projectId: 'prj_allowed',
        }),
      },
      projects: {
        getByChatId: vi.fn(),
      },
    }

    const result = await authorizeChatAccess(
      new Request('https://example.com'),
      client,
      'chat_1',
      'prj_allowed',
    )

    expect(result).toMatchObject({
      authorized: true,
      projectId: 'prj_allowed',
    })
  })

  it('falls back to the project lookup when a chat omits projectId', async () => {
    const client = {
      chats: {
        getById: vi.fn().mockResolvedValue({
          id: 'chat_1',
        }),
      },
      projects: {
        getByChatId: vi.fn().mockResolvedValue({
          id: 'prj_allowed',
        }),
      },
    }

    const result = await authorizeChatAccess(
      new Request('https://example.com'),
      client,
      'chat_1',
      'prj_allowed',
    )

    expect(client.projects.getByChatId).toHaveBeenCalledWith({
      chatId: 'chat_1',
    })
    expect(result).toMatchObject({
      authorized: true,
      projectId: 'prj_allowed',
    })
  })

  it('denies chats whose project does not match the expected project', async () => {
    const client = {
      chats: {
        getById: vi.fn().mockResolvedValue({
          id: 'chat_1',
          projectId: 'prj_other',
        }),
      },
      projects: {
        getByChatId: vi.fn(),
      },
    }

    const result = await authorizeChatAccess(
      new Request('https://example.com'),
      client,
      'chat_1',
      'prj_allowed',
    )

    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.response.status).toBe(403)
    }
  })

  it('denies chats with no resolvable project', async () => {
    const client = {
      chats: {
        getById: vi.fn().mockResolvedValue({ id: 'chat_1' }),
      },
      projects: {
        getByChatId: vi.fn().mockResolvedValue({}),
      },
    }

    const result = await authorizeChatAccess(
      new Request('https://example.com'),
      client,
      'chat_1',
    )

    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.response.status).toBe(403)
    }
  })
})
