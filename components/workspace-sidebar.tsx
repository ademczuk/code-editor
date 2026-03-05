'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import { isTauri } from '@/lib/tauri'
import { useGateway } from '@/context/gateway-context'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { CODE_EDITOR_SESSION_KEY, SESSION_INIT_STORAGE_KEY, CODE_EDITOR_SYSTEM_PROMPT_VERSION } from '@/lib/agent-session'

export interface ChatSession {
  id: string
  title: string
  preview: string
  timestamp: number
  fileCount?: number
  additions?: number
  deletions?: number
  pinned?: boolean
  mode?: 'plan' | 'agent' | 'code'
}

const LS_KEY = 'code-editor:chat-sessions'

function loadSessions(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}
function saveSessions(s: ChatSession[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch {}
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const SIDEBAR_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

interface Props {
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete?: (id: string) => void
  collapsed?: boolean
  onToggle?: () => void
  repoName?: string
}

export function WorkspaceSidebar({ activeId, onSelect, onNew, onDelete, collapsed, onToggle, repoName }: Props) {
  const { sendRequest, status: gwStatus } = useGateway()
  const layout = useLayout()
  const sidebarResize = usePanelResize('sidebar')
  const sidebarWidth = layout.getSize('sidebar')
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  useEffect(() => { setIsTauriDesktop(isTauri()) }, [])

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [searchChat, setSearchChat] = useState('')
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSessions(loadSessions())
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setSessions(prev => {
        const next = [...prev]
        const idx = next.findIndex(s => s.id === detail.id)
        if (idx >= 0) Object.assign(next[idx], detail)
        else next.unshift(detail)
        saveSessions(next)
        return next
      })
    }
    window.addEventListener('chat-session-update', handler)
    return () => window.removeEventListener('chat-session-update', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        onToggle?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggle])

  const handlePin = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => {
      const next = prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
      saveSessions(next)
      return next
    })
  }, [])

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      saveSessions(next)
      return next
    })
    // Clean up gateway session + localStorage chat history
    const sessionKey = `${CODE_EDITOR_SESSION_KEY}:${id.slice(0, 8)}`
    if (gwStatus === 'connected') {
      sendRequest('sessions.delete', { key: sessionKey }).catch(() => {})
    }
    try { localStorage.removeItem(`code-editor:chat:${id}`) } catch {}
    try { sessionStorage.removeItem(`${SESSION_INIT_STORAGE_KEY}:${sessionKey}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`) } catch {}
    onDelete?.(id)
  }, [onDelete, sendRequest, gwStatus])

  const pinned = sessions.filter(s => s.pinned)
  const recent = sessions.filter(s => !s.pinned)
  const filteredRecent = searchChat
    ? recent.filter(s => s.title?.toLowerCase().includes(searchChat.toLowerCase()) || s.preview?.toLowerCase().includes(searchChat.toLowerCase()))
    : recent

  const modeIcon = (mode?: string) => {
    if (mode === 'plan') return 'lucide:list-checks'
    if (mode === 'agent') return 'lucide:infinity'
    return 'lucide:message-square'
  }

  const renderSession = (s: ChatSession) => (
    <div
      key={s.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(s.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id) } }}
      className={`group relative w-full text-left px-3.5 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
        activeId === s.id
          ? 'bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] shadow-[inset_3px_0_0_var(--brand)]'
          : 'hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2.5 mb-0.5">
        <Icon icon={modeIcon(s.mode)} width={15} height={15} className={activeId === s.id ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]'} />
        <span className="text-[14px] font-medium text-[var(--text-primary)] truncate flex-1">{s.title}</span>
        <span className="text-[12px] text-[var(--text-disabled)] shrink-0">{timeAgo(s.timestamp)}</span>
      </div>  
      {(s.fileCount || s.additions || s.deletions) && (
        <div className="flex items-center gap-2 ml-[25px] mt-1">
          {s.fileCount && <span className="text-[12px] text-[var(--text-disabled)]">{s.fileCount} file{s.fileCount !== 1 ? 's' : ''}</span>}
          {s.additions ? <span className="text-[12px] text-[var(--color-additions)] font-mono font-semibold">+{s.additions}</span> : null}
          {s.deletions ? <span className="text-[12px] text-[var(--color-deletions)] font-mono font-semibold">-{s.deletions}</span> : null}
        </div>
      )}
      <div className="absolute right-2.5 top-2.5 hidden group-hover:flex items-center gap-1">
        <button onClick={e => handlePin(s.id, e)} className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer">
          <Icon icon={s.pinned ? 'lucide:pin-off' : 'lucide:pin'} width={15} height={15} />
        </button>
        <button onClick={e => handleDelete(s.id, e)} className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer">
          <Icon icon="lucide:trash-2" width={15} height={15} />
        </button>
      </div>
    </div>
  )

  return (
    <motion.div
      ref={collapsed ? undefined : sidebarRef}
      initial={false}
      animate={{ width: collapsed ? 48 : sidebarWidth }}
      transition={SIDEBAR_SPRING}
      className={`relative flex flex-col shrink-0 overflow-hidden ${
        collapsed
          ? `items-center gap-3 ${isTauriDesktop ? 'pt-8' : 'pt-3'} pb-3`
          : 'h-full bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl'
      }`}
    >
      {collapsed ? (
        <>
          <button onClick={onToggle} className="p-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="Expand sidebar (⌘\\)">
            <Icon icon="lucide:panel-left" width={20} height={20} />
          </button>
          <button onClick={onNew} className="p-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="New Chat">
            <Icon icon="lucide:plus" width={20} height={20} />
          </button>
          <div className="flex flex-col items-center gap-2.5 mt-1.5">
            {sessions.slice(0, 5).map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all cursor-pointer ${
                  activeId === s.id
                    ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]'
                }`}
                title={s.title}
              >
                {s.title?.charAt(0)?.toUpperCase() || '?'}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Branding + Header */}
          <div className={`shrink-0 ${isTauriDesktop ? 'pt-7' : ''}`}>
            <div data-tauri-drag-region className="flex items-center gap-3 px-4 h-12 tauri-drag-region">
              <KnotLogo size={24} className="animate-sidebar-logo" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-[var(--text-primary)] leading-tight">Knot Code</div>
                {repoName && (
                  <div className="text-[12px] text-[var(--text-tertiary)] truncate">{repoName}</div>
                )}
              </div>
              <button onClick={onToggle} className="tauri-no-drag p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="Collapse (⌘\\)">
                <Icon icon="lucide:panel-left-close" width={18} height={18} />
              </button>
            </div>

            {/* New Chat + Search row */}
            <div className="px-2.5 pt-1.5 pb-2.5">
              <div className="flex items-center gap-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-2">
                <div className="relative flex-1">
                  <Icon icon="lucide:search" width={15} height={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] z-[3]" />
                  <input
                    type="text"
                    value={searchChat}
                    onChange={e => setSearchChat(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] transition-colors relative z-[1]"
                  />
                </div>
                <button onClick={onNew} className="p-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer shadow-sm" title="New Chat">
                  <Icon icon="lucide:plus" width={16} height={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Chat list */}
          <div
            className="flex-1 overflow-y-auto px-2 pt-1.5 scroll-shadow"
            onScroll={e => {
              const el = e.currentTarget
              el.classList.toggle('has-scroll-top', el.scrollTop > 8)
              el.classList.toggle('has-scroll-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 8)
            }}
            ref={el => {
              if (el) {
                el.classList.toggle('has-scroll-bottom', el.scrollHeight > el.clientHeight + 8)
              }
            }}
          >
            {pinned.length > 0 && (
              <div className="rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-2 mt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)] px-2.5 pt-1 pb-1.5">Pinned</div>
                <div className="flex flex-col gap-1">{pinned.map(renderSession)}</div>
              </div>
            )}

            <div className="rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-2 mt-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)] px-2.5 pt-1 pb-1.5">Recent</div>
              <div className="flex flex-col gap-1">
                {filteredRecent.length > 0
                  ? filteredRecent.map(renderSession)
                  : (
                    <div className="px-4 py-10 text-center">
                      <Icon icon="lucide:message-square-plus" width={32} height={32} className="mx-auto mb-3 text-[var(--text-disabled)] animate-breathe" />
                      <p className="text-[13px] text-[var(--text-disabled)]">
                        {repoName ? `Ready to work on ${repoName.split('/').pop()}` : 'Pick a repo and start building'}
                      </p>
                      <p className="text-[12px] text-[var(--text-disabled)] mt-1.5">
                        {repoName ? "What's first?" : 'New chat to begin'}
                      </p>
                    </div>
                  )
                }
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-2.5 py-2 shrink-0">
            <div className="flex items-center justify-between rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] px-2 py-1.5">
              <div className="flex items-center gap-1">
                {isTauriDesktop && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-terminal'))}
                    className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                    title="Terminal (⌘J)"
                  >
                    <Icon icon="lucide:terminal" width={17} height={17} />
                  </button>
                )}
                <button
                  onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }))}
                  className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                  title="Toggle Explorer"
                >
                  <Icon icon="lucide:folder" width={17} height={17} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-git-panel'))}
                  className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                  title="Git"
                >
                  <Icon icon="lucide:git-branch" width={17} height={17} />
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
                  className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                  title="Settings"
                >
                  <Icon icon="lucide:settings" width={17} height={17} className="animate-gear-sway" />
                </button>
              </div>
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="resize-handle absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--brand)] transition-all z-10 opacity-0 hover:opacity-60 hover:w-1.5"
            onMouseDown={sidebarResize.onResizeStart}
          />
        </>
      )}
    </motion.div>
  )
}
