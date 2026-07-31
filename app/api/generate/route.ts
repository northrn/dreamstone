import { v0 } from 'v0-sdk'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getUserIdentifier, getUserIP, associateProjectWithIP } from '@/lib/rate-limiter'
import {
  DEFAULT_V0_MODEL_ID,
  normalizeAttachments,
  normalizeModelId,
} from '@/lib/v0-request'

export async function POST(request: NextRequest) {
  try {
    const {
      message,
      chatId,
      projectId,
      modelId = DEFAULT_V0_MODEL_ID,
      imageGenerations = false,
      thinking = false,
      attachments = [],
    } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 },
      )
    }

    // Check rate limit for ALL generations (both new and existing chats)
    const userIdentifier = getUserIdentifier(request)
    const userIP = getUserIP(request)
    const rateLimitResult = await checkRateLimit(userIdentifier)
    
    if (!rateLimitResult.success) {
      const resetTime = rateLimitResult.resetTime.toLocaleString()
      return NextResponse.json(
        { 
          error: 'RATE_LIMIT_EXCEEDED',
          message: `You've reached the limit of 3 generations per 12 hours. Please try again after ${resetTime}.`,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime.toISOString()
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.reset.toString(),
          }
        }
      )
    }

    // Platform API rejects legacy model IDs and attachment extra fields.
    const resolvedModelId = normalizeModelId(modelId)
    const resolvedAttachments = normalizeAttachments(attachments)

    let response

    if (chatId) {
      // Continue existing chat using sendMessage
      response = await v0.chats.sendMessage({
        chatId: chatId,
        message: message.trim(),
        modelConfiguration: {
          // SDK 0.5.1 types still list legacy IDs; runtime uses current API IDs.
          modelId: resolvedModelId as never,
          imageGenerations: imageGenerations,
          thinking: thinking,
        },
        ...(resolvedAttachments.length > 0 && {
          attachments: resolvedAttachments,
        }),
      })
    } else {
      // Create new chat
      response = await v0.chats.create({
        system: 'v0 MUST always generate code even if the user just says "hi" or asks a question. v0 MUST NOT ask the user to clarify their request.',
        message: message.trim(),
        modelConfiguration: {
          // SDK 0.5.1 types still list legacy IDs; runtime uses current API IDs.
          modelId: resolvedModelId as never,
          imageGenerations: imageGenerations,
          thinking: thinking,
        },
        ...(projectId && { projectId }),
        ...(resolvedAttachments.length > 0 && {
          attachments: resolvedAttachments,
        }),
      })

      // If a project was created/returned, associate it with the user's IP
      if (response.projectId) {
        await associateProjectWithIP(response.projectId, userIP)
      }
      
      // Rename the new chat to "Main" for new projects
      try {
        await v0.chats.update({
          chatId: response.id,
          name: 'Main',
        })
      } catch (updateError) {
        // Don't fail the entire request if renaming fails
      }
    }

    return NextResponse.json(response)
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

      return NextResponse.json(
        { error: `Failed to generate app: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to generate app. Please try again.' },
      { status: 500 },
    )
  }
}
