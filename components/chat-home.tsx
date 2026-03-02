'use client'

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import { useEditor } from '@/context/editor-context'
import { getRecentFolders } from '@/context/local-context'

const STATIC_SUGGESTIONS = [
  { icon: 'lucide:sparkles', label: 'Edit this', prefix: 'Edit ' },
  { icon: 'lucide:zap', label: 'Squash bug', prefix: 'Fix ' },
  { icon: 'lucide:flame', label: 'Explain plz', prefix: 'Explain ' },
  { icon: 'lucide:wand-2', label: 'Test it', prefix: 'Write tests for ' },
  { icon: 'lucide:star', label: 'Review PR', prefix: 'Review ' },
]

function IconButton({ icon, title, size = 14, onClick, className = '' }: {
  icon: string
  title: string
  size?: number
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-colors cursor-pointer ${className}`}
      title={title}
      aria-label={title}
    >
      <Icon icon={icon} width={size} height={size} />
    </button>
  )
}

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
}

export const ChatHome = memo(function ChatHome({ onSend, onSelectFolder, onCloneRepo }: Props) {
  const [input, setInput] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('code')
  const [isFocused, setIsFocused] = useState(false)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [tokenRevealed, setTokenRevealed] = useState(false)
  const [ghSectionOpen, setGhSectionOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const { repo } = useRepo()
  const local = useLocal()
  const { status } = useGateway()
  const { token: ghToken, authenticated, setManualToken, clearToken } = useGitHubAuth()
  const { files: openFiles } = useEditor()

  const repoShort = useMemo(() => repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null, [repo?.fullName, local.rootPath])
  const hasWorkspace = !!repoShort

  const [recentFolders, setRecentFolders] = useState<string[]>(() => getRecentFolders())

  useEffect(() => {
    setRecentFolders(getRecentFolders())
  }, [local.rootPath])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  const handleSubmit = useCallback(() => {
    const t = input.trim()
    if (!t) return
    onSend(t, agentMode)
    setInput('')
  }, [input, agentMode, onSend])

  const handleSaveToken = useCallback(() => {
    const trimmed = tokenDraft.trim()
    if (!trimmed) return
    setManualToken(trimmed)
    setTokenDraft('')
    setShowTokenInput(false)
    setTokenRevealed(false)
  }, [tokenDraft, setManualToken])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Tab' && !input.trim()) {
      e.preventDefault()
      setAgentMode(m => m === 'chat' ? 'code' : 'chat')
    }
  }, [handleSubmit, input])

  const maskedToken = ghToken
    ? `${ghToken.slice(0, 4)}${'•'.repeat(Math.min(ghToken.length - 8, 24))}${ghToken.slice(-4)}`
    : ''

  // Context-aware suggestions: use open files and local tree when a workspace is active
  const suggestions = useMemo(() => {
    if (!hasWorkspace) return STATIC_SUGGESTIONS

    const contextChips: typeof STATIC_SUGGESTIONS = []

    // Suggest editing open files
    if (openFiles.length > 0) {
      const recent = openFiles[openFiles.length - 1]
      const name = recent.path.split('/').pop() || recent.path
      contextChips.push({ icon: 'lucide:sparkles', label: `Edit ${name}`, prefix: `Edit ${recent.path} ` })
    }

    // Suggest explaining a notable file from the tree
    const treeFiles = local.localTree?.filter(e => !e.is_dir) ?? []
    const interesting = treeFiles.find(f =>
      /\.(ts|tsx|rs|py|go)$/.test(f.path) &&
      !f.path.includes('node_modules') &&
      !f.path.includes('.lock')
    )
    if (interesting) {
      const name = interesting.path.split('/').pop() || interesting.path
      contextChips.push({ icon: 'lucide:flame', label: `Explain ${name}`, prefix: `Explain ${interesting.path} ` })
    }

    // Always include some generic actions
    contextChips.push(
      { icon: 'lucide:zap', label: 'Squash bug', prefix: 'Fix ' },
      { icon: 'lucide:wand-2', label: 'Test it', prefix: 'Write tests for ' },
      { icon: 'lucide:star', label: 'Review PR', prefix: 'Review ' },
    )

    return contextChips.slice(0, 5)
  }, [hasWorkspace, openFiles, local.localTree])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
      <div className="w-full max-w-[680px] py-5">
        {/* Logo + Heading */}
        <div className="flex flex-col items-center mb-4">
          <div className="mb-2.5 text-[var(--text-tertiary)]">
            <KnotLogo size={32} className="animate-knot-idle" />
          </div>
          <h1 className="text-center text-[17px] font-semibold text-[var(--text-primary)] tracking-[-0.01em] leading-tight">
            {repoShort ? `What should we work on?` : `What do you want to build?`}
          </h1>
          {hasWorkspace ? (
            <button onClick={onSelectFolder} className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer">
              <Icon icon="lucide:folder-git-2" width={11} height={11} />
              {repoShort}
            </button>
          ) : (
            <p className="mt-1.5 text-[11px] text-[var(--text-disabled)]">AI-powered code editor</p>
          )}
        </div>

        {/* Composer card */}
        <div
          ref={cardRef}
          className={`chat-input-card rounded-2xl border bg-[var(--bg-elevated)] overflow-hidden ${
            isFocused
              ? input.trim()
                ? 'chat-input-card-typing border-[color-mix(in_srgb,var(--brand)_30%,var(--border))]'
                : 'chat-input-card-focused border-[color-mix(in_srgb,var(--brand)_20%,var(--border))]'
              : 'border-[var(--border)]'
          }`}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={repoShort ? `Ask anything about ${repoShort}…` : 'Describe what you want to build…'}
            aria-label={repoShort ? `Ask anything about ${repoShort}` : 'Describe what you want to build'}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-[14px] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
          />

          {/* Toolbar */}
          <div className="px-3 pb-2 pt-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <IconButton icon="lucide:paperclip" title="Attach file" />
                <IconButton icon="lucide:image-plus" title="Attach image" />
                <IconButton icon="lucide:at-sign" title="@ mention file" />
                <div className="w-px h-4 bg-[var(--border)] mx-1" />
                <ModeSelector mode={agentMode} onChange={setAgentMode} size="sm" />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                aria-label="Send message"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  input.trim()
                    ? 'bg-[var(--text-primary)] text-[var(--bg)] shadow-sm hover:opacity-90 active:scale-95'
                    : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] cursor-not-allowed'
                }`}
              >
                <Icon icon="lucide:arrow-up" width={14} height={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick action chips */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
          {suggestions.map((a, i) => (
            <button
              key={a.label}
              onClick={() => { setInput(a.prefix); inputRef.current?.focus() }}
              aria-label={`${a.label}: ${a.prefix}`}
              className="anime-chip chip-enter flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-[color-mix(in_srgb,var(--brand)_8%,var(--bg-elevated))] text-[var(--text-secondary)] border border-[color-mix(in_srgb,var(--brand)_12%,var(--border))] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--brand)_14%,var(--bg-elevated))] hover:border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <Icon icon={a.icon} width={14} height={14} className="text-[var(--brand)]" />
              {a.label}
            </button>
          ))}
        </div>

        {/* Workspace actions — shown when no folder/repo is open */}
        {!hasWorkspace && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-disabled)] font-medium">Get started</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={onSelectFolder}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              >
                <Icon icon="lucide:folder-open" width={15} height={15} />
                Open Folder
              </button>
              <button
                onClick={onCloneRepo}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              >
                <Icon icon="lucide:git-branch" width={15} height={15} />
                Clone Repository
              </button>
            </div>

            {/* Recent folders */}
            {recentFolders.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-disabled)] font-medium mb-2 text-center">Recent</p>
                <div className="flex flex-col gap-0.5">
                  {recentFolders.slice(0, 3).map(folder => {
                    const name = folder.split('/').pop() || folder
                    const parent = folder.split('/').slice(0, -1).join('/') || '/'
                    return (
                      <button
                        key={folder}
                        onClick={() => local.setRootPath(folder)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors cursor-pointer group"
                      >
                        <Icon icon="lucide:folder" width={14} height={14} className="text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">{name}</div>
                          <div className="text-[10px] text-[var(--text-disabled)] truncate">{parent}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* GitHub Token — collapsed by default */}
            <div className="mt-4">
              <button
                onClick={() => setGhSectionOpen(v => !v)}
                className="w-full flex items-center gap-3 cursor-pointer group"
              >
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-disabled)] font-medium group-hover:text-[var(--text-tertiary)] transition-colors">
                  GitHub
                  {authenticated && <Icon icon="lucide:check-circle" width={10} height={10} className="text-[var(--success)]" />}
                  <Icon icon={ghSectionOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'} width={10} height={10} />
                </span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </button>

              {ghSectionOpen && (
                <div className="mt-2">
                  {authenticated ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
                      <Icon icon="lucide:check-circle" width={14} height={14} className="text-[var(--success)] shrink-0" />
                      <span className="text-[12px] text-[var(--text-secondary)] flex-1 font-mono truncate">
                        {tokenRevealed ? ghToken : maskedToken}
                      </span>
                      <IconButton
                        icon={tokenRevealed ? 'lucide:eye-off' : 'lucide:eye'}
                        title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                        size={13}
                        onClick={() => setTokenRevealed(v => !v)}
                      />
                      <button
                        onClick={() => { clearToken(); setTokenRevealed(false) }}
                        className="p-1 rounded-md hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
                        title="Remove token"
                        aria-label="Remove token"
                      >
                        <Icon icon="lucide:x" width={13} height={13} />
                      </button>
                    </div>
                  ) : showTokenInput ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 focus-within:border-[var(--border-focus)] transition-colors">
                        <Icon icon="lucide:key" width={13} height={13} className="text-[var(--text-disabled)] shrink-0" />
                        <input
                          type={tokenRevealed ? 'text' : 'password'}
                          value={tokenDraft}
                          onChange={e => setTokenDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveToken(); if (e.key === 'Escape') { setShowTokenInput(false); setTokenDraft(''); setTokenRevealed(false) } }}
                          placeholder="ghp_... or github_pat_..."
                          autoFocus
                          className="flex-1 bg-transparent text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none min-w-0"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="GitHub personal access token"
                        />
                        <IconButton
                          icon={tokenRevealed ? 'lucide:eye-off' : 'lucide:eye'}
                          title={tokenRevealed ? 'Hide' : 'Reveal'}
                          size={13}
                          onClick={() => setTokenRevealed(v => !v)}
                        />
                      </div>
                      <button
                        onClick={handleSaveToken}
                        disabled={!tokenDraft.trim()}
                        className={`px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all cursor-pointer ${
                          tokenDraft.trim()
                            ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                        }`}
                      >
                        Save
                      </button>
                      <IconButton
                        icon="lucide:x"
                        title="Cancel"
                        size={13}
                        onClick={() => { setShowTokenInput(false); setTokenDraft(''); setTokenRevealed(false) }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowTokenInput(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                    >
                      <Icon icon="lucide:key" width={13} height={13} />
                      Add GitHub Token
                    </button>
                  )}
                  <p className="text-[10px] text-[var(--text-disabled)] text-center mt-2">
                    {authenticated ? 'Token saved locally. Never sent to any server.' : 'Required for remote repos. Generate at github.com/settings/tokens'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
