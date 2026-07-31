import { useState, useEffect } from 'react'
import {
  DEFAULT_V0_MODEL_ID,
  normalizeModelId,
  type V0ModelId,
} from '@/lib/v0-request'

export type ModelType = V0ModelId

export interface Settings {
  model: ModelType
  imageGenerations: boolean
  thinking: boolean
}

const DEFAULT_SETTINGS: Settings = {
  model: DEFAULT_V0_MODEL_ID,
  imageGenerations: false,
  thinking: false,
}

function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    model: normalizeModelId(raw?.model),
    imageGenerations: Boolean(raw?.imageGenerations),
    thinking: Boolean(raw?.thinking),
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('v0-settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        const normalized = normalizeSettings(parsed)
        setSettings(normalized)

        // Persist migration away from legacy model IDs
        if (parsed?.model !== normalized.model) {
          localStorage.setItem('v0-settings', JSON.stringify(normalized))
        }
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error)
    }
  }, [])

  // Save settings to localStorage when they change
  const updateSettings = (newSettings: Partial<Settings>) => {
    const updated = normalizeSettings({ ...settings, ...newSettings })
    setSettings(updated)

    try {
      localStorage.setItem('v0-settings', JSON.stringify(updated))
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error)
    }
  }

  return {
    settings,
    updateSettings,
  }
}
