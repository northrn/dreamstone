import { NextRequest, NextResponse } from 'next/server'
import { createClient } from 'v0-sdk'
import { getUserIP, userOwnsProject } from '@/lib/rate-limiter'

async function ensureUserOwnsChat(
  request: NextRequest,
  chatId: string,
): Promise<{ errorResponse: NextResponse | null; v0: ReturnType<typeof createClient> }> {
  const v0 = createClient({
    apiKey: process.env.V0_API_KEY,
  })

  const chat = await v0.chats.getById({ chatId })
  if (!chat?.projectId) {
    return {
      errorResponse: NextResponse.json({ error: 'Chat not found' }, { status: 404 }),
      v0,
    }
  }

  const userIP = getUserIP(request)
  const ownsProject = await userOwnsProject(userIP, chat.projectId)
  if (!ownsProject) {
    return {
      errorResponse: NextResponse.json({ error: 'Chat not found' }, { status: 404 }),
      v0,
    }
  }

  return { errorResponse: null, v0 }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const { errorResponse, v0 } = await ensureUserOwnsChat(request, chatId)
    if (errorResponse) return errorResponse

    // Get chat details by ID
    const response = await v0.chats.getById({ chatId: chatId })

    return NextResponse.json(response)
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
        { error: `Failed to get chat: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ error: 'Failed to get chat' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const { errorResponse, v0 } = await ensureUserOwnsChat(request, chatId)
    if (errorResponse) return errorResponse

    // Delete chat using v0 SDK
    await v0.chats.delete({ chatId })

    return NextResponse.json({ success: true })
  } catch (error) {
    // Check if it's an API key error
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
    }

    return NextResponse.json(
      { error: 'Failed to delete chat' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params
    const { name } = await request.json()

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    const { errorResponse, v0 } = await ensureUserOwnsChat(request, chatId)
    if (errorResponse) return errorResponse

    // Update chat name using v0 SDK
    const response = await v0.chats.update({
      chatId: chatId,
      name: name.trim(),
    })

    return NextResponse.json(response)
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
        { error: `Failed to update chat: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to update chat' },
      { status: 500 },
    )
  }
}
