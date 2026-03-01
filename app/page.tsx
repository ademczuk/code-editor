'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { FileExplorer } from '@/components/file-explorer'
import { EditorTabs } from '@/components/editor-tabs'
import { CodeEditor } from '@/components/code-editor'
import { AgentPanel } from '@/components/agent-panel'
import { RepoSelector } from '@/components/repo-selector'
import { useRepo } from '@/context/repo-context'
import { useEditor } from '@/context/editor-context'
import { useGateway } from '@/context/gateway-context'

export default function EditorPage() {
  const { repo } = useRepo()
  const { openFile } = useEditor()
  const { status } = useGateway()
  const [explorerWidth, setExplorerWidth] = useState(240)
  const [agentWidth, setAgentWidth] = useState(360)
  const [agentVisible, setAgentVisible] = useState(true)

  // Handle file-select events from explorer
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, sha } = (e as CustomEvent).detail
      if (!repo) return
      try {
        const res = await fetch(`/api/github/repos/${repo.owner}/${repo.repo}/contents/${path}`)
        if (!res.ok) throw new Error('Failed to fetch file')
        const data = await res.json()
        const content = data.content
          ? atob(data.content.replace(/\n/g, ''))
          : data.text ?? ''
        openFile(path, content, data.sha ?? sha)
      } catch (err) {
        console.error('Failed to open file:', err)
      }
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [repo, openFile])

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-11 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:code" width={18} height={18} className="text-[var(--brand)]" />
            <span className="text-[13px] font-bold text-[var(--text-primary)]">code-editor</span>
          </div>
          <div className="w-px h-5 bg-[var(--border)]" />
          <RepoSelector />
        </div>

        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-[10px] ${
            status === 'connected' ? 'text-[var(--color-additions)]' : 'text-[var(--text-tertiary)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected' ? 'bg-[var(--color-additions)]' : 'bg-[var(--text-tertiary)]'
            }`} />
            {status === 'connected' ? 'gateway' : 'offline'}
          </span>

          <button
            onClick={() => setAgentVisible(!agentVisible)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              agentVisible
                ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
            }`}
            title={agentVisible ? 'Hide agent panel' : 'Show agent panel'}
          >
            <Icon icon="lucide:sparkles" width={15} height={15} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* File Explorer */}
        <div
          className="shrink-0 border-r border-[var(--border)] bg-[var(--bg)]"
          style={{ width: explorerWidth }}
        >
          <FileExplorer />
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditorTabs />
          <CodeEditor />
        </div>

        {/* Agent Panel */}
        {agentVisible && (
          <div
            className="shrink-0 border-l border-[var(--border)]"
            style={{ width: agentWidth }}
          >
            <AgentPanel />
          </div>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between px-3 h-6 border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[9px] text-[var(--text-tertiary)] shrink-0">
        <div className="flex items-center gap-3">
          {repo && <span className="font-mono">{repo.fullName}</span>}
          {repo && <span>{repo.branch}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>code-editor v0.1.0</span>
        </div>
      </footer>
    </div>
  )
}
