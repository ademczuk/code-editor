'use client'

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useRepo } from '@/context/repo-context'
import { useView } from '@/context/view-context'
import { EditorTabs } from '@/components/editor-tabs'

const FileExplorer = dynamic(() => import('@/components/file-explorer').then(m => ({ default: m.FileExplorer })), { ssr: false })
const CodeEditor = dynamic(() => import('@/components/code-editor').then(m => ({ default: m.CodeEditor })), { ssr: false })
const EnginePanel = dynamic(() => import('@/components/engine-panel').then(m => ({ default: m.EnginePanel })), { ssr: false })
const AgentPanel = dynamic(() => import('@/components/agent-panel').then(m => ({ default: m.AgentPanel })), { ssr: false })

export function EditorView() {
  const { files, activeFile } = useEditor()
  const local = useLocal()
  const { repo } = useRepo()
  const { setView } = useView()

  const [treeVisible, setTreeVisible] = useState(() => {
    try { const v = localStorage.getItem('ce:tree-visible'); return v === null ? false : v === 'true' } catch { return false }
  })
  const [treeWidth, setTreeWidth] = useState(() => {
    try { const s = parseInt(localStorage.getItem('ce:tree-w') || ''); return s >= 160 && s <= 400 ? s : 220 } catch { return 220 }
  })
  const [engineVisible, setEngineVisible] = useState(false)
  const [chatVisible, setChatVisible] = useState(() => {
    try { const v = localStorage.getItem('ce:chat-visible'); return v === null ? true : v === 'true' } catch { return true }
  })
  const [chatWidth, setChatWidth] = useState(() => {
    try { const s = parseInt(localStorage.getItem('ce:chat-w') || ''); return s >= 280 && s <= 600 ? s : 360 } catch { return 360 }
  })
  const [editorCollapsed, setEditorCollapsed] = useState(() => {
    try { const v = localStorage.getItem('ce:editor-collapsed'); return v === null ? true : v === 'true' } catch { return true }
  })

  // Persist state
  useEffect(() => { try { localStorage.setItem('ce:tree-visible', String(treeVisible)) } catch {} }, [treeVisible])
  useEffect(() => { try { localStorage.setItem('ce:tree-w', String(treeWidth)) } catch {} }, [treeWidth])
  useEffect(() => { try { localStorage.setItem('ce:chat-visible', String(chatVisible)) } catch {} }, [chatVisible])
  useEffect(() => { try { localStorage.setItem('ce:chat-w', String(chatWidth)) } catch {} }, [chatWidth])
  useEffect(() => { try { localStorage.setItem('ce:editor-collapsed', String(editorCollapsed)) } catch {} }, [editorCollapsed])

  // Auto-expand editor when a file is opened
  useEffect(() => {
    if (files.length > 0 || activeFile) setEditorCollapsed(false)
  }, [files.length, activeFile])

  // ⌘B toggle tree, ⌘I toggle chat, ⌘E toggle editor collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setTreeVisible(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !e.shiftKey) { e.preventDefault(); setChatVisible(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !e.shiftKey) { e.preventDefault(); setEditorCollapsed(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Listen for open-side-chat (⌘L from anywhere)
  useEffect(() => {
    const handler = () => setChatVisible(true)
    window.addEventListener('open-side-chat', handler)
    return () => window.removeEventListener('open-side-chat', handler)
  }, [])

  // Command palette events
  useEffect(() => {
    const toggleFiles = () => setTreeVisible(v => !v)
    const toggleEngine = () => setEngineVisible(v => !v)
    const toggleChat = () => setChatVisible(v => !v)
    const collapseEditor = () => setEditorCollapsed(true)
    const layoutPreset = (e: Event) => {
      const preset = (e as CustomEvent).detail as string
      switch (preset) {
        case 'focus':
          setTreeVisible(false); setEngineVisible(false); setChatVisible(false); setEditorCollapsed(false)
          window.dispatchEvent(new CustomEvent('hide-terminal'))
          break
        case 'review':
          setTreeVisible(true); setEngineVisible(false); setChatVisible(true); setEditorCollapsed(false)
          window.dispatchEvent(new CustomEvent('hide-terminal'))
          break
        case 'build':
          setTreeVisible(false); setEngineVisible(true); setChatVisible(false); setEditorCollapsed(false)
          window.dispatchEvent(new CustomEvent('show-terminal'))
          break
      }
    }
    window.addEventListener('cmd:toggle-files', toggleFiles)
    window.addEventListener('cmd:toggle-engine', toggleEngine)
    window.addEventListener('cmd:toggle-chat', toggleChat)
    window.addEventListener('cmd:collapse-editor', collapseEditor)
    window.addEventListener('cmd:layout-preset', layoutPreset)
    return () => {
      window.removeEventListener('cmd:toggle-files', toggleFiles)
      window.removeEventListener('cmd:toggle-engine', toggleEngine)
      window.removeEventListener('cmd:toggle-chat', toggleChat)
      window.removeEventListener('cmd:collapse-editor', collapseEditor)
      window.removeEventListener('cmd:layout-preset', layoutPreset)
    }
  }, [])

  // ─── Status chip state ───
  const [terminalActive, setTerminalActive] = useState(false)
  const [agentUnread, setAgentUnread] = useState(false)
  const [engineRunning, setEngineRunning] = useState(false)

  useEffect(() => {
    const onTerminal = (e: Event) => setTerminalActive((e as CustomEvent).detail?.active ?? true)
    const onAgent = () => { if (!chatVisible) setAgentUnread(true) }
    const onEngine = (e: Event) => setEngineRunning((e as CustomEvent).detail?.running ?? false)
    window.addEventListener('terminal-activity', onTerminal)
    window.addEventListener('agent-reply', onAgent)
    window.addEventListener('engine-status', onEngine)
    return () => {
      window.removeEventListener('terminal-activity', onTerminal)
      window.removeEventListener('agent-reply', onAgent)
      window.removeEventListener('engine-status', onEngine)
    }
  }, [chatVisible])

  // Clear unread when chat opens
  useEffect(() => { if (chatVisible) setAgentUnread(false) }, [chatVisible])

  // ─── Active rail ref ───
  const segmentRef = useRef<HTMLDivElement>(null)
  const [railStyle, setRailStyle] = useState<{ left: number; width: number } | null>(null)

  const updateRail = useCallback(() => {
    if (!segmentRef.current) return
    const active = segmentRef.current.querySelector('[data-active="true"]') as HTMLElement | null
    if (active) {
      setRailStyle({ left: active.offsetLeft, width: active.offsetWidth })
    } else {
      setRailStyle(null)
    }
  }, [])

  useLayoutEffect(() => { updateRail() }, [treeVisible, engineVisible, updateRail])

  const hasFiles = files.length > 0 || activeFile
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
      {/* ── Editor collapsed: narrow toggle strip ── */}
      {editorCollapsed ? (
        <div className="flex flex-col items-center w-[48px] shrink-0 bg-[var(--bg-elevated)] border-r border-[var(--border)]">
          <button
            onClick={() => setEditorCollapsed(false)}
            className="mt-3 p-2 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Expand editor (⌘E)"
          >
            <Icon icon="lucide:code-2" width={18} height={18} />
          </button>
          <button
            onClick={() => { setEditorCollapsed(false); setTreeVisible(true) }}
            className="mt-1 p-2 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            title="Open explorer (⌘B)"
          >
            <Icon icon="lucide:folder" width={16} height={16} />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-terminal'))}
            className="mt-1 p-2 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            title="Terminal (⌘J)"
          >
            <Icon icon="lucide:terminal" width={16} height={16} />
          </button>
        </div>
      ) : (
        <>
          {/* File Tree */}
          {treeVisible && (
            <div className="shrink-0 bg-[var(--sidebar-bg)] overflow-hidden border-r border-[var(--border)] flex flex-col" style={{ width: treeWidth }}>
              <div className="flex items-center justify-between h-7 px-2.5 border-b border-[var(--border)] shrink-0">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Explorer</span>
                <button onClick={() => setTreeVisible(false)} className="p-1 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer" title="Hide (⌘B)">
                  <Icon icon="lucide:panel-left-close" width={13} height={13} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto"><FileExplorer /></div>
            </div>
          )}

          {/* Tree resize handle */}
          {treeVisible && (
            <div className="resize-handle w-[3px] cursor-col-resize hover:bg-[var(--brand)] transition-all opacity-0 hover:opacity-50 shrink-0 z-10"
              onMouseDown={e => {
                e.preventDefault(); const startX = e.clientX; const startW = treeWidth
                const onMove = (ev: MouseEvent) => setTreeWidth(Math.max(160, Math.min(400, startW + (ev.clientX - startX))))
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
              }}
            />
          )}

          {/* Editor column */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Tree toggle when collapsed */}
            {!treeVisible && (
              <button onClick={() => setTreeVisible(true)} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-10 flex items-center justify-center bg-[var(--bg-elevated)] border border-l-0 border-[var(--border)] rounded-r hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer" title="Show explorer (⌘B)">
                <Icon icon="lucide:chevron-right" width={12} height={12} />
              </button>
            )}

            {hasFiles ? (
              <>
                {/* Tabs */}
                <EditorTabs />

                {/* Editor */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <CodeEditor />
                </div>

                {/* Engine panel */}
                {engineVisible && (
                  <>
                    <div className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors opacity-0 hover:opacity-50 shrink-0"
                      onMouseDown={e => {
                        e.preventDefault(); const startY = e.clientY; const startH = 240
                        const onMove = (ev: MouseEvent) => { /* engine resize handled locally */ }
                        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
                      }}
                    />
                    <div className="shrink-0 border-t border-[var(--border)]" style={{ height: 240 }}>
                      <EnginePanel />
                    </div>
                  </>
                )}
              </>
            ) : (
              /* Empty state — no files open */
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Icon icon="lucide:file-code-2" width={28} height={28} className="text-[var(--text-disabled)] opacity-30" />
                <p className="text-[12px] text-[var(--text-tertiary)]">No file open</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTreeVisible(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
                  >
                    <Icon icon="lucide:folder" width={13} height={13} />
                    Browse files
                  </button>
                  <span className="text-[10px] text-[var(--text-disabled)]">or</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] font-mono text-[var(--text-disabled)]">⌘P</kbd>
                </div>
              </div>
            )}

            {/* Bottom bar */}
            <div className="flex items-center h-8 px-2.5 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 gap-1.5">
              {/* Segmented toggle group with animated active rail */}
              <div ref={segmentRef} className="relative inline-flex items-center rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] p-[2px] gap-[2px]">
                {/* Active rail indicator */}
                {railStyle && (
                  <span
                    className="absolute top-[2px] h-[calc(100%-4px)] rounded bg-[var(--bg)] shadow-sm pointer-events-none transition-all duration-200 ease-out z-0"
                    style={{ left: railStyle.left, width: railStyle.width }}
                  />
                )}

                <button data-active={treeVisible} onClick={() => setTreeVisible(v => !v)} className={`relative z-[1] h-6 px-2 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors ${treeVisible ? 'text-[var(--text-primary)]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`} title="Explorer (⌘B)">
                  <Icon icon="lucide:folder" width={12} height={12} />
                  <span>Files</span>
                </button>
                <button onClick={() => window.dispatchEvent(new CustomEvent('toggle-terminal'))} className="relative z-[1] h-6 px-2 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors text-[var(--text-disabled)] hover:text-[var(--text-secondary)]" title="Terminal (⌘J)">
                  <Icon icon="lucide:terminal" width={12} height={12} />
                  <span>Terminal</span>
                  {terminalActive && <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />}
                </button>
                <button data-active={engineVisible} onClick={() => setEngineVisible(v => !v)} className={`relative z-[1] h-6 px-2 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors ${engineVisible ? 'text-[var(--text-primary)]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`} title="Engine">
                  <Icon icon="lucide:cpu" width={12} height={12} />
                  <span>Engine</span>
                  {engineRunning && <Icon icon="lucide:loader-2" width={9} height={9} className="animate-spin text-[var(--brand)]" />}
                </button>
              </div>

              <button onClick={() => setEditorCollapsed(true)} className="h-6 px-2 rounded text-[10px] flex items-center gap-1 hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] cursor-pointer text-[var(--text-disabled)]" title="Collapse editor (⌘E)">
                <Icon icon="lucide:panel-left-close" width={12} height={12} />
                <span>Collapse</span>
              </button>

              <div className="flex-1" />

              {branchName && (
                <span className="text-[10px] font-mono text-[var(--text-disabled)] flex items-center gap-1 ml-1">
                  <Icon icon="lucide:git-branch" width={12} height={12} />{branchName}
                </span>
              )}

              <button onClick={() => setChatVisible(v => !v)} className={`relative h-6 px-2 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors ${chatVisible ? 'bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]'}`} title="Chat (⌘I)">
                <Icon icon="lucide:message-square" width={12} height={12} />
                <span>Agent</span>
                {agentUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--brand)] animate-pulse ring-2 ring-[var(--bg-elevated)]" />
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat resize handle */}
      {chatVisible && (
        <div className="resize-handle w-[3px] cursor-col-resize hover:bg-[var(--brand)] transition-all opacity-0 hover:opacity-50 shrink-0 z-10"
          onMouseDown={e => {
            e.preventDefault(); const startX = e.clientX; const startW = chatWidth
            const onMove = (ev: MouseEvent) => setChatWidth(Math.max(280, Math.min(600, startW - (ev.clientX - startX))))
            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
          }}
        />
      )}

      {/* Chat panel — fills remaining space when editor is collapsed */}
      {chatVisible && (
        <div className={`shrink-0 flex flex-col border-l border-[var(--border)] bg-[var(--bg)] overflow-hidden ${editorCollapsed ? 'flex-1' : ''}`} style={editorCollapsed ? undefined : { width: chatWidth }}>
          <div className="flex items-center justify-between h-7 px-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] flex items-center gap-1.5">
              <Icon icon="lucide:bot" width={12} height={12} className="text-[var(--brand)]" />
              Agent
            </span>
            <button onClick={() => setChatVisible(false)} className="p-1 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer" title="Hide (⌘I)">
              <Icon icon="lucide:panel-right-close" width={13} height={13} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AgentPanel />
          </div>
        </div>
      )}
    </div>
  )
}
