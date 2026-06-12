import { NextResponse } from 'next/server'
import {
  getUserIP,
  getUserProjects,
  isProjectTrackingEnabled,
} from '@/lib/rate-limiter'

type ChatReader = {
  chats: {
    getById: (args: { chatId: string }) => Promise<unknown>
  }
}

type AuthorizedProject = {
  authorized: true
  userIP: string
}

type AuthorizedChat = AuthorizedProject & {
  chat: unknown
  projectId: string
}

type Unauthorized = {
  authorized: false
  response: NextResponse
}

export async function authorizeProjectAccess(
  request: Request,
  projectId: string,
): Promise<AuthorizedProject | Unauthorized> {
  const userIP = getUserIP(request)

  // Without a project tracking store, the app runs in single-user demo mode.
  if (!isProjectTrackingEnabled()) {
    return { authorized: true, userIP }
  }

  const userProjectIds = await getUserProjects(userIP)
  if (userProjectIds.includes(projectId)) {
    return { authorized: true, userIP }
  }

  return {
    authorized: false,
    response: NextResponse.json(
      { error: 'You do not have access to this project' },
      { status: 403 },
    ),
  }
}

export async function authorizeChatAccess(
  request: Request,
  client: ChatReader,
  chatId: string,
  expectedProjectId?: string,
): Promise<AuthorizedChat | Unauthorized> {
  const chat = await client.chats.getById({ chatId })
  const projectId = getChatProjectId(chat)

  if (!projectId || (expectedProjectId && projectId !== expectedProjectId)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'You do not have access to this chat' },
        { status: 403 },
      ),
    }
  }

  const projectAccess = await authorizeProjectAccess(request, projectId)
  if (!projectAccess.authorized) {
    return projectAccess
  }

  return {
    authorized: true,
    userIP: projectAccess.userIP,
    chat,
    projectId,
  }
}

export function getChatProjectId(chat: unknown): string | null {
  const chatRecord = asRecord(chat)
  if (!chatRecord) return null

  const projectId = chatRecord.projectId
  if (typeof projectId === 'string' && projectId.length > 0) {
    return projectId
  }

  const project = asRecord(chatRecord.project)
  if (project && typeof project.id === 'string' && project.id.length > 0) {
    return project.id
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}
