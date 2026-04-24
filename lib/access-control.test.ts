import { describe, expect, it } from 'vitest'
import { extractProjectIdFromChat } from '@/lib/access-control'

describe('extractProjectIdFromChat', () => {
  it('returns top-level projectId when present', () => {
    expect(extractProjectIdFromChat({ projectId: 'proj_123' })).toBe('proj_123')
  })

  it('falls back to nested project.id when top-level projectId is missing', () => {
    expect(extractProjectIdFromChat({ project: { id: 'proj_nested' } })).toBe(
      'proj_nested',
    )
  })

  it('returns null when no usable project identifier exists', () => {
    expect(extractProjectIdFromChat({ project: {} })).toBeNull()
    expect(extractProjectIdFromChat(null)).toBeNull()
    expect(extractProjectIdFromChat('not-an-object')).toBeNull()
  })
})
