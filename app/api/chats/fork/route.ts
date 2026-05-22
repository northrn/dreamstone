import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import {
  associateProjectWithOwner,
  getRequestOwner,
  jsonWithOwnerCookie,
  ownershipErrorResponse,
  requireChatOwnership,
  requireProjectOwnership,
} from '@/lib/ownership'

export async function POST(request: NextRequest) {
  let owner = getRequestOwner(request)

  try {
    const { chatId, projectId } = await request.json()

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    await requireChatOwnership(chatId, owner, v0)

    if (projectId) {
      await requireProjectOwnership(projectId, owner)
    }

    // Fork the chat using v0 SDK
    const forkedChat = await v0.chats.fork({
      chatId: chatId,
      ...(projectId && { projectId }), // Include projectId if provided
    })

    // If a project was created/returned, associate it with this browser session.
    const forkedProjectId =
      forkedChat.projectId ??
      (await v0.projects.getByChatId({ chatId: forkedChat.id })).id

    if (forkedProjectId) {
      await associateProjectWithOwner(forkedProjectId, owner)
    }

    return jsonWithOwnerCookie(owner, forkedChat)
  } catch (error) {
    const ownershipResponse = ownershipErrorResponse(error, owner)
    if (ownershipResponse) {
      return ownershipResponse
    }

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
