import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import {
  applyProjectOwnerCookie,
  associateProjectWithOwner,
} from '@/lib/rate-limiter'
import { authorizeChatAccess } from '@/lib/access-control'

export async function POST(request: NextRequest) {
  try {
    const { chatId, projectId } = await request.json()

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const chatAccess = await authorizeChatAccess(request, v0, chatId, projectId)
    if (!chatAccess.authorized) {
      return chatAccess.response
    }

    // Fork the chat using v0 SDK
    const forkedChat = await v0.chats.fork({
      chatId: chatId,
      ...(projectId && { projectId }), // Include projectId if provided
    })

    // If a project was created/returned, associate it with the signed browser owner.
    if (forkedChat.projectId) {
      await associateProjectWithOwner(
        forkedChat.projectId,
        chatAccess.owner.key,
      )
    }

    return applyProjectOwnerCookie(
      NextResponse.json(forkedChat),
      chatAccess.owner,
    )
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
