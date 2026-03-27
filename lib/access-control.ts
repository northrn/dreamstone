import { NextResponse } from 'next/server'
import { createClient } from 'v0-sdk'
import {
  getUserIP,
  getUserProjects,
  isProjectTrackingEnabled,
} from '@/lib/rate-limiter'

export async function hasProjectAccess(
  request: Request,
  projectId: string,
): Promise<boolean> {
  if (!projectId) return false

  // If project tracking is unavailable, preserve current behavior.
  if (!isProjectTrackingEnabled()) return true

  const userIP = getUserIP(request)
  const userProjectIds = await getUserProjects(userIP)
  return userProjectIds.includes(projectId)
}

export async function requireProjectAccess(
  request: Request,
  projectId: string,
) {
  const hasAccess = await hasProjectAccess(request, projectId)
  if (hasAccess) return null

  return NextResponse.json(
    { error: 'FORBIDDEN', message: 'You do not have access to this project.' },
    { status: 403 },
  )
}

export function extractProjectIdFromChat(chat: unknown): string | null {
  if (!chat || typeof chat !== 'object') return null

  const record = chat as Record<string, unknown>

  if (typeof record.projectId === 'string' && record.projectId.length > 0) {
    return record.projectId
  }

  const project = record.project
  if (project && typeof project === 'object') {
    const projectRecord = project as Record<string, unknown>
    if (
      typeof projectRecord.id === 'string' &&
      projectRecord.id.length > 0
    ) {
      return projectRecord.id
    }
  }

  return null
}

export async function requireChatAccess(request: Request, chatId: string) {
  const client = createClient({
    apiKey: process.env.V0_API_KEY,
  })

  const chat = await client.chats.getById({ chatId })
  const projectId = extractProjectIdFromChat(chat)

  if (!projectId) {
    return {
      client,
      projectId: null,
      denied: NextResponse.json(
        { error: 'FORBIDDEN', message: 'Unable to verify chat ownership.' },
        { status: 403 },
      ),
      chat: null,
    }
  }

  const forbiddenResponse = await requireProjectAccess(request, projectId)
  if (forbiddenResponse) {
    return {
      client,
      projectId: null,
      denied: forbiddenResponse,
      chat: null,
    }
  }

  return {
    client,
    projectId,
    denied: null,
    chat,
  }
}
