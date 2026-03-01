'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import type { AgentMode } from '@/components/mode-selector'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import { getRecentFolders } from '@/context/local-context'

const ACTIONS = [
  { icon: 'lucide:pencil', label: 'Edit', prefix: 'Edit ' },
  { icon: 'lucide:bug', label: 'Fix', prefix: 'Fix ' },
  { icon: 'lucide:book-open', label: 'Explain', prefix: 'Explain ' },
  { icon: 'lucide:flask-conical', label: 'Test', prefix: 'Write tests for ' },
  { icon: 'lucide:git-pull-request', label: 'Review', prefix: 'Review ' },
]

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
}

export function ChatHome({ onSend, onSelectFolder, onCloneRepo }: Props) {
  const [input, setInput] = useState('')
  const [modelName, setModelName] = useState('Opus 4.6')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [tokenRevealed, setTokenRevealed] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const { repo } = useRepo()
  const local = useLocal()
  const { sendRequest, status } = useGateway()
  const { token: ghToken, authenticated, setManualToken, clearToken } = useGitHubAuth()
  const isConnected = status === 'connected'

  const repoShort = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null
  const hasWorkspace = !!repoShort
  const recentFolders = getRecentFolders()

  const isTyping = isFocused && !!input.trim()

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || !isFocused || isTyping) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const card = cardRef.current
      if (!card) return
      const rect = card.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      const rotateX = (0.5 - y) * 6
      const rotateY = (x - 0.5) * 6
      card.style.setProperty('--rx', `${rotateX}deg`)
      card.style.setProperty('--ry', `${rotateY}deg`)
    })
  }, [isFocused, isTyping])

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return
    cardRef.current.style.setProperty('--rx', '0deg')
    cardRef.current.style.setProperty('--ry', '0deg')
  }, [])

  useEffect(() => {
    if (isTyping && cardRef.current) {
      cardRef.current.style.setProperty('--rx', '0deg')
      cardRef.current.style.setProperty('--ry', '0deg')
    }
  }, [isTyping])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!isConnected) return
    sendRequest('sessions.status', {}).then((r: any) => {
      if (r?.model) {
        const s = (r.model as string).split('/').pop()?.replace(/-/g, ' ') ?? r.model
        setModelName(s.length > 20 ? s.slice(0, 18) + '…' : s)
      }
    }).catch(() => {})
  }, [isConnected, sendRequest])

  const handleSubmit = () => {
    const t = input.trim()
    if (!t) return
    onSend(t, 'agent')
    setInput('')
  }

  const handleSaveToken = () => {
    const trimmed = tokenDraft.trim()
    if (!trimmed) return
    setManualToken(trimmed)
    setTokenDraft('')
    setShowTokenInput(false)
    setTokenRevealed(false)
  }

  const maskedToken = ghToken
    ? `${ghToken.slice(0, 4)}${'•'.repeat(Math.min(ghToken.length - 8, 24))}${ghToken.slice(-4)}`
    : ''

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
      <div className="w-full max-w-[580px] py-6">
        <div className="flex justify-center mb-4">
          <KnotLogo size={40} />
        </div>
        <h1 className="text-center text-[22px] font-semibold text-[var(--text-primary)] tracking-tight mb-4">
          {repoShort ? `What should we work on?` : `What do you want to build?`}
        </h1>

        {/* Input */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={`chat-input-3d rounded-xl border bg-[var(--bg-elevated)] overflow-hidden mb-4 ${
            isFocused
              ? input.trim()
                ? 'chat-input-3d-typing border-[color-mix(in_srgb,var(--brand)_40%,var(--border))]'
                : 'chat-input-3d-active border-[color-mix(in_srgb,var(--brand)_40%,var(--border))]'
              : 'border-[var(--border)]'
          }`}
          style={{ '--rx': '0deg', '--ry': '0deg' } as React.CSSProperties}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            placeholder={repoShort ? `Describe a change to ${repoShort}…` : 'Describe what you want to build…'}
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer" title="Attach file">
                <Icon icon="lucide:paperclip" width={16} height={16} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer"
                >
                  {modelName}
                  <Icon icon="lucide:chevron-down" width={10} height={10} />
                </button>
                {showModelMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-1 w-48 bg-[var(--bg-subtle)] border border-[var(--border-hover)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] z-50 py-1 overflow-hidden">
                      {['Opus 4.6', 'Sonnet 4.5', 'Haiku 3.5'].map(m => (
                        <button key={m} onClick={() => { setModelName(m); setShowModelMenu(false) }} className={`w-full text-left px-3 h-[32px] text-[12px] hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors ${modelName === m ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-primary)]'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                input.trim()
                  ? 'bg-[var(--text-primary)] text-[var(--bg)]'
                  : 'bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-disabled)] cursor-not-allowed'
              }`}
            >
              <Icon icon="lucide:arrow-up" width={16} height={16} />
            </button>
          </div>
        </div>

        {/* Action pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => { setInput(a.prefix); inputRef.current?.focus() }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[var(--border)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
            >
              <Icon icon={a.icon} width={14} height={14} />
              {a.label}
            </button>
          ))}
        </div>

        {/* Workspace actions — shown when no folder/repo is open */}
        {!hasWorkspace && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-disabled)] font-medium">Start</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={onSelectFolder}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              >
                <Icon icon="lucide:folder-open" width={16} height={16} />
                Open Folder
              </button>
              <button
                onClick={onCloneRepo}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              >
                <Icon icon="lucide:git-branch" width={16} height={16} />
                Clone Repository
              </button>
            </div>

            {/* Recent folders */}
            {recentFolders.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-disabled)] font-medium mb-1.5 text-center">Recent</p>
                <div className="flex flex-col gap-0.5">
                  {recentFolders.slice(0, 3).map(folder => {
                    const name = folder.split('/').pop() || folder
                    const parent = folder.split('/').slice(0, -1).join('/') || '/'
                    return (
                      <button
                        key={folder}
                        onClick={() => local.setRootPath(folder)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
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

            {/* GitHub Token */}
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-disabled)] font-medium">GitHub</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              {authenticated ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <Icon icon="lucide:check-circle" width={14} height={14} className="text-[var(--success)] shrink-0" />
                  <span className="text-[12px] text-[var(--text-secondary)] flex-1 font-mono truncate">
                    {tokenRevealed ? ghToken : maskedToken}
                  </span>
                  <button
                    onClick={() => setTokenRevealed(v => !v)}
                    className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                    title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                  >
                    <Icon icon={tokenRevealed ? 'lucide:eye-off' : 'lucide:eye'} width={13} height={13} />
                  </button>
                  <button
                    onClick={() => { clearToken(); setTokenRevealed(false) }}
                    className="p-1 rounded hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
                    title="Remove token"
                  >
                    <Icon icon="lucide:x" width={13} height={13} />
                  </button>
                </div>
              ) : showTokenInput ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 focus-within:border-[var(--border-focus)] transition-colors">
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
                    />
                    <button
                      onClick={() => setTokenRevealed(v => !v)}
                      className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                      title={tokenRevealed ? 'Hide' : 'Reveal'}
                    >
                      <Icon icon={tokenRevealed ? 'lucide:eye-off' : 'lucide:eye'} width={12} height={12} />
                    </button>
                  </div>
                  <button
                    onClick={handleSaveToken}
                    disabled={!tokenDraft.trim()}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                      tokenDraft.trim()
                        ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                    }`}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setShowTokenInput(false); setTokenDraft(''); setTokenRevealed(false) }}
                    className="p-1.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={13} height={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowTokenInput(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                >
                  <Icon icon="lucide:key" width={14} height={14} />
                  Add GitHub Token
                </button>
              )}
              <p className="text-[10px] text-[var(--text-disabled)] text-center mt-1.5">
                {authenticated ? 'Token saved locally. Never sent to any server.' : 'Required for remote repos. Generate at github.com/settings/tokens'}
              </p>
            </div>
          </div>
        )}

        {/* Repo link — shown when workspace is open */}
        {hasWorkspace && (
          <div className="text-center mt-5">
            <button onClick={onSelectFolder} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer">
              <Icon icon="lucide:folder-git-2" width={12} height={12} />
              {repoShort}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
