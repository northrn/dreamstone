import { describe, expect, it } from 'vitest'
import { getChatPreviewUrl } from './chat-preview'

describe('getChatPreviewUrl', () => {
  it('prefers deprecated demo when present', () => {
    expect(
      getChatPreviewUrl({
        demo: 'https://demo.example/old',
        latestVersion: { demoUrl: 'https://demo.example/new' },
        url: 'https://v0.dev/chat/abc',
      }),
    ).toBe('https://demo.example/old')
  })

  it('uses latestVersion.demoUrl when demo is missing', () => {
    expect(
      getChatPreviewUrl({
        latestVersion: { demoUrl: 'https://demo.example/preview' },
        url: 'https://v0.dev/chat/abc',
      }),
    ).toBe('https://demo.example/preview')
  })

  it('does not treat chat page urls as preview urls', () => {
    expect(
      getChatPreviewUrl({
        url: 'https://v0.dev/chat/abc',
        webUrl: 'https://v0.dev/chat/abc',
      }),
    ).toBeNull()
  })

  it('ignores empty demo strings and falls back to demoUrl', () => {
    expect(
      getChatPreviewUrl({
        demo: '   ',
        latestVersion: { demoUrl: 'https://demo.example/preview' },
      }),
    ).toBe('https://demo.example/preview')
  })

  it('returns null when no preview fields exist', () => {
    expect(getChatPreviewUrl({})).toBeNull()
    expect(getChatPreviewUrl({ latestVersion: { demoUrl: null } })).toBeNull()
  })
})
