'use client'

import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useRepo } from '@/context/repo-context'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useView, type ViewId } from '@/context/view-context'
import { WorkspaceSidebar } from '@/components/workspace-sidebar'
import { isTauri } from '@/lib/tauri'
import { fetchFileContentsByName as fetchFileContents, commitFilesByName as commitFiles } from '@/lib/github-api'
import { PluginSlotRenderer, usePlugins } from '@/context/plugin-context'
import { usePreview } from '@/context/preview-context'
import { SpotifyPlugin } from '@/components/plugins/spotify/spotify-plugin'
import { BranchPicker } from '@/components/branch-picker'
import { FolderIndicator } from '@/components/source-switcher'
import { ErrorBoundary } from '@/components/error-boundary'

// View components — lazy loaded
const EditorView = dynamic(() => import('@/components/views/editor-view').then(m => ({ default: m.EditorView })), { ssr: false })
const GitView = dynamic(() => import('@/components/views/git-view').then(m => ({ default: m.GitView })), { ssr: false })
const PrView = dynamic(() => import('@/components/views/pr-view').then(m => ({ default: m.PrView })), { ssr: false })
const SettingsPanel = dynamic(() => import('@/components/settings-panel').then(m => ({ default: m.SettingsPanel })), { ssr: false })

// Overlay modals — lazy loaded
const QuickOpen = dynamic(() => import('@/components/quick-open').then(m => ({ default: m.QuickOpen })), { ssr: false })
const GlobalSearch = dynamic(() => import('@/components/global-search').then(m => ({ default: m.GlobalSearch })), { ssr: false })
const CommandPalette = dynamic(() => import('@/components/command-palette').then(m => ({ default: m.CommandPalette })), { ssr: false })
const ShortcutsOverlay = dynamic(() => import('@/components/shortcuts-overlay').then(m => ({ default: m.ShortcutsOverlay })), { ssr: false })
const Landing = dynamic(() => import('@/components/landing'), { ssr: false })
const TerminalPanel = dynamic(() => import('@/components/terminal-panel').then(m => ({ default: m.TerminalPanel })), { ssr: false })
const PreviewPanel = dynamic(() => import('@/components/preview/preview-panel').then(m => ({ default: m.PreviewPanel })), { ssr: false })
const ComponentIsolatorListener = dynamic(() => import('@/components/preview/component-isolator').then(m => ({ default: m.ComponentIsolatorListener })), { ssr: false })
const WorkflowView = dynamic(() => import('@/components/workflows/workflow-view').then(m => ({ default: m.WorkflowView })), { ssr: false })
const GridView = dynamic(() => import('@/components/views/grid-view').then(m => ({ default: m.GridView })), { ssr: false })
const PipWindow = dynamic(() => import('@/components/preview/pip-window').then(m => ({ default: m.PipWindow })), { ssr: false })

const VIEW_ICONS: Record<string, { icon: string; label: string }> = {
  editor: { icon: 'lucide:code-2', label: 'Editor' },
  preview: { icon: 'lucide:eye', label: 'Preview' },
  workflows: { icon: 'lucide:workflow', label: 'Workflows' },
  grid: { icon: 'lucide:layout-grid', label: 'Grid' },
  diff: { icon: 'lucide:git-compare', label: 'Diff' },
  git: { icon: 'lucide:git-branch', label: 'Git' },
  prs: { icon: 'lucide:git-pull-request', label: 'PRs' },
  settings: { icon: 'lucide:settings', label: 'Settings' },
}

const VISIBLE_VIEWS: ViewId[] = ['editor', 'preview', 'workflows', 'grid', 'git', 'prs']

