import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'

export const PROJECT_ACCESS_COOKIE = 'v0_project_access'

const PROJECT_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const MAX_PROJECT_IDS_PER_COOKIE = 100

export type ProjectAccessResult =
  | { allowed: true }
  | { allowed: false; response: NextResponse }

export type ChatProjectAccessResult =
  | { allowed: true; projectId: string }
  | { allowed: false; response: NextResponse }

function notFoundResponse() {
  return NextResponse.json({ error: 'Project not found' }, { status: 404 })
}

function signingSecret() {
  return process.env.V0_API_KEY
}

function sign(payload: string) {
  const secret = signingSecret()

  if (!secret) {
    return null
  }

  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function signaturesMatch(payload: string, signature: string) {
  const expectedSignature = sign(payload)

  if (!expectedSignature) {
    return false
  }

  const expected = Buffer.from(expectedSignature)
  const actual = Buffer.from(signature)

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=')
    const value = rawValueParts.join('=')

    if (!rawName || !value) {
      continue
    }

    try {
      cookies.set(rawName, decodeURIComponent(value))
    } catch {
      cookies.set(rawName, value)
    }
  }

  return cookies
}

function normalizeProjectIds(projectIds: string[]) {
  return Array.from(
    new Set(
      projectIds.filter(
        (projectId) => typeof projectId === 'string' && projectId.length > 0,
      ),
    ),
  ).slice(-MAX_PROJECT_IDS_PER_COOKIE)
}

export function getProjectAccessIds(request: Request) {
  const cookieValue = parseCookieHeader(request.headers.get('cookie')).get(
    PROJECT_ACCESS_COOKIE,
  )

  if (!cookieValue) {
    return []
  }

  const [payload, signature] = cookieValue.split('.')

  if (!payload || !signature || !signaturesMatch(payload, signature)) {
    return []
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return normalizeProjectIds(decoded.projectIds || [])
  } catch {
    return []
  }
}

export function grantProjectAccess(
  request: Request,
  response: NextResponse,
  projectId: string,
) {
  const projectIds = normalizeProjectIds([
    ...getProjectAccessIds(request),
    projectId,
  ])
  const payload = Buffer.from(JSON.stringify({ projectIds })).toString(
    'base64url',
  )
  const signature = sign(payload)

  if (!signature) {
    return response
  }

  response.cookies.set(PROJECT_ACCESS_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    maxAge: PROJECT_ACCESS_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}

export async function requireProjectAccess(
  request: Request,
  projectId: string,
): Promise<ProjectAccessResult> {
  const userProjectIds = getProjectAccessIds(request)

  if (userProjectIds.includes(projectId)) {
    return { allowed: true }
  }

  return { allowed: false, response: notFoundResponse() }
}

export async function requireChatProjectAccess(
  request: Request,
  chatId: string,
): Promise<ChatProjectAccessResult> {
  const project = await v0.projects.getByChatId({ chatId })

  if (!project.id) {
    return { allowed: false, response: notFoundResponse() }
  }

  const projectAccess = await requireProjectAccess(request, project.id)

  if (!projectAccess.allowed) {
    return projectAccess
  }

  return { allowed: true, projectId: project.id }
}
