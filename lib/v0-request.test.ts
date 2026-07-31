import { describe, expect, it } from 'vitest'
import {
  DEFAULT_V0_MODEL_ID,
  normalizeAttachments,
  normalizeModelId,
} from './v0-request'

describe('normalizeModelId', () => {
  it('maps legacy model IDs to current Platform API tiers', () => {
    expect(normalizeModelId('v0-1.5-sm')).toBe('v0-mini')
    expect(normalizeModelId('v0-1.5-md')).toBe('v0-pro')
    expect(normalizeModelId('v0-1.5-lg')).toBe('v0-max')
  })

  it('passes through current model IDs', () => {
    expect(normalizeModelId('v0-mini')).toBe('v0-mini')
    expect(normalizeModelId('v0-pro')).toBe('v0-pro')
    expect(normalizeModelId('v0-max')).toBe('v0-max')
    expect(normalizeModelId('v0-max-fast')).toBe('v0-max-fast')
    expect(normalizeModelId('v0-auto')).toBe('v0-auto')
  })

  it('falls back for missing or unknown values', () => {
    expect(normalizeModelId(undefined)).toBe(DEFAULT_V0_MODEL_ID)
    expect(normalizeModelId('')).toBe(DEFAULT_V0_MODEL_ID)
    expect(normalizeModelId('not-a-model')).toBe(DEFAULT_V0_MODEL_ID)
  })
})

describe('normalizeAttachments', () => {
  it('keeps only url fields required by the Platform API', () => {
    expect(
      normalizeAttachments([
        {
          url: 'data:image/png;base64,abc',
          name: 'shot.png',
          type: 'image/png',
        },
        { url: 'https://example.com/a.png', contentType: 'image/png' },
      ]),
    ).toEqual([
      { url: 'data:image/png;base64,abc' },
      { url: 'https://example.com/a.png' },
    ])
  })

  it('drops invalid entries', () => {
    expect(
      normalizeAttachments([
        null,
        {},
        { url: '' },
        { name: 'missing-url.png' },
        { url: 'https://example.com/ok.png' },
      ]),
    ).toEqual([{ url: 'https://example.com/ok.png' }])
  })

  it('returns an empty list for non-arrays', () => {
    expect(normalizeAttachments(undefined)).toEqual([])
    expect(normalizeAttachments(null)).toEqual([])
    expect(normalizeAttachments('nope')).toEqual([])
  })
})
