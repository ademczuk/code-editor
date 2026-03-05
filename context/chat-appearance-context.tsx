'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'

export type ChatFontFamily = 'system' | 'mono' | 'serif' | 'sans'

const FONT_FAMILY_MAP: Record<ChatFontFamily, string> = {
  system: 'inherit',
  mono: 'var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace)',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  sans: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

export const FONT_OPTIONS: { id: ChatFontFamily; label: string }[] = [
  { id: 'system', label: 'Default' },
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
]

const STORAGE_KEY = 'code-editor:chat-appearance'
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 22
const DEFAULT_FONT_SIZE = 14

interface ChatAppearanceState {
  chatFontSize: number
  chatFontFamily: ChatFontFamily
  chatFontCss: string
  increaseFontSize: () => void
  decreaseFontSize: () => void
  setChatFontSize: (size: number) => void
  setChatFontFamily: (family: ChatFontFamily) => void
}

const ChatAppearanceContext = createContext<ChatAppearanceState | null>(null)

export function ChatAppearanceProvider({ children }: { children: ReactNode }) {
  const [chatFontSize, setChatFontSizeRaw] = useState(DEFAULT_FONT_SIZE)
  const [chatFontFamily, setChatFontFamilyRaw] = useState<ChatFontFamily>('system')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const s = JSON.parse(saved)
        if (typeof s.fontSize === 'number') setChatFontSizeRaw(s.fontSize)
        if (s.fontFamily) setChatFontFamilyRaw(s.fontFamily)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fontSize: chatFontSize, fontFamily: chatFontFamily }),
      )
    } catch {}
  }, [chatFontSize, chatFontFamily])

  const increaseFontSize = useCallback(() => {
    setChatFontSizeRaw((s) => Math.min(MAX_FONT_SIZE, s + 1))
  }, [])

  const decreaseFontSize = useCallback(() => {
    setChatFontSizeRaw((s) => Math.max(MIN_FONT_SIZE, s - 1))
  }, [])

  const setChatFontSize = useCallback((size: number) => {
    setChatFontSizeRaw(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size)))
  }, [])

  const setChatFontFamily = useCallback((family: ChatFontFamily) => {
    setChatFontFamilyRaw(family)
  }, [])

  const chatFontCss = useMemo(() => FONT_FAMILY_MAP[chatFontFamily], [chatFontFamily])

  const value = useMemo<ChatAppearanceState>(
    () => ({
      chatFontSize,
      chatFontFamily,
      chatFontCss,
      increaseFontSize,
      decreaseFontSize,
      setChatFontSize,
      setChatFontFamily,
    }),
    [
      chatFontSize,
      chatFontFamily,
      chatFontCss,
      increaseFontSize,
      decreaseFontSize,
      setChatFontSize,
      setChatFontFamily,
    ],
  )

  return <ChatAppearanceContext.Provider value={value}>{children}</ChatAppearanceContext.Provider>
}

export function useChatAppearance(): ChatAppearanceState {
  const ctx = useContext(ChatAppearanceContext)
  if (!ctx) throw new Error('useChatAppearance must be inside ChatAppearanceProvider')
  return ctx
}
