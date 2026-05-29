import { NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import { getUserIP, getUserProjects } from '@/lib/rate-limiter'

export type ProjectAccessResult =
  | { allowed: true }
  | { allowed: false; response: NextResponse }

export type ChatProjectAccessResult =
  | { allowed: true; projectId: string }
  | { allowed: false; response: NextResponse }

function notFoundResponse() {
  return NextResponse.json({ error: 'Project not found' }, { status: 404 })
}

export async function requireProjectAccess(
  request: Request,
  projectId: string,
): Promise<ProjectAccessResult> {
  const userIP = getUserIP(request)
  const userProjectIds = await getUserProjects(userIP)

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
