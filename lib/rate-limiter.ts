import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const projectOwnerCookieName = 'v0_project_owner'
const projectOwnerCookieMaxAge = 60 * 60 * 24 * 365

export type ProjectOwner = {
  key: string
  cookie?: string
}

// Check if Upstash credentials are available
const upstashUrl = process.env.KV_REST_API_URL
const upstashToken = process.env.KV_REST_API_TOKEN
const isRateLimitingEnabled =
  upstashUrl &&
  upstashToken &&
  upstashUrl.trim() !== '' &&
  upstashToken.trim() !== ''

// Create Redis instance and rate limiter only if credentials are available
let generationRateLimit: Ratelimit | null = null
let redis: Redis | null = null

if (isRateLimitingEnabled) {
  redis = new Redis({
    url: upstashUrl!,
    token: upstashToken!,
  })

  // Create rate limiter: 3 requests per 12 hours (43200 seconds)
  generationRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '43200 s'), // 3 requests per 12 hours
    analytics: true,
    prefix: 'v0_generation_limit',
  })
}

export function isProjectTrackingEnabled(): boolean {
  return redis !== null
}

export function canCreateProjectOwnershipRecords(): boolean {
  return isProjectTrackingEnabled() || process.env.NODE_ENV !== 'production'
}

export function getProjectOwner(request: Request): ProjectOwner {
  const cookie = getCookie(request, projectOwnerCookieName)
  const existingOwnerId = cookie ? verifyOwnerCookie(cookie) : null

  if (existingOwnerId) {
    return { key: projectOwnerKey(existingOwnerId) }
  }

  const ownerId = randomUUID()
  return {
    key: projectOwnerKey(ownerId),
    cookie: serializeOwnerCookie(ownerId),
  }
}

export function applyProjectOwnerCookie<T extends Response>(
  response: T,
  owner: ProjectOwner,
): T {
  if (owner.cookie) {
    response.headers.append('Set-Cookie', owner.cookie)
  }

  return response
}

// Function to get user identifier from request
export function getUserIdentifier(request: Request): string {
  // Try to get IP address from various headers
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')

  // Use the first available IP, fallback to a default
  const ip = forwarded?.split(',')[0] || realIp || cfConnectingIp || 'unknown'

  // You can extend this to use user authentication if available
  // For now, we'll use IP-based rate limiting
  return `ip:${ip}`
}

// Function to get just the IP address from request
export function getUserIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')

  return forwarded?.split(',')[0] || realIp || cfConnectingIp || 'unknown'
}

// Function to associate an owner with a project
export async function associateProjectWithOwner(
  projectId: string,
  ownerKey: string,
): Promise<void> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Project access tracking is not configured')
    }

    return
  }

  try {
    // Store only user_projects mapping
    await redis.sadd(`user_projects:${ownerKey}`, projectId)
  } catch (error) {
    console.warn('Failed to associate project with owner:', error)
    if (process.env.NODE_ENV === 'production') {
      throw error
    }
  }
}

// Function to get user's projects
export async function getUserProjects(ownerKey: string): Promise<string[]> {
  if (!redis) return [] // Return empty if Redis is not available

  try {
    const projectIds = await redis.smembers(`user_projects:${ownerKey}`)
    return projectIds as string[]
  } catch (error) {
    console.warn('Failed to get user projects:', error)
    return []
  }
}

// Check if rate limit is exceeded
export async function checkRateLimit(identifier: string) {
  // If rate limiting is not enabled, always allow the request
  if (!isRateLimitingEnabled || !generationRateLimit) {
    return {
      success: true,
      limit: 3,
      reset: Date.now() + 43200000, // 12 hours from now
      remaining: 3,
      resetTime: new Date(Date.now() + 43200000),
    }
  }

  try {
    const { success, limit, reset, remaining } =
      await generationRateLimit.limit(identifier)

    return {
      success,
      limit,
      reset,
      remaining,
      resetTime: new Date(reset),
    }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // On error, allow the request (fail open)
    return {
      success: true,
      limit: 3,
      reset: Date.now() + 43200000, // 12 hours from now
      remaining: 3,
      resetTime: new Date(Date.now() + 43200000),
    }
  }
}

function projectOwnerKey(ownerId: string): string {
  return `owner:${ownerId}`
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === name) {
      return rawValue.join('=')
    }
  }

  return null
}

function serializeOwnerCookie(ownerId: string): string {
  const value = `${ownerId}.${signOwnerId(ownerId)}`
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''

  return `${projectOwnerCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${projectOwnerCookieMaxAge}${secure}`
}

function verifyOwnerCookie(value: string): string | null {
  const [ownerId, signature] = value.split('.')
  if (!ownerId || !signature) return null

  const expectedSignature = signOwnerId(ownerId)
  const signatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null
  }

  return ownerId
}

function signOwnerId(ownerId: string): string {
  return createHmac('sha256', getProjectOwnerSecret())
    .update(ownerId)
    .digest('base64url')
}

function getProjectOwnerSecret(): string {
  const secret = process.env.PROJECT_ACCESS_SECRET || process.env.V0_API_KEY
  if (secret) return secret

  if (process.env.NODE_ENV !== 'production') {
    return 'development-project-owner-secret'
  }

  throw new Error('PROJECT_ACCESS_SECRET or V0_API_KEY is required')
}
