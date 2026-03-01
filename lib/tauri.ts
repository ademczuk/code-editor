/**
 * Tauri detection + IPC wrapper
 *
 * Provides safe wrappers that work in both web and desktop contexts.
 * In the browser, all calls return null/undefined gracefully.
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

/** Call a Tauri command. Returns null if not in Tauri. */
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** Listen to a Tauri event. Returns unlisten function, or noop if not in Tauri. */
export async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<T>(event, (e) => handler(e.payload))
}
