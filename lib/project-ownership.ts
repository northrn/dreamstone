import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import {
  associateProjectWithIP,
  getUserIP,
  getUserProjects,
} from './rate-limiter'

const PROJECT_OWNERSHIP_COOKIE = 'v0-owned-projects'
const MAX_COOKIE_PROJECTS = 75
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function getSigningSecret() {
  return process.env.PROJECT_OWNERSHIP_SECRET || process.env.V0_API_KEY || null
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function signaturesMatch(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
}

function uniqueProjectIds(projectIds: string[]) {
  return Array.from(
    new Set(projectIds.filter((id) => typeof id === 'string' && id.length > 0)),
  )
}

export function projectIdFromResource(resource: unknown): string | undefined {
  if (!resource || typeof resource !== 'object') return undefined

  const record = resource as Record<string, unknown>
  if (typeof record.projectId === 'string') return record.projectId

  const project = record.project
  if (project && typeof project === 'object') {
    const projectRecord = project as Record<string, unknown>
    if (typeof projectRecord.id === 'string') return projectRecord.id
  }

  return undefined
}

export function getCookieProjectIds(request: NextRequest) {
  const secret = getSigningSecret()
  if (!secret) return []

  const value = request.cookies.get(PROJECT_OWNERSHIP_COOKIE)?.value
  if (!value) return []

  const [encodedPayload, signature] = value.split('.')
  if (!encodedPayload || !signature) return []

  const expectedSignature = sign(encodedPayload, secret)
  if (!signaturesMatch(signature, expectedSignature)) return []

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload))
    if (!Array.isArray(parsed)) return []

    return uniqueProjectIds(parsed)
  } catch {
    return []
  }
}

function setCookieProjectIds(response: NextResponse, projectIds: string[]) {
  const secret = getSigningSecret()
  if (!secret) return

  const normalizedProjectIds =
    uniqueProjectIds(projectIds).slice(-MAX_COOKIE_PROJECTS)
  const payload = base64UrlEncode(JSON.stringify(normalizedProjectIds))
  const signature = sign(payload, secret)

  response.cookies.set(PROJECT_OWNERSHIP_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export function addOwnedProjectsToResponse(
  request: NextRequest,
  response: NextResponse,
  projectIds: string[],
) {
  const cookieProjectIds = getCookieProjectIds(request)
  setCookieProjectIds(response, [...cookieProjectIds, ...projectIds])
}

export async function associateProjectWithRequest(
  request: NextRequest,
  response: NextResponse,
  projectId: string,
) {
  await associateProjectWithIP(projectId, getUserIP(request))
  addOwnedProjectsToResponse(request, response, [projectId])
}

export async function getOwnedProjectIds(request: NextRequest) {
  const cookieProjectIds = getCookieProjectIds(request)
  const ipProjectIds = await getUserProjects(getUserIP(request))

  return uniqueProjectIds([...cookieProjectIds, ...ipProjectIds])
}

export async function ownsProject(request: NextRequest, projectId: string) {
  const projectIds = await getOwnedProjectIds(request)
  return projectIds.includes(projectId)
}

export function forbiddenResponse() {
  return NextResponse.json(
    { error: 'You do not have access to this project or chat' },
    { status: 403 },
  )
}
