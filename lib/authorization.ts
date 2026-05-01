import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getUserIP, getUserProjects, isProjectAssociationStoreEnabled } from './rate-limiter'

const projectOwnershipCookie = 'v0_owned_projects'
const cookieMaxAge = 60 * 60 * 24 * 30

export function forbiddenResponse() {
  return NextResponse.json(
    { error: 'FORBIDDEN', message: 'You do not have access to this resource' },
    { status: 403 },
  )
}

function signingSecret() {
  return process.env.PROJECT_OWNERSHIP_SECRET || process.env.V0_API_KEY || ''
}

function sign(value: string) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url')
}

function readOwnedProjectsFromCookie(request: NextRequest) {
  const secret = signingSecret()
  const cookieValue = request.cookies.get(projectOwnershipCookie)?.value

  if (!secret || !cookieValue) {
    return []
  }

  const separator = cookieValue.lastIndexOf('.')
  if (separator === -1) {
    return []
  }

  const payload = cookieValue.slice(0, separator)
  const signature = cookieValue.slice(separator + 1)
  const expectedSignature = sign(payload)

  try {
    if (
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
    ) {
      return []
    }
  } catch {
    return []
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export function addProjectOwnershipCookie(
  response: NextResponse,
  request: NextRequest,
  projectId: string,
) {
  if (isProjectAssociationStoreEnabled()) {
    return response
  }

  const secret = signingSecret()

  if (!secret) {
    return response
  }

  const ownedProjectIds = new Set(readOwnedProjectsFromCookie(request))
  ownedProjectIds.add(projectId)

  const payload = Buffer.from(
    JSON.stringify([...ownedProjectIds]),
    'utf8',
  ).toString('base64url')

  response.cookies.set(projectOwnershipCookie, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: cookieMaxAge,
  })

  return response
}

export async function isProjectOwnedByRequest(
  request: NextRequest,
  projectId: string,
) {
  const userProjectIds = isProjectAssociationStoreEnabled()
    ? await getUserProjects(getUserIP(request))
    : []

  return (
    userProjectIds.includes(projectId) ||
    readOwnedProjectsFromCookie(request).includes(projectId)
  )
}

export async function ownedProjectIdsForRequest(request: NextRequest) {
  const ownedProjectIds = new Set(readOwnedProjectsFromCookie(request))

  if (isProjectAssociationStoreEnabled()) {
    const persistedProjectIds = await getUserProjects(getUserIP(request))
    for (const projectId of persistedProjectIds) {
      ownedProjectIds.add(projectId)
    }
  }

  return ownedProjectIds
}

export async function authorizeProjectAccess(
  request: NextRequest,
  projectId: string,
  v0: { projects: { getById: (input: { projectId: string }) => Promise<any> } },
) {
  if (!(await isProjectOwnedByRequest(request, projectId))) {
    return { authorized: false as const, response: forbiddenResponse() }
  }

  const project = await v0.projects.getById({ projectId })

  return { authorized: true as const, project }
}

export function projectHasChat(project: any, chatId: string) {
  const chats = Array.isArray(project?.chats) ? project.chats : []

  return chats.some((chat: any) => chat?.id === chatId)
}

export function chatHasVersion(chat: any, versionId: string) {
  if (chat?.latestVersion?.id === versionId) {
    return true
  }

  const versions = Array.isArray(chat?.versions) ? chat.versions : []

  return versions.some((version: any) => version?.id === versionId)
}
