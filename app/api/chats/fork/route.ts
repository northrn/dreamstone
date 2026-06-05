import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import {
  associateProjectWithRequest,
  forbiddenResponse,
  ownsProject,
  projectIdForChat,
  projectIdFromResource,
} from '@/lib/project-ownership'

export async function POST(request: NextRequest) {
  try {
    const { chatId, projectId } = await request.json()

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const sourceChat = await v0.chats.getById({ chatId })
    const sourceProjectId = await projectIdForChat(v0, chatId, sourceChat)

    if (!sourceProjectId || !(await ownsProject(request, sourceProjectId))) {
      return forbiddenResponse()
    }

    if (projectId && !(await ownsProject(request, projectId))) {
      return forbiddenResponse()
    }

    // Fork the chat using v0 SDK
    const forkedChat = await v0.chats.fork({
      chatId: chatId,
      ...(projectId && { projectId }), // Include projectId if provided
    })

    // If a project was created/returned, associate it with the user's IP
    const forkedProjectId = projectIdFromResource(forkedChat)

    if (forkedProjectId) {
      const responseBody = { ...forkedChat, projectId: forkedProjectId }
      const jsonResponse = NextResponse.json(responseBody)
      await associateProjectWithRequest(request, jsonResponse, forkedProjectId)

      return jsonResponse
    }

    return NextResponse.json(forkedChat)
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      if (
        errorMessage.includes('api key is required') ||
        errorMessage.includes('v0_api_key') ||
        errorMessage.includes('config.apikey')
      ) {
        return NextResponse.json(
          { error: 'API_KEY_MISSING', message: error.message },
          { status: 401 },
        )
      }

      return NextResponse.json(
        { error: `Failed to fork chat: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ error: 'Failed to fork chat' }, { status: 500 })
  }
}
