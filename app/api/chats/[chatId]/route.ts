import { NextRequest, NextResponse } from 'next/server'
import { createClient } from 'v0-sdk'
import {
  getRequestOwner,
  jsonWithOwnerCookie,
  ownershipErrorResponse,
  requireChatOwnership,
} from '@/lib/ownership'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  let owner = getRequestOwner(request)

  try {
    const { chatId } = await params

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const v0 = createClient({
      apiKey: process.env.V0_API_KEY,
    })

    // Get chat details only after verifying this session owns its project.
    const { chat: response } = await requireChatOwnership(chatId, owner, v0)

    return jsonWithOwnerCookie(owner, response)
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
  let owner = getRequestOwner(request)

  try {
    const { chatId } = await params

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      )
    }

    const v0 = createClient({
      apiKey: process.env.V0_API_KEY,
    })

    await requireChatOwnership(chatId, owner, v0)

    // Delete chat using v0 SDK
    await v0.chats.delete({ chatId })

    return jsonWithOwnerCookie(owner, { success: true })
  } catch (error) {
    const ownershipResponse = ownershipErrorResponse(error, owner)
    if (ownershipResponse) {
      return ownershipResponse
    }

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
  let owner = getRequestOwner(request)

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

    const v0 = createClient({
      apiKey: process.env.V0_API_KEY,
    })

    await requireChatOwnership(chatId, owner, v0)

    // Update chat name using v0 SDK
    const response = await v0.chats.update({
      chatId: chatId,
      name: name.trim(),
    })

    return jsonWithOwnerCookie(owner, response)
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
