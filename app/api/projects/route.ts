import { NextRequest, NextResponse } from 'next/server'
import { v0 } from 'v0-sdk'
import {
  applyProjectOwnerCookie,
  canCreateProjectOwnershipRecords,
  getProjectOwner,
  getUserProjects,
  associateProjectWithOwner,
} from '@/lib/rate-limiter'

export async function GET(request: NextRequest) {
  try {
    const owner = getProjectOwner(request)

    // Get all projects from v0
    const response = await v0.projects.find()
    const allProjects = response.data || response || []

    // Get user's project IDs from Redis
    const userProjectIds = await getUserProjects(owner.key)

    // Filter projects to only include those owned by this user
    const userProjects = allProjects.filter((project: any) =>
      userProjectIds.includes(project.id),
    )

    return applyProjectOwnerCookie(
      NextResponse.json({ data: userProjects }),
      owner,
    )
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
      { error: 'Failed to fetch projects' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 },
      )
    }

    const owner = getProjectOwner(request)

    // Create project using v0 SDK
    if (!canCreateProjectOwnershipRecords()) {
      return NextResponse.json(
        { error: 'Project access tracking is not configured' },
        { status: 503 },
      )
    }

    const project = await v0.projects.create({
      name: name.trim(),
    })

    // Associate the project with the signed browser owner.
    if (project.id) {
      await associateProjectWithOwner(project.id, owner.key)
    }

    return applyProjectOwnerCookie(NextResponse.json(project), owner)
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
      { error: 'Failed to create project' },
      { status: 500 },
    )
  }
}
