import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import {
  grantProjectAccess,
  requireChatProjectAccess,
  requireProjectAccess,
  requireSameOriginRequest,
} from '@/lib/project-access'

export async function POST(request: NextRequest) {
  try {
    const originAccess = requireSameOriginRequest(request)
    if (!originAccess.allowed) {
      return originAccess.response
    }

    const { chatId, projectId } = await request.json()

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const sourceAccess = await requireChatProjectAccess(request, chatId)
    if (!sourceAccess.allowed) {
      return sourceAccess.response
    }

    if (projectId) {
      const targetAccess = await requireProjectAccess(request, projectId)
      if (!targetAccess.allowed) {
        return targetAccess.response
      }
    }

    // Fork the chat using v0 SDK
    const forkedChat = await v0.chats.fork({
      chatId: chatId,
      ...(projectId && { projectId }), // Include projectId if provided
    })

    const response = NextResponse.json(forkedChat)

    if (forkedChat.projectId) {
      grantProjectAccess(request, response, forkedChat.projectId)
    }

    return response
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
