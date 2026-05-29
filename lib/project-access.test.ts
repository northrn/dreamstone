import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { v0 } from 'v0-sdk'
import {
  PROJECT_ACCESS_COOKIE,
  getProjectAccessIds,
  grantProjectAccess,
  requireChatProjectAccess,
  requireProjectAccess,
  requireSameOriginRequest,
} from './project-access'

vi.mock('v0-sdk', () => ({
  v0: {
    projects: {
      getByChatId: vi.fn(),
    },
  },
}))

function requestWithCookie(cookie?: string) {
  return new Request('https://example.com/api/projects/project-1', {
    headers: {
      ...(cookie && { cookie }),
    },
  })
}

function projectAccessCookie(projectIds: string[]) {
  const request = requestWithCookie()
  const response = NextResponse.json({})

  for (const projectId of projectIds) {
    grantProjectAccess(request, response, projectId)
  }

  return response.headers.get('set-cookie')!.split(';')[0]
}

describe('project access cookies', () => {
  beforeEach(() => {
    process.env.V0_API_KEY = 'test-secret'
    vi.mocked(v0.projects.getByChatId).mockReset()
  })

  it('allows a project granted by the signed access cookie', async () => {
    const cookie = projectAccessCookie(['project-1'])
    const result = await requireProjectAccess(
      requestWithCookie(cookie),
      'project-1',
    )

    expect(result.allowed).toBe(true)
    expect(getProjectAccessIds(requestWithCookie(cookie))).toEqual([
      'project-1',
    ])
  })

  it('preserves existing project grants when adding a new project', () => {
    const firstCookie = projectAccessCookie(['project-1'])
    const response = NextResponse.json({})

    grantProjectAccess(requestWithCookie(firstCookie), response, 'project-2')

    const updatedCookie = response.headers.get('set-cookie')!.split(';')[0]
    expect(getProjectAccessIds(requestWithCookie(updatedCookie))).toEqual([
      'project-1',
      'project-2',
    ])
  })

  it('rejects requests without the signed project cookie even if IP headers are spoofed', async () => {
    const request = new Request('https://example.com/api/projects/project-1', {
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'x-real-ip': '203.0.113.10',
      },
    })
    const result = await requireProjectAccess(request, 'project-1')

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.response.status).toBe(404)
    }
  })

  it('rejects tampered project access cookies', async () => {
    const encodedPayload = Buffer.from(
      JSON.stringify({ projectIds: ['project-1'] }),
    ).toString('base64url')
    const request = requestWithCookie(
      `${PROJECT_ACCESS_COOKIE}=${encodedPayload}.invalid-signature`,
    )

    expect(getProjectAccessIds(request)).toEqual([])

    const result = await requireProjectAccess(request, 'project-1')
    expect(result.allowed).toBe(false)
  })

  it('rejects cross-site mutating requests before they can set access cookies', () => {
    const result = requireSameOriginRequest(
      new Request('https://example.com/api/projects', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
    )

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.response.status).toBe(403)
    }
  })

  it('allows same-origin and non-browser mutating requests', () => {
    expect(
      requireSameOriginRequest(
        new Request('https://example.com/api/projects', {
          method: 'POST',
          headers: {
            origin: 'https://example.com',
            'sec-fetch-site': 'same-origin',
          },
        }),
      ).allowed,
    ).toBe(true)

    expect(
      requireSameOriginRequest(
        new Request('https://example.com/api/projects', { method: 'POST' }),
      ).allowed,
    ).toBe(true)
  })

  it('requires the chat project to be present in the signed access cookie', async () => {
    vi.mocked(v0.projects.getByChatId).mockResolvedValue({
      id: 'project-1',
      object: 'project',
      name: 'Project 1',
      createdAt: '2026-05-29T00:00:00.000Z',
      apiUrl: 'https://api.v0.dev/projects/project-1',
      webUrl: 'https://v0.dev/projects/project-1',
      chats: [],
    })

    const allowed = await requireChatProjectAccess(
      requestWithCookie(projectAccessCookie(['project-1'])),
      'chat-1',
    )
    const denied = await requireChatProjectAccess(
      requestWithCookie(projectAccessCookie(['project-2'])),
      'chat-1',
    )

    expect(allowed).toEqual({ allowed: true, projectId: 'project-1' })
    expect(denied.allowed).toBe(false)
    expect(v0.projects.getByChatId).toHaveBeenCalledWith({ chatId: 'chat-1' })
  })
})
