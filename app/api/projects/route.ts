import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import {
  associateProjectWithOwner,
  ensureOwnershipStore,
  getOwnerProjects,
  getRequestOwner,
  jsonWithOwnerCookie,
  ownershipErrorResponse,
} from '@/lib/ownership'

export async function GET(request: NextRequest) {
  let owner = getRequestOwner(request, { createIfMissing: false })

  try {
    if (!owner) {
      return NextResponse.json({ data: [] })
    }

    // Get project IDs owned by this anonymous browser session.
    const ownerProjectIds = await getOwnerProjects(owner)

    // Get all projects from v0
    const response = await v0.projects.find()
    const allProjects = response.data || response || []

    // Filter projects to only include those owned by this session
    const userProjects = allProjects.filter((project: any) =>
      ownerProjectIds.includes(project.id),
    )

    return jsonWithOwnerCookie(owner, { data: userProjects })
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
      { error: 'Failed to fetch projects' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  let owner = getRequestOwner(request)

  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 },
      )
    }

    ensureOwnershipStore()

    // Create project using v0 SDK
    const project = await v0.projects.create({
      name: name.trim(),
    })

    // Associate the project with the anonymous browser session
    if (project.id) {
      await associateProjectWithOwner(project.id, owner)
    }

    return jsonWithOwnerCookie(owner, project)
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
      { error: 'Failed to create project' },
      { status: 500 },
    )
  }
}
