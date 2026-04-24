import { NextResponse } from 'next/server'
import { createClient } from 'v0-sdk'
import { getUserIP, userOwnsProject } from '@/lib/rate-limiter'

type AnyRecord = Record<string, unknown>

export function extractProjectIdFromChat(chat: unknown): string | null {
  if (!chat || typeof chat !== 'object') {
    return null
  }

  const chatRecord = chat as AnyRecord

  if (
    typeof chatRecord.projectId === 'string' &&
    chatRecord.projectId.trim().length > 0
  ) {
    return chatRecord.projectId
  }

  const project = chatRecord.project
  if (project && typeof project === 'object') {
    const projectRecord = project as AnyRecord
    if (
      typeof projectRecord.id === 'string' &&
      projectRecord.id.trim().length > 0
    ) {
      return projectRecord.id
    }
  }

  return null
}

export async function requireProjectAccess(
  request: Request,
  projectId: string,
): Promise<NextResponse | null> {
  const userIP = getUserIP(request)
  const hasAccess = await userOwnsProject(userIP, projectId)

  if (hasAccess) {
    return null
  }

  return NextResponse.json({ error: 'Project not found' }, { status: 404 })
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
      chat: null,
      projectId: null,
      denied: NextResponse.json({ error: 'Chat not found' }, { status: 404 }),
    }
  }

  const forbiddenResponse = await requireProjectAccess(request, projectId)
  if (forbiddenResponse) {
    return {
      client,
      chat: null,
      projectId: null,
      denied: forbiddenResponse,
    }
  }

  return {
    client,
    chat,
    projectId,
    denied: null,
  }
}
