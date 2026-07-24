/**
 * Resolve the iframe preview URL for a v0 chat/message response.
 *
 * Prefer the deprecated top-level `demo` for compatibility with older API
 * payloads, then `latestVersion.demoUrl` (current Platform API contract).
 * Never use `url`/`webUrl` — those point at the v0 chat page, not the app demo.
 */
export function getChatPreviewUrl(chat: {
  demo?: string | null
  latestVersion?: { demoUrl?: string | null } | null
  url?: string | null
  webUrl?: string | null
}): string | null {
  const candidates = [chat.demo, chat.latestVersion?.demoUrl]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }

  return null
}
