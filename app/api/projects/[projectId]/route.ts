import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import { getUserIP, userOwnsProject } from '@/lib/rate-limiter'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 },
      )
    }

    const userIP = getUserIP(request)
    const hasAccess = await userOwnsProject(userIP, projectId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 },
      )
    }

    // Get project details by ID
    const response = await v0.projects.getById({ projectId })

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
        { error: `Failed to get project: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ error: 'Failed to get project' }, { status: 500 })
  }
}
