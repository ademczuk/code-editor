'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'

interface BranchInfo {
  name: string
  protected: boolean
}

export function RepoSelector() {
  const { repo, setRepo } = useRepo()
  const [editing, setEditing] = useState(!repo)
  const [input, setInput] = useState(repo ? repo.fullName : '')
  const [branchDropdown, setBranchDropdown] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchLoading, setBranchLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBranchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed.includes('/')) return
    const [owner, repoName] = trimmed.split('/')
    if (!owner || !repoName) return
    setRepo({ owner, repo: repoName, branch: 'main', fullName: trimmed })
    setEditing(false)
  }, [input, setRepo])

  const fetchBranches = useCallback(async () => {
    if (!repo) return
    setBranchLoading(true)
    try {
      const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/branches?per_page=30`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as Array<{ name: string; protected: boolean }>
      setBranches(data.map(b => ({ name: b.name, protected: b.protected })))
    } catch {
      setBranches([])
    } finally {
      setBranchLoading(false)
    }
  }, [repo])

  const handleBranchClick = useCallback(() => {
    if (!repo) return
    setBranchDropdown(v => !v)
    if (branches.length === 0) fetchBranches()
  }, [repo, branches.length, fetchBranches])

  const switchBranch = useCallback((name: string) => {
    if (!repo) return
    setRepo({ ...repo, branch: name })
    setBranchDropdown(false)
  }, [repo, setRepo])

  if (editing || !repo) {
    return (
      <div className="flex items-center gap-1.5">
        <Icon icon="lucide:git-branch" width={14} height={14} className="text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="owner/repo"
          className="w-40 px-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] font-mono"
          autoFocus
        />
        <button
          onClick={handleSubmit}
          className="p-1 rounded text-[var(--brand)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          title="Open repo"
        >
          <Icon icon="lucide:arrow-right" width={14} height={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Repo name (click to change) */}
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
        title="Change repository"
      >
        <Icon icon="lucide:git-fork" width={13} height={13} className="text-[var(--text-tertiary)]" />
        <span className="text-[12px] font-mono text-[var(--text-primary)] group-hover:text-[var(--brand)]">
          {repo.fullName}
        </span>
      </button>

      {/* Branch switcher */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={handleBranchClick}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          title="Switch branch"
        >
          <Icon icon="lucide:git-branch" width={12} height={12} />
          <span className="text-[11px] font-mono">{repo.branch}</span>
          <Icon icon="lucide:chevron-down" width={10} height={10} />
        </button>

        {branchDropdown && (
          <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl z-50 py-1 max-h-[300px] overflow-y-auto">
            {branchLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                <Icon icon="lucide:loader-2" width={12} height={12} className="animate-spin" />
                Loading branches...
              </div>
            ) : branches.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-[var(--text-tertiary)]">No branches found</div>
            ) : (
              branches.map(b => (
                <button
                  key={b.name}
                  onClick={() => switchBranch(b.name)}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors cursor-pointer ${
                    b.name === repo.branch
                      ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon icon="lucide:git-branch" width={12} height={12} className="shrink-0 text-[var(--text-tertiary)]" />
                  <span className="text-[12px] font-mono truncate">{b.name}</span>
                  {b.protected && (
                    <span title="Protected"><Icon icon="lucide:shield" width={10} height={10} className="shrink-0 text-[var(--text-tertiary)]" /></span>
                  )}
                  {b.name === repo.branch && (
                    <Icon icon="lucide:check" width={12} height={12} className="shrink-0 ml-auto text-[var(--brand)]" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