function SidebarPluginSlot() {
  const { slots } = usePlugins()
  const entries = slots.sidebar
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ce:sidebar-plugins-collapsed') === 'true' } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem('ce:sidebar-plugins-collapsed', String(collapsed)) } catch {} }, [collapsed])
  if (entries.length === 0) return null
  return (
    <div className={`shrink-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden transition-[width] duration-200 ${collapsed ? 'w-[48px]' : 'w-[220px]'}`}>
      {collapsed ? (
        <div className="flex flex-col items-center pt-3 gap-2">
          {entries.map(e => (
            <button key={e.id} onClick={() => setCollapsed(false)} className="p-2 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer" title="Expand">
              <Icon icon="simple-icons:spotify" width={16} height={16} />
            </button>
          ))}
        </div>
      ) : (
        <>
          {entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(e => {
            const C = e.component
            return <C key={e.id} />
          })}
          <button onClick={() => setCollapsed(true)} className="h-6 flex items-center justify-center text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0" title="Collapse">
            <Icon icon="lucide:panel-right-close" width={12} height={12} />
          </button>
        </>
      )}
    </div>
  )
}

export default function EditorLayout() {
  const { status } = useGateway()
  const { repo, setRepo } = useRepo()
  const local = useLocal()
  const { files, activeFile, openFile, setActiveFile, markClean, updateFileContent } = useEditor()
  const { localMode, readFile: localReadFile, writeFile: localWriteFile, rootPath: localRootPath, gitInfo, openFolder: localOpenFolder, setRootPath: localSetRootPath, commitFiles: localCommitFiles } = local
  const { activeView, setView } = useView()

  // ─── Minimal state ──────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [isMacTauri, setIsMacTauri] = useState(false)
  const [showLanding, setShowLanding] = useState(false)
  const [flashedTab, setFlashedTab] = useState<ViewId | null>(null)
  const [connectionAnim, setConnectionAnim] = useState<'pop' | 'pulse' | null>(null)
  const prevStatusRef = useRef(status)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  // Terminal — persisted so tabs survive across page reloads and view switches
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(240)

  // Hydrate persisted state from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      if (localStorage.getItem('code-editor:sidebar-collapsed') === 'true') setSidebarCollapsed(true)
    } catch {}
    try {
      if (localStorage.getItem('code-editor:terminal-visible') === 'true') setTerminalVisible(true)
    } catch {}
    try {
      const h = parseInt(localStorage.getItem('code-editor:terminal-height') || '')
      if (h >= 120 && h <= 600) setTerminalHeight(h)
    } catch {}
  }, [])

  // Overlay modals
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)

  // ─── Tauri detection ───────────────────────────────────
  useEffect(() => {
    setIsTauriDesktop(isTauri())
    setIsMacTauri(isTauri() && navigator.platform?.includes('Mac'))
  }, [])

  // ─── Auto-populate RepoContext from local git remote ───
  useEffect(() => {
    if (local.remoteRepo && local.gitInfo?.branch) {
      const [owner, repoName] = local.remoteRepo.split('/')
      if (owner && repoName) {
        if (repo?.fullName !== local.remoteRepo || repo?.branch !== local.gitInfo.branch) {
          setRepo({ owner, repo: repoName, branch: local.gitInfo.branch, fullName: local.remoteRepo })
        }
      }
    }
  }, [local.remoteRepo, local.gitInfo?.branch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist sidebar state ─────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('code-editor:sidebar-collapsed', String(sidebarCollapsed)) } catch {}
  }, [sidebarCollapsed])

  // Persist terminal state
  useEffect(() => {
    try { localStorage.setItem('code-editor:terminal-visible', String(terminalVisible)) } catch {}
  }, [terminalVisible])
  useEffect(() => {
    try { localStorage.setItem('code-editor:terminal-height', String(terminalHeight)) } catch {}
  }, [terminalHeight])

  // ─── Sliding tab indicator measurement ─────────────────
  useLayoutEffect(() => {
    const idx = VISIBLE_VIEWS.indexOf(activeView)
    const tab = tabRefs.current[idx]
    const container = tabContainerRef.current
    if (tab && container) {
      const cRect = container.getBoundingClientRect()
      const tRect = tab.getBoundingClientRect()
      setIndicatorStyle({ left: tRect.left - cRect.left, width: tRect.width })
    }
  }, [activeView, sidebarCollapsed])

  // ─── Connection state transitions ─────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (status === 'connected' && prev !== 'connected') {
      setConnectionAnim('pop')
      const t = setTimeout(() => setConnectionAnim(null), 600)
      return () => clearTimeout(t)
    }
  }, [status])

  const activeViewRef = useRef(activeView)
  activeViewRef.current = activeView

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // ⌘P — Quick open
      if (meta && e.key === 'p' && !e.shiftKey) { e.preventDefault(); setQuickOpenVisible(v => !v) }
      // ⌘⇧P — Command palette
      if (meta && e.shiftKey && e.key === 'p') { e.preventDefault(); setCommandPaletteVisible(v => !v) }
      // ⌘⇧F — Global search
      if (meta && e.shiftKey && e.key === 'f') { e.preventDefault(); setGlobalSearchVisible(v => !v) }
      // ⌘\\ — Toggle sidebar
      if (meta && e.key === '\\') { e.preventDefault(); setSidebarCollapsed(v => !v) }
      // ⌘J / ⌘` — Toggle terminal
      if (meta && (e.key === 'j' || e.key === '`') && !e.shiftKey) { e.preventDefault(); setTerminalVisible(v => !v) }
      // ⌘L — Open side chat panel and focus input
      if (meta && e.key === 'l' && !e.shiftKey) { e.preventDefault(); if (activeViewRef.current !== 'editor') setView('editor'); window.dispatchEvent(new CustomEvent('open-side-chat')); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focus-agent-input'))) }
      // Esc — Close overlays
      if (e.key === 'Escape') {
        setQuickOpenVisible(false); setGlobalSearchVisible(false)
        setCommandPaletteVisible(false); setShortcutsVisible(false)
      }
      // ⌘1-6 — View switching
      if (meta && e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        const views: ViewId[] = ['editor', 'preview', 'grid', 'git', 'prs', 'settings']
        const target = views[parseInt(e.key) - 1]
        setView(target)
        setFlashedTab(target)
        setTimeout(() => setFlashedTab(null), 400)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setView])

  // ─── Event listeners ───────────────────────────────────
  useEffect(() => {
    const openSettings = () => setSettingsVisible(true)
    const openFolder = () => { localOpenFolder() }
    const openRecent = (e: Event) => {
      const path = (e as CustomEvent).detail?.path
      if (path) localSetRootPath(path)
    }
    const toggleTerminal = () => setTerminalVisible(v => !v)
    window.addEventListener('open-settings', openSettings)
    window.addEventListener('open-folder', openFolder)
    window.addEventListener('open-recent', openRecent)
    window.addEventListener('toggle-terminal', toggleTerminal)
    return () => {
      window.removeEventListener('open-settings', openSettings)
      window.removeEventListener('open-folder', openFolder)
      window.removeEventListener('open-recent', openRecent)
      window.removeEventListener('toggle-terminal', toggleTerminal)
    }
  }, [localOpenFolder, localSetRootPath])

  // ─── File open handler ─────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, sha, content: providedContent } = (e as CustomEvent).detail ?? {}
      if (!path) return

      // Already open — just switch to it
      const existing = files.find(f => f.path === path)
      if (existing) {
        setActiveFile(path)
        setView('editor')
        return
      }

      // Content provided directly (local mode)
      if (providedContent != null) {
        openFile(path, providedContent, sha ?? '')
        setView('editor')
        return
      }

      // Local mode — read from filesystem
      if (localMode && localReadFile) {
        try {
          const content = await localReadFile(path)
          openFile(path, content, '')
          setView('editor')
        } catch (err) {
          console.error('Failed to read local file:', path, err)
        }
        return
      }

      // Fetch from GitHub
      if (repo) {
        try {
          const result = await fetchFileContents(repo.fullName, path, repo.branch)
          openFile(path, result.content, result.sha ?? sha ?? '')
          setView('editor')
        } catch (err) {
          console.error('Failed to open file:', path, err)
        }
      }
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [repo, files, openFile, setActiveFile, setView, localMode, localReadFile])

  // ─── Commit handler ────────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { message } = (e as CustomEvent).detail ?? {}
      if (!message) return

      if (localMode && localRootPath && gitInfo?.is_repo) {
        const dirtyFiles = files.filter(f => f.dirty)
        const gitPaths = gitInfo.status?.map(s => s.path) ?? []
        const allPaths = [...new Set([...dirtyFiles.map(f => f.path), ...gitPaths])]
        if (allPaths.length === 0) {
          window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, error: 'No changes to commit' } }))
          return
        }
        try {
          await localCommitFiles(message, allPaths)
          dirtyFiles.forEach(f => markClean(f.path))
          window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: true, fileCount: allPaths.length } }))
        } catch (err) {
          window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, error: String(err) } }))
        }
        return
      }

      if (!repo) return
      const dirtyFiles = files.filter(f => f.dirty)
      if (dirtyFiles.length === 0) return
      try {
        await commitFiles(repo.fullName, dirtyFiles.map(f => ({ path: f.path, content: f.content, sha: f.sha })), message, repo.branch)
        dirtyFiles.forEach(f => markClean(f.path))
        window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: true, fileCount: dirtyFiles.length } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, error: String(err) } }))
      }
    }
    window.addEventListener('agent-commit', handler)
    return () => window.removeEventListener('agent-commit', handler)
  }, [repo, files, markClean, localMode, localRootPath, gitInfo, localCommitFiles])

  // ─── Git panel / changes panel / PR panel navigation ───
  useEffect(() => {
    const openGit = () => setView('git')
    const openPrs = () => setView('prs')
    const openPrCreate = () => {
      setView('prs')
      setTimeout(() => window.dispatchEvent(new CustomEvent('pr-open-create')), 100)
    }
    window.addEventListener('open-git-panel', openGit)
    window.addEventListener('open-changes-panel', openGit)
    window.addEventListener('open-prs-panel', openPrs)
    window.addEventListener('open-pr-create', openPrCreate)
    return () => {
      window.removeEventListener('open-git-panel', openGit)
      window.removeEventListener('open-changes-panel', openGit)
      window.removeEventListener('open-prs-panel', openPrs)
      window.removeEventListener('open-pr-create', openPrCreate)
    }
  }, [setView])

  // ─── Push handler ─────────────────────────────────────
  useEffect(() => {
    const handler = async () => {
      try {
        await local.push()
        window.dispatchEvent(new CustomEvent('agent-push-result', { detail: { success: true } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('agent-push-result', { detail: { success: false, error: String(err) } }))
      }
    }
    window.addEventListener('agent-push', handler)
    return () => window.removeEventListener('agent-push', handler)
  }, [local])

  // ─── Save handler (⌘S + save-file event) ──────────────
  const saveFile = useCallback(async (path: string) => {
    const file = files.find(f => f.path === path)
    if (!file || !file.dirty) return

    if (localMode && localWriteFile) {
      try {
        await localWriteFile(path, file.content)
        markClean(path)
      } catch (err) {
        console.error('Failed to save file:', path, err)
      }
      return
    }

    if (repo) {
      try {
        await commitFiles(
          repo.fullName,
          [{ path: file.path, content: file.content, sha: file.sha }],
          `Update ${path.split('/').pop()}`,
          repo.branch
        )
        markClean(path)
      } catch (err) {
        console.error('Failed to save file to GitHub:', path, err)
      }
    }
  }, [files, localMode, localWriteFile, markClean, repo])

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (activeFile) saveFile(activeFile)
      }
    }
    const eventHandler = (e: Event) => {
      const { path } = (e as CustomEvent).detail ?? {}
      if (path) saveFile(path)
    }
    window.addEventListener('keydown', keyHandler)
    window.addEventListener('save-file', eventHandler)
    return () => {
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('save-file', eventHandler)
    }
  }, [activeFile, saveFile])

  // ─── Landing check ─────────────────────────────────────
  useEffect(() => {
    const hasVisited = localStorage.getItem('code-editor:visited')
    if (!hasVisited && !isTauriDesktop) setShowLanding(true)
  }, [isTauriDesktop])

  const dirtyCount = useMemo(() => files.filter(f => f.dirty).length, [files])

  if (showLanding) {
    return <Landing onEnter={() => { setShowLanding(false); localStorage.setItem('code-editor:visited', 'true') }} />
  }

  return (
    <div className="flex h-full w-full bg-[var(--bg)] text-[var(--text-primary)] overflow-hidden gap-1.5 p-1.5">
      {/* Tauri drag region */}
      {isTauriDesktop && (
        <div data-tauri-drag-region className="tauri-drag-region fixed top-0 left-0 right-0 h-10 z-[9999] pointer-events-none" />
      )}

      {/* Workspace Sidebar */}
      <WorkspaceSidebar
        activeId={activeChatId ?? ''}
        onSelect={(id) => { setActiveChatId(id); window.dispatchEvent(new CustomEvent('switch-chat', { detail: { id } })); setView('editor'); window.dispatchEvent(new CustomEvent('open-side-chat')) }}
        onNew={() => { const newId = crypto.randomUUID(); setActiveChatId(newId); window.dispatchEvent(new CustomEvent('switch-chat', { detail: { id: newId } })); setView('editor'); window.dispatchEvent(new CustomEvent('open-side-chat')) }}
        onDelete={(id) => { if (id === activeChatId) { setActiveChatId(null) } }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        repoName={repo?.fullName || localRootPath?.split('/').pop()}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-xl overflow-hidden border border-[var(--border)]">
        {/* View navigation bar */}
        <div data-tauri-drag-region className={`flex items-center h-10 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 px-2.5 gap-1 tauri-drag-region ${isMacTauri && sidebarCollapsed ? 'pl-20' : ''}`}>
          {/* View tabs with sliding indicator */}
          <div ref={tabContainerRef} className="relative flex items-center gap-1 tauri-no-drag">
            <span
              className="absolute top-1/2 -translate-y-1/2 h-[28px] rounded-md bg-[var(--bg-subtle)] transition-all duration-300 pointer-events-none"
              style={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                opacity: indicatorStyle.width > 0 ? 1 : 0,
              }}
            />
            {VISIBLE_VIEWS.map((v, i) => (
              <button
                key={v}
                ref={el => { tabRefs.current[i] = el }}
                onClick={() => setView(v)}
                className={`relative z-[1] flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
                  activeView === v
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                } ${flashedTab === v ? 'ring-1 ring-[var(--brand)] ring-opacity-60' : ''}`}
                title={`${VIEW_ICONS[v].label} (⌘${i + 1})`}
              >
                <Icon icon={VIEW_ICONS[v].icon} width={16} height={16} />
                <span className="hidden sm:inline">{VIEW_ICONS[v].label}</span>
                {v === 'git' && dirtyCount > 0 && (
                  <span className="px-1 min-w-[16px] text-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] text-[9px] leading-[16px] animate-badge-pop">{dirtyCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 tauri-drag-region" data-tauri-drag-region />

          {/* Settings */}
          <button onClick={() => setSettingsVisible(true)} className="tauri-no-drag p-1.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors" title="Settings">
            <Icon icon="lucide:settings" width={17} height={17} className="animate-gear-sway" />
          </button>
        </div>

        {/* Active view with crossfade transition */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          <div key={activeView} className="flex-1 flex min-h-0 min-w-0 w-full overflow-hidden view-enter">
            <ErrorBoundary key={activeView} fallbackLabel={`${VIEW_ICONS[activeView]?.label ?? activeView} failed to render`}>
              {activeView === 'editor' && <EditorView />}
              {activeView === 'preview' && <PreviewPanel />}
              {activeView === 'workflows' && <WorkflowView />}
              {activeView === 'grid' && <GridView />}
              {activeView === 'git' && <GitView />}
              {activeView === 'prs' && <PrView />}
              {activeView === 'settings' && (
                <div className="flex-1 flex items-center justify-center">
                  <SettingsPanel open={true} onClose={() => setView('editor')} />
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>

        {/* Terminal — persists across toggles so PTY sessions survive */}
        <div className={terminalVisible ? '' : 'hidden'}>
          <div
            className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors opacity-0 hover:opacity-50 shrink-0"
            onMouseDown={e => {
              e.preventDefault()
              const startY = e.clientY
              const startH = terminalHeight
              const onMove = (ev: MouseEvent) => setTerminalHeight(Math.max(100, Math.min(500, startH - (ev.clientY - startY))))
              const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
          />
          <div className="shrink-0 border-t border-[var(--border)]" style={{ height: terminalHeight }}>
            <TerminalPanel visible={terminalVisible} height={terminalHeight} onHeightChange={setTerminalHeight} />
          </div>
        </div>

        {/* Status bar */}
        <footer className="flex items-center justify-between px-3 h-[22px] border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] text-[var(--text-tertiary)] shrink-0">
          <div className="flex items-center gap-3">
            <FolderIndicator />
            <BranchPicker />
            {dirtyCount > 0 && (
              <span key={dirtyCount} className="flex items-center gap-1 text-[var(--warning,#eab308)] animate-badge-pop">
                <Icon icon="lucide:circle-dot" width={8} height={8} />
                {dirtyCount} unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PluginSlotRenderer slot="status-bar-right" />
            <span className="text-[var(--text-disabled)] font-medium">Knot Code</span>
            <span
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                status === 'connected'
                  ? `bg-[var(--color-additions)] ${connectionAnim === 'pop' ? 'animate-badge-pop animate-glow-pulse' : 'animate-orbit-dot'}`
                  : status === 'connecting' || status === 'authenticating'
                    ? 'bg-[var(--warning,#eab308)] animate-pulse'
                    : 'bg-[var(--text-disabled)] scale-75 opacity-60'
              }`}
              title={status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            />
          </div>
        </footer>
      </div>

      {/* Sidebar plugins (Spotify, etc.) */}
      <SidebarPluginSlot />

      {/* Plugins */}
      <SpotifyPlugin />
      <PipWindow />
      <ComponentIsolatorListener />
      <PluginSlotRenderer slot="floating" />

      {/* Modal overlays */}
      <QuickOpen
        open={quickOpenVisible}
        onClose={() => setQuickOpenVisible(false)}
        onSelect={(path, sha) => { window.dispatchEvent(new CustomEvent('file-select', { detail: { path, sha } })); setQuickOpenVisible(false) }}
      />
      <GlobalSearch
        open={globalSearchVisible}
        onClose={() => setGlobalSearchVisible(false)}
        onNavigate={(path, line) => { window.dispatchEvent(new CustomEvent('file-select', { detail: { path } })); setGlobalSearchVisible(false) }}
      />
      <CommandPalette
        open={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        onRun={(cmdId) => {
          setCommandPaletteVisible(false)
          switch (cmdId) {
            // Layout toggles
            case 'toggle-files': window.dispatchEvent(new CustomEvent('cmd:toggle-files')); break
            case 'toggle-terminal': window.dispatchEvent(new CustomEvent('toggle-terminal')); break
            case 'toggle-engine': window.dispatchEvent(new CustomEvent('cmd:toggle-engine')); break
            case 'toggle-chat': window.dispatchEvent(new CustomEvent('cmd:toggle-chat')); break
            case 'collapse-editor': window.dispatchEvent(new CustomEvent('cmd:collapse-editor')); break
            // Layout presets
            case 'layout-focus': window.dispatchEvent(new CustomEvent('cmd:layout-preset', { detail: 'focus' })); break
            case 'layout-review': window.dispatchEvent(new CustomEvent('cmd:layout-preset', { detail: 'review' })); break
            case 'layout-build': window.dispatchEvent(new CustomEvent('cmd:layout-preset', { detail: 'build' })); break
            // Navigation
            case 'view-editor': setView('editor'); break
            case 'view-git': setView('git'); break
            case 'view-prs': setView('prs'); break
            case 'view-settings': setView('settings'); break
            // File operations
            case 'find-files': setQuickOpenVisible(true); break
          }
        }}
      />
      <ShortcutsOverlay open={shortcutsVisible} onClose={() => setShortcutsVisible(false)} />
      {settingsVisible && activeView !== 'settings' && (
        <SettingsPanel open={settingsVisible} onClose={() => setSettingsVisible(false)} />
      )}
    </div>
  )
}
