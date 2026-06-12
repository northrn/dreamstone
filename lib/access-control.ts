import { NextResponse } from 'next/server'
import {
  getProjectOwner,
  getUserProjects,
  isProjectTrackingEnabled,
  type ProjectOwner,
} from '@/lib/rate-limiter'

type ChatReader = {
  chats: {
    getById: (args: { chatId: string }) => Promise<unknown>
  }
  projects?: {
    getByChatId: (args: { chatId: string }) => Promise<unknown>
  }
}

type AuthorizedProject = {
  authorized: true
  owner: ProjectOwner
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
  const owner = getProjectOwner(request)

  if (!isProjectTrackingEnabled()) {
    if (process.env.NODE_ENV !== 'production') {
      return { authorized: true, owner }
    }

    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Project access tracking is not configured' },
        { status: 503 },
      ),
    }
  }

  const userProjectIds = await getUserProjects(owner.key)
  if (userProjectIds.includes(projectId)) {
    return { authorized: true, owner }
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
  const projectId = await resolveChatProjectId(client, chatId, chat)

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
    owner: projectAccess.owner,
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

async function resolveChatProjectId(
  client: ChatReader,
  chatId: string,
  chat: unknown,
): Promise<string | null> {
  const chatProjectId = getChatProjectId(chat)
  if (chatProjectId) {
    return chatProjectId
  }

  if (!client.projects?.getByChatId) {
    return null
  }

  const project = await client.projects.getByChatId({ chatId })
  return getProjectId(project)
}

function getProjectId(project: unknown): string | null {
  const projectRecord = asRecord(project)
  if (!projectRecord) return null

  const id = projectRecord.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}
