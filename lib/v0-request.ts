/** Current v0 Platform API model IDs (OpenAPI enum). */
export type V0ModelId =
  | 'v0-auto'
  | 'v0-mini'
  | 'v0-pro'
  | 'v0-max'
  | 'v0-max-fast'

const CURRENT_MODEL_IDS = new Set<string>([
  'v0-auto',
  'v0-mini',
  'v0-pro',
  'v0-max',
  'v0-max-fast',
])

/** Legacy model IDs used by older SDK/docs; map to current tier names. */
const LEGACY_MODEL_MAP: Record<string, V0ModelId> = {
  'v0-1.5-sm': 'v0-mini',
  'v0-1.5-md': 'v0-pro',
  'v0-1.5-lg': 'v0-max',
}

export const DEFAULT_V0_MODEL_ID: V0ModelId = 'v0-pro'

/**
 * Normalize a client-supplied model ID to a value accepted by the current
 * Platform API. Unknown values fall back to the default.
 */
export function normalizeModelId(modelId: unknown): V0ModelId {
  if (typeof modelId !== 'string' || modelId.length === 0) {
    return DEFAULT_V0_MODEL_ID
  }

  if (CURRENT_MODEL_IDS.has(modelId)) {
    return modelId as V0ModelId
  }

  return LEGACY_MODEL_MAP[modelId] ?? DEFAULT_V0_MODEL_ID
}

export type V0Attachment = {
  url: string
}

/**
 * Create/sendMessage attachment items only allow `url` (additionalProperties: false).
 * Strip UI-only fields like name/type before calling the v0 API.
 */
export function normalizeAttachments(attachments: unknown): V0Attachment[] {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return []
  }

  return attachments.flatMap((attachment) => {
    if (
      attachment &&
      typeof attachment === 'object' &&
      'url' in attachment &&
      typeof (attachment as { url: unknown }).url === 'string' &&
      (attachment as { url: string }).url.length > 0
    ) {
      return [{ url: (attachment as { url: string }).url }]
    }
    return []
  })
}
