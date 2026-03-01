'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useLocal, getRecentFolders } from '@/context/local-context'
import { RepoSelector } from '@/components/repo-selector'

export function SourceSwitcher() {
  const local = useLocal()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const recentFolders = getRecentFolders()
  const folderName = local.rootPath?.split('/').pop() ?? ''

  return (
    <div className="flex items-center gap-1.5" ref={dropRef}>
      {/* Mode toggle pills */}
      <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden text-[11px]">
        <button
          className={`flex items-center gap-1 px-2.5 py-1 transition-colors cursor-pointer ${
            local.localMode
              ? 'bg-[var(--brand)] text-[var(--brand-contrast,#fff)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
          }`}
          onClick={() => {
            if (local.localMode) return
            if (local.rootPath) {
              local.setRootPath(local.rootPath)
            } else if (recentFolders.length > 0) {
              local.setRootPath(recentFolders[0])
            } else {
              local.openFolder()
            }
          }}
          title={
            local.localMode
              ? `Local: ${local.rootPath ?? 'no folder'}`
              : 'Switch to local files'
          }
        >
          <Icon icon="lucide:hard-drive" width={12} height={12} />
          Local
        </button>
        <button
          onClick={() => {
            if (local.localMode) local.exitLocalMode()
          }}
          className={`flex items-center gap-1 px-2.5 py-1 transition-colors cursor-pointer ${
            !local.localMode
              ? 'bg-[var(--brand)] text-[var(--brand-contrast,#fff)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
          }`}
          title="Switch to GitHub remote"
        >
          <Icon icon="lucide:github" width={12} height={12} />
          Remote
        </button>
      </div>

      {/* Context-dependent selector */}
      {local.localMode ? (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:folder-open" width={13} height={13} className="text-[var(--brand)]" />
            <span className="text-[var(--text-primary)] font-medium max-w-[140px] truncate">
              {folderName || 'Open Folder'}
            </span>
            {local.gitInfo?.is_repo && (
              <span className="text-[var(--text-tertiary)]">
                <Icon icon="lucide:git-branch" width={11} height={11} className="inline mr-0.5" />
                {local.gitInfo.branch}
              </span>
            )}
            <Icon icon="lucide:chevron-down" width={11} height={11} className="text-[var(--text-tertiary)]" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-[91] w-[280px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden">
              {/* Open new folder */}
              <button
                onClick={() => { local.openFolder(); setDropdownOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:folder-plus" width={13} height={13} className="text-[var(--brand)]" />
                Open Folder…
              </button>

              {/* Web FS hint */}
              {local.isWebFS && (
                <div className="px-3 py-1.5 text-[10px] text-[var(--text-tertiary)] border-t border-[var(--border)] flex items-center gap-1.5">
                  <Icon icon="lucide:globe" width={10} height={10} />
                  Using browser File System Access
                </div>
              )}

              {/* Recent folders (Tauri only — web FS handles are not persistable) */}
              {!local.isWebFS && recentFolders.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] text-[var(--text-disabled)] uppercase tracking-wider border-t border-[var(--border)]">
                    Recent
                  </div>
                  {recentFolders.map(path => {
                    const name = path.split('/').pop() ?? path
                    const isActive = path === local.rootPath
                    return (
                      <button
                        key={path}
                        onClick={() => { local.setRootPath(path); setDropdownOpen(false) }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                        }`}
                        title={path}
                      >
                        <Icon icon="lucide:folder" width={12} height={12} />
                        <span className="truncate flex-1 text-left">{name}</span>
                        {isActive && <Icon icon="lucide:check" width={11} height={11} />}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <RepoSelector />
      )}
    </div>
  )
}

/** Compact toggle for the status bar */
export function SourceModeIndicator() {
  const local = useLocal()

  return (
    <button
      onClick={() => {
        if (local.localMode) {
          local.exitLocalMode()
        } else {
          const recent = getRecentFolders()
          if (local.rootPath) {
            local.setRootPath(local.rootPath)
          } else if (recent.length > 0) {
            local.setRootPath(recent[0])
          } else {
            local.openFolder()
          }
        }
      }}
      className={`flex items-center gap-1 cursor-pointer hover:text-[var(--text-secondary)] transition-colors ${
        local.localMode ? 'text-[var(--brand)]' : ''
      }`}
      title={
        local.localMode
          ? 'Local mode — click to switch to Remote'
          : 'Remote mode — click to switch to Local'
      }
    >
      <Icon
        icon={local.localMode ? 'lucide:hard-drive' : 'lucide:github'}
        width={10}
        height={10}
      />
      <span>{local.localMode ? 'Local' : 'Remote'}</span>
    </button>
  )
}
