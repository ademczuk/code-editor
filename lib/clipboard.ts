import {
  writeText as tauriWriteText,
  readText as tauriReadText,
} from '@tauri-apps/plugin-clipboard-manager'

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await tauriWriteText(text)
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Patch navigator.clipboard so Monaco Editor (and any other library that calls
 * the async Clipboard API directly) routes through Tauri's native clipboard
 * plugin. WKWebView on macOS blocks navigator.clipboard.write/writeText/read/
 * readText with a NotAllowedError — this polyfill prevents that.
 */
function patchClipboardForTauri() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return
  if (!(window as any).__TAURI_INTERNALS__ && !(window as any).__TAURI__) return

  const clipboardPatch: Clipboard = {
    ...navigator.clipboard,

    async writeText(text: string): Promise<void> {
      await tauriWriteText(text)
    },

    async write(data: ClipboardItem[]): Promise<void> {
      for (const item of data) {
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          const text = await blob.text()
          await tauriWriteText(text)
          return
        }
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html')
          const text = await blob.text()
          await tauriWriteText(text)
          return
        }
      }
    },

    async readText(): Promise<string> {
      return tauriReadText()
    },

    async read(): Promise<ClipboardItems> {
      const text = await tauriReadText()
      const blob = new Blob([text], { type: 'text/plain' })
      const item = new ClipboardItem({ 'text/plain': blob })
      return [item]
    },

    addEventListener: navigator.clipboard?.addEventListener?.bind(navigator.clipboard),
    removeEventListener: navigator.clipboard?.removeEventListener?.bind(navigator.clipboard),
    dispatchEvent: navigator.clipboard?.dispatchEvent?.bind(navigator.clipboard),
  } as Clipboard

  Object.defineProperty(navigator, 'clipboard', {
    value: clipboardPatch,
    writable: true,
    configurable: true,
  })
}

patchClipboardForTauri()
