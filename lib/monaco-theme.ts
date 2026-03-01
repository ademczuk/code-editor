/**
 * Custom Monaco theme that reads CSS custom properties from the current theme.
 * Called in beforeMount to register the theme before any editor renders.
 */

import type { editor } from 'monaco-editor'

function getCSSVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function toMonacoTokenHex(color: string, fallback: string): string {
  const normalized = color.trim()
  const fallbackNormalized = fallback.replace('#', '')
  if (!normalized) return fallbackNormalized

  const hex = normalized.replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) return hex
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (/^[0-9a-fA-F]{4}$/.test(hex)) {
    return hex
      .split('')
      .map((c) => c + c)
      .join('')
  }

  return fallbackNormalized
}

export function registerEditorTheme(monaco: { editor: typeof editor }) {
  const bg = getCSSVar('--bg', '#0a0a0a')
  const bgSubtle = getCSSVar('--bg-subtle', '#141414')
  const bgElevated = getCSSVar('--bg-elevated', '#111111')
  const border = getCSSVar('--border', '#222222')
  const fg = getCSSVar('--text-primary', '#e5e5e5')
  const fgSecondary = getCSSVar('--text-secondary', '#999999')
  const fgTertiary = getCSSVar('--text-tertiary', '#666666')
  const brand = getCSSVar('--brand', '#ca3a29')
  const additions = getCSSVar('--color-additions', '#22c55e')
  const deletions = getCSSVar('--color-deletions', '#ef4444')

  monaco.editor.defineTheme('code-editor', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: toMonacoTokenHex(fgTertiary, '666666'), fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c084fc' },           // purple-400
      { token: 'keyword.control', foreground: 'c084fc' },
      { token: 'storage', foreground: 'c084fc' },
      { token: 'string', foreground: '86efac' },             // green-300
      { token: 'string.escape', foreground: '6ee7b7' },
      { token: 'number', foreground: 'fbbf24' },             // amber-400
      { token: 'regexp', foreground: 'f87171' },             // red-400
      { token: 'type', foreground: '67e8f9' },               // cyan-300
      { token: 'type.identifier', foreground: '67e8f9' },
      { token: 'class', foreground: '67e8f9' },
      { token: 'interface', foreground: '67e8f9' },
      { token: 'function', foreground: '93c5fd' },           // blue-300
      { token: 'function.call', foreground: '93c5fd' },
      { token: 'variable', foreground: toMonacoTokenHex(fg, 'e5e5e5') },
      { token: 'variable.predefined', foreground: 'fca5a5' },// red-300
      { token: 'constant', foreground: 'fbbf24' },
      { token: 'tag', foreground: 'f87171' },                // red-400 (HTML/JSX)
      { token: 'attribute.name', foreground: 'c084fc' },
      { token: 'attribute.value', foreground: '86efac' },
      { token: 'delimiter', foreground: toMonacoTokenHex(fgSecondary, '999999') },
      { token: 'operator', foreground: toMonacoTokenHex(fgSecondary, '999999') },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.lineHighlightBackground': bgSubtle,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': brand + '30',
      'editor.inactiveSelectionBackground': brand + '15',
      'editor.selectionHighlightBackground': brand + '15',
      'editor.findMatchBackground': brand + '40',
      'editor.findMatchHighlightBackground': brand + '20',
      'editorCursor.foreground': brand,
      'editorIndentGuide.background': border,
      'editorIndentGuide.activeBackground': fgTertiary,
      'editorLineNumber.foreground': fgTertiary,
      'editorLineNumber.activeForeground': fgSecondary,
      'editorBracketMatch.background': brand + '20',
      'editorBracketMatch.border': brand + '40',
      'editorGutter.background': bg,
      'editorOverviewRuler.border': '#00000000',
      'editorWidget.background': bgElevated,
      'editorWidget.border': border,
      'editorSuggestWidget.background': bgElevated,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.selectedBackground': brand + '20',
      'editorHoverWidget.background': bgElevated,
      'editorHoverWidget.border': border,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': fgTertiary + '30',
      'scrollbarSlider.hoverBackground': fgTertiary + '50',
      'scrollbarSlider.activeBackground': fgTertiary + '70',
      'diffEditor.insertedTextBackground': additions + '15',
      'diffEditor.removedTextBackground': deletions + '15',
      'input.background': bgSubtle,
      'input.border': border,
      'input.foreground': fg,
      'focusBorder': brand,
      'list.activeSelectionBackground': brand + '20',
      'list.hoverBackground': bgSubtle,
    },
  })
}
