import { randomUUID } from 'crypto'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

const OWNER_COOKIE_NAME = 'v0-owner-id'
const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const OWNER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const upstashUrl = process.env.KV_REST_API_URL
const upstashToken = process.env.KV_REST_API_TOKEN
const redis =
  upstashUrl &&
  upstashToken &&
  upstashUrl.trim() !== '' &&
  upstashToken.trim() !== ''
    ? new Redis({
        url: upstashUrl,
        token: upstashToken,
      })
    : null

type V0Client = {
  chats: {
    getById(params: { chatId: string }): Promise<{
      id: string
      projectId?: string
      latestVersion?: { id: string; status?: string }
    }>
  }
  projects: {
    getByChatId(params: { chatId: string }): Promise<{ id: string }>
  }
}

export type RequestOwner = {
  id: string
  shouldSetCookie: boolean
}

export class OwnershipStoreUnavailableError extends Error {
  constructor() {
    super(
      'Project ownership checks require KV_REST_API_URL and KV_REST_API_TOKEN to be configured.',
    )
    this.name = 'OwnershipStoreUnavailableError'
  }
}

export class OwnershipForbiddenError extends Error {
  constructor(message = 'You do not have access to this project or chat.') {
    super(message)
    this.name = 'OwnershipForbiddenError'
  }
}

export function getRequestOwner(request: NextRequest): RequestOwner {
  const cookieOwnerId = request.cookies.get(OWNER_COOKIE_NAME)?.value

  if (cookieOwnerId && OWNER_ID_PATTERN.test(cookieOwnerId)) {
    return { id: cookieOwnerId, shouldSetCookie: false }
  }

  return { id: randomUUID(), shouldSetCookie: true }
}

export function jsonWithOwnerCookie(
  owner: RequestOwner | undefined,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init)
  setOwnerCookie(response, owner)
  return response
}

export function ownershipErrorResponse(
  error: unknown,
  owner: RequestOwner | undefined,
) {
  if (error instanceof OwnershipStoreUnavailableError) {
    return jsonWithOwnerCookie(
      owner,
      {
        error: 'OWNERSHIP_STORE_UNAVAILABLE',
        message: error.message,
      },
      { status: 503 },
    )
  }

  if (error instanceof OwnershipForbiddenError) {
    return jsonWithOwnerCookie(
      owner,
      {
        error: 'FORBIDDEN',
        message: error.message,
      },
      { status: 403 },
    )
  }

  return null
}

export function ensureOwnershipStore() {
  if (!redis) {
    throw new OwnershipStoreUnavailableError()
  }
}

export async function associateProjectWithOwner(
  projectId: string,
  owner: RequestOwner,
) {
  ensureOwnershipStore()

  await Promise.all([
    redis!.sadd(ownerProjectsKey(owner.id), projectId),
    redis!.set(projectOwnerKey(projectId), owner.id),
  ])
}

export async function getOwnerProjects(owner: RequestOwner): Promise<string[]> {
  ensureOwnershipStore()

  const projectIds = await redis!.smembers(ownerProjectsKey(owner.id))
  return projectIds as string[]
}

export async function requireProjectOwnership(
  projectId: string,
  owner: RequestOwner,
) {
  ensureOwnershipStore()

  const projectOwner = await redis!.get(projectOwnerKey(projectId))

  if (projectOwner !== owner.id) {
    throw new OwnershipForbiddenError()
  }
}

export async function requireChatOwnership(
  chatId: string,
  owner: RequestOwner,
  client: V0Client,
) {
  ensureOwnershipStore()

  const chat = await client.chats.getById({ chatId })
  let projectId = chat.projectId

  if (!projectId) {
    const project = await client.projects.getByChatId({ chatId })
    projectId = project.id
  }

  if (!projectId) {
    throw new OwnershipForbiddenError(
      'Unable to verify ownership for this chat.',
    )
  }

  await requireProjectOwnership(projectId, owner)

  return { chat, projectId }
}

function setOwnerCookie(
  response: NextResponse,
  owner: RequestOwner | undefined,
) {
  if (!owner?.shouldSetCookie) {
    return
  }

  response.cookies.set(OWNER_COOKIE_NAME, owner.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OWNER_COOKIE_MAX_AGE,
  })
}

function ownerProjectsKey(ownerId: string) {
  return `owner_projects:${ownerId}`
}

function projectOwnerKey(projectId: string) {
  return `project_owner:${projectId}`
}
