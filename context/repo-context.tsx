'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface RepoInfo {
  owner: string
  repo: string
  branch: string
  fullName: string
}

export interface TreeNode {
  path: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

interface RepoContextValue {
  repo: RepoInfo | null
  setRepo: (repo: RepoInfo | null) => void
  tree: TreeNode[]
  treeLoading: boolean
  treeError: string | null
  loadTree: () => Promise<void>
}

const RepoContext = createContext<RepoContextValue | null>(null)

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)

  const loadTree = useCallback(async () => {
    if (!repo) return
    setTreeLoading(true)
    setTreeError(null)
    try {
      const res = await fetch(`/api/github/repos/${repo.owner}/${repo.repo}/tree?recursive=true`)
      if (!res.ok) throw new Error(`Failed to load tree: ${res.statusText}`)
      const data = await res.json()
      setTree(data.tree ?? data ?? [])
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Failed to load tree')
    } finally {
      setTreeLoading(false)
    }
  }, [repo])

  return (
    <RepoContext.Provider value={{ repo, setRepo, tree, treeLoading, treeError, loadTree }}>
      {children}
    </RepoContext.Provider>
  )
}

export function useRepo() {
  const ctx = useContext(RepoContext)
  if (!ctx) throw new Error('useRepo must be used within RepoProvider')
  return ctx
}
