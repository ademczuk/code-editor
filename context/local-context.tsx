'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { isTauri, tauriInvoke } from '@/lib/tauri'

interface FileEntry {
  path: string
  name: string
  is_dir: boolean
  size?: number
}

interface GitFileStatus {
  path: string
  status: string
}

interface GitInfo {
  branch: string
  is_repo: boolean
  status: GitFileStatus[]
}

interface LocalContextValue {
  /** Whether we're in local mode (vs GitHub remote mode) */
  localMode: boolean
  /** Root folder path on disk */
  rootPath: string | null
  /** File tree from local filesystem */
  localTree: FileEntry[]
  /** Git info (branch, status) */
  gitInfo: GitInfo | null
  /** Open a folder via native dialog */
  openFolder: () => Promise<void>
  /** Set a folder directly (e.g. from recent) */
  setRootPath: (path: string) => void
  /** Exit local mode */
  exitLocalMode: () => void
  /** Read a local file */
  readFile: (path: string) => Promise<string>
  /** Write a local file */
  writeFile: (path: string, content: string) => Promise<void>
  /** Refresh tree + git status */
  refresh: () => Promise<void>
  /** Commit files locally */
  commitFiles: (message: string, paths: string[]) => Promise<string>
  /** Get diff for a file */
  getDiff: (path: string) => Promise<string>
  /** Available on desktop only */
  available: boolean
}

const LocalContext = createContext<LocalContextValue | null>(null)

const STORAGE_RECENT = 'code-editor:recent-folders'
const MAX_RECENT = 5

function saveRecentFolder(path: string) {
  try {
    const recent: string[] = JSON.parse(localStorage.getItem(STORAGE_RECENT) || '[]')
    const updated = [path, ...recent.filter(p => p !== path)].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_RECENT, JSON.stringify(updated))
  } catch {}
}

export function getRecentFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_RECENT) || '[]')
  } catch { return [] }
}

export function LocalProvider({ children }: { children: ReactNode }) {
  const [localMode, setLocalMode] = useState(false)
  const [rootPath, setRootPathState] = useState<string | null>(null)
  const [localTree, setLocalTree] = useState<FileEntry[]>([])
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => { setAvailable(isTauri()) }, [])

  const loadTree = useCallback(async (root: string) => {
    const tree = await tauriInvoke<FileEntry[]>('local_read_tree', { root })
    if (tree) setLocalTree(tree)
    const git = await tauriInvoke<GitInfo>('local_git_info', { root })
    if (git) setGitInfo(git)
  }, [])

  const setRootPath = useCallback((path: string) => {
    setRootPathState(path)
    setLocalMode(true)
    saveRecentFolder(path)
    loadTree(path)
  }, [loadTree])

  const openFolder = useCallback(async () => {
    if (!isTauri()) return
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: 'Open Folder' })
    if (selected && typeof selected === 'string') {
      setRootPath(selected)
    }
  }, [setRootPath])

  const exitLocalMode = useCallback(() => {
    setLocalMode(false)
    setRootPathState(null)
    setLocalTree([])
    setGitInfo(null)
  }, [])

  const readFile = useCallback(async (path: string): Promise<string> => {
    if (!rootPath) throw new Error('No root path')
    const content = await tauriInvoke<string>('local_read_file', { root: rootPath, path })
    return content ?? ''
  }, [rootPath])

  const writeFile = useCallback(async (path: string, content: string) => {
    if (!rootPath) throw new Error('No root path')
    await tauriInvoke('local_write_file', { root: rootPath, path, content })
  }, [rootPath])

  const refresh = useCallback(async () => {
    if (rootPath) await loadTree(rootPath)
  }, [rootPath, loadTree])

  const commitFiles = useCallback(async (message: string, paths: string[]): Promise<string> => {
    if (!rootPath) throw new Error('No root path')
    const result = await tauriInvoke<string>('local_git_commit', { root: rootPath, message, paths })
    await refresh()
    return result ?? 'Committed'
  }, [rootPath, refresh])

  const getDiff = useCallback(async (path: string): Promise<string> => {
    if (!rootPath) return ''
    const diff = await tauriInvoke<string>('local_git_diff', { root: rootPath, path })
    return diff ?? ''
  }, [rootPath])

  return (
    <LocalContext.Provider value={{
      localMode, rootPath, localTree, gitInfo, available,
      openFolder, setRootPath, exitLocalMode,
      readFile, writeFile, refresh, commitFiles, getDiff,
    }}>
      {children}
    </LocalContext.Provider>
  )
}

export function useLocal() {
  const ctx = useContext(LocalContext)
  if (!ctx) throw new Error('useLocal must be used within LocalProvider')
  return ctx
}
