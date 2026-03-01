'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { MarkdownPreview } from '@/components/markdown-preview'
import { DiffViewer } from '@/components/diff-viewer'
import { parseEditProposals, type EditProposal } from '@/lib/edit-parser'
import { navigateToLine } from '@/lib/line-links'
import {
  CODE_EDITOR_SESSION_KEY,
  SESSION_INIT_STORAGE_KEY,
  CODE_EDITOR_SYSTEM_PROMPT_VERSION,
  CODE_EDITOR_SYSTEM_PROMPT,
  buildEditorContext,
} from '@/lib/agent-session'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  editProposals?: EditProposal[]
}

export function AgentPanel() {
  const { sendRequest, onEvent, status } = useGateway()
  const { files, activeFile, getFile, openFile, updateFileContent } = useEditor()
  const { repo } = useRepo()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [sending, setSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeDiff, setActiveDiff] = useState<{
    proposal: EditProposal
    messageId: string
    original: string
  } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionInitRef = useRef(false)
  const sentKeysRef = useRef(new Set<string>())
  const [streamBuffer, setStreamBuffer] = useState('')

  const isConnected = status === 'connected'

  // ─── Session initialization (inject system prompt once) ───────
  useEffect(() => {
    if (!isConnected || sessionInitRef.current) return

    const initKey = `${SESSION_INIT_STORAGE_KEY}:${CODE_EDITOR_SESSION_KEY}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`
    const alreadyInit = typeof window !== 'undefined' && sessionStorage.getItem(initKey)
    if (alreadyInit) {
      sessionInitRef.current = true
      return
    }

    // Inject system prompt
    sendRequest('chat.inject', {
      sessionKey: CODE_EDITOR_SESSION_KEY,
      message: CODE_EDITOR_SYSTEM_PROMPT,
      label: 'Knot Code system prompt',
    }).then(() => {
      sessionInitRef.current = true
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(initKey, 'true')
      }
    }).catch(() => {
      // Non-fatal — session still works without explicit system prompt
    })

    // Label the session
    sendRequest('sessions.patch', {
      key: CODE_EDITOR_SESSION_KEY,
      label: 'Knot Code Agent',
    }).catch(() => { /* non-fatal */ })
  }, [isConnected, sendRequest])

  // ─── Listen for chat events (streaming replies) ───────────────
  useEffect(() => {
    const unsub = onEvent('chat', (payload: unknown) => {
      const p = payload as Record<string, unknown>
      const state = p.state as string | undefined
      const idempotencyKey = p.idempotencyKey as string | undefined
      const eventSessionKey = p.sessionKey as string | undefined

      // Match by idempotency key or session key fallback
      const matchesIdem = !!(idempotencyKey && sentKeysRef.current.has(idempotencyKey))
      const matchesSession = !idempotencyKey && eventSessionKey === CODE_EDITOR_SESSION_KEY
      if (!matchesIdem && !matchesSession) return

      if (state === 'delta') {
        const message = p.message as Record<string, unknown> | undefined
        if (message) {
          const content = message.content as string | Array<Record<string, unknown>> | undefined
          let text = ''
          if (typeof content === 'string') text = content
          else if (Array.isArray(content)) {
            text = content
              .filter((b) => b.type === 'text' || b.type === 'output_text')
              .map((b) => (b.text as string) || '')
              .join('')
          }
          if (text) {
            setStreamBuffer(text)
            setIsStreaming(true)
          }
        }
      } else if (state === 'final') {
        const message = p.message as Record<string, unknown> | undefined
        let finalText = ''
        if (message) {
          const content = message.content as string | Array<Record<string, unknown>> | undefined
          if (typeof content === 'string') finalText = content
          else if (Array.isArray(content)) {
            finalText = content
              .filter((b) => b.type === 'text' || b.type === 'output_text')
              .map((b) => (b.text as string) || '')
              .join('')
          }
        }
        if (idempotencyKey) sentKeysRef.current.delete(idempotencyKey)
        setStreamBuffer(prev => {
          const text = finalText || prev || ''
          if (text && !/^NO_REPLY$/i.test(text.trim())) {
            const editProposals = parseEditProposals(text)
            setMessages(msgs => [...msgs, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: text,
              timestamp: Date.now(),
              editProposals: editProposals.length > 0 ? editProposals : undefined,
            }])
          }
          return ''
        })
        setIsStreaming(false)
        setSending(false)
      } else if (state === 'error') {
        const errorMsg = (p.errorMessage as string) || 'Unknown error'
        if (idempotencyKey) sentKeysRef.current.delete(idempotencyKey)
        setStreamBuffer('')
        setMessages(msgs => [...msgs, {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: 'Error: ' + errorMsg,
          timestamp: Date.now(),
        }])
        setIsStreaming(false)
        setSending(false)
      } else if (state === 'aborted') {
        if (idempotencyKey) sentKeysRef.current.delete(idempotencyKey)
        setStreamBuffer(prev => {
          if (prev) {
            setMessages(msgs => [...msgs, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: prev + ' [cancelled]',
              timestamp: Date.now(),
            }])
          }
          return ''
        })
        setIsStreaming(false)
        setSending(false)
      }
    })
    return unsub
  }, [onEvent])

  // ─── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamBuffer])

  // ─── Build per-message context ────────────────────────────────
  const buildContext = useCallback(() => {
    const file = activeFile ? getFile(activeFile) : undefined
    return buildEditorContext({
      repoFullName: repo?.fullName,
      branch: repo?.branch,
      activeFilePath: file?.path,
      activeFileContent: file?.content,
      activeFileLanguage: file?.language,
      openFiles: files.map(f => ({ path: f.path, dirty: f.dirty })),
    })
  }, [repo, activeFile, files, getFile])


  // ─── Message helpers ──────────────────────────────────────────
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  // ─── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })

    if (!isConnected) {
      appendMessage({
        id: crypto.randomUUID(), role: 'system',
        content: 'Gateway disconnected — cannot reach agent.',
        timestamp: Date.now(),
      })
      setSending(false)
      return
    }

    try {
      const context = buildContext()
      const fullMessage = context ? `${context}\n\n${text}` : text
      const idemKey = `ce-${Date.now()}`
      sentKeysRef.current.add(idemKey)

      setIsStreaming(true)
      const resp = (await sendRequest('chat.send', {
        sessionKey: CODE_EDITOR_SESSION_KEY,
        message: fullMessage,
        idempotencyKey: idemKey,
      })) as Record<string, unknown> | undefined

      const respStatus = resp?.status as string | undefined
      if (respStatus === 'started' || respStatus === 'in_flight') {
        // Streaming — reply will arrive via onEvent('chat') handler
        return
      }

      // Synchronous reply (non-streaming fallback)
      // Only process if the event handler hasn't already consumed this key
      if (!sentKeysRef.current.has(idemKey)) return // already handled by event
      sentKeysRef.current.delete(idemKey)
      const reply = String(resp?.reply ?? resp?.text ?? '')
      if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
        const editProposals = parseEditProposals(reply)
        appendMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
          editProposals: editProposals.length > 0 ? editProposals : undefined,
        })
      }
      setIsStreaming(false)
      setSending(false)
    } catch (err) {
      appendMessage({
        id: crypto.randomUUID(), role: 'system',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
      setIsStreaming(false)
      setSending(false)
    }
  }, [input, sending, isConnected, sendRequest, buildContext, appendMessage])

  // ─── Handle ⌘K inline edit requests ────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { filePath, instruction, selectedText, startLine, endLine } = (e as CustomEvent).detail
      if (!isConnected || sending) return

      const prompt = [
        `[Inline Edit Request]`,
        `File: ${filePath}`,
        `Lines ${startLine}-${endLine}:`,
        '```',
        selectedText,
        '```',
        '',
        `Instruction: ${instruction}`,
        '',
        'Respond with [EDIT ' + filePath + '] containing the complete updated file.',
      ].join('\n')

      // Inject as user message and send
      setInput('')
      setSending(true)
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: `⌘K: ${instruction}`, timestamp: Date.now() })

      const context = buildContext()
      const fullMessage = context ? `${context}\n\n${prompt}` : prompt
      const idemKey = `ce-inline-${Date.now()}`
      sentKeysRef.current.add(idemKey)
      setIsStreaming(true)

      sendRequest('chat.send', {
        sessionKey: CODE_EDITOR_SESSION_KEY,
        message: fullMessage,
        idempotencyKey: idemKey,
      }).then((resp) => {
        const r = resp as Record<string, unknown> | undefined
        const status = r?.status as string | undefined
        if (status === 'started' || status === 'in_flight') return
        if (!sentKeysRef.current.has(idemKey)) return
        sentKeysRef.current.delete(idemKey)
        const reply = String(r?.reply ?? r?.text ?? '')
        if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
          const editProposals = parseEditProposals(reply)
          appendMessage({
            id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: Date.now(),
            editProposals: editProposals.length > 0 ? editProposals : undefined,
          })
        }
        setIsStreaming(false)
        setSending(false)
      }).catch((err: unknown) => {
        appendMessage({
          id: crypto.randomUUID(), role: 'system',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
        })
        setIsStreaming(false)
        setSending(false)
      })
    }
    window.addEventListener('inline-edit-request', handler)
    return () => window.removeEventListener('inline-edit-request', handler)
  }, [isConnected, sending, sendRequest, buildContext, appendMessage])



    // ─── Diff review flow ─────────────────────────────────────────
  const handleShowDiff = useCallback((proposal: EditProposal, messageId: string) => {
    const existing = getFile(proposal.filePath)
    setActiveDiff({ proposal, messageId, original: existing?.content ?? '' })
  }, [getFile])

  const handleQuickApply = useCallback((proposal: EditProposal) => {
    const existing = getFile(proposal.filePath)
    if (existing) {
      updateFileContent(proposal.filePath, proposal.content)
    } else {
      openFile(proposal.filePath, proposal.content, undefined)
    }
    appendMessage({
      id: crypto.randomUUID(), role: 'system',
      content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
      timestamp: Date.now(),
    })
  }, [getFile, updateFileContent, openFile, appendMessage])

  const handleApplyEdit = useCallback(() => {
    if (!activeDiff) return
    const { proposal } = activeDiff
    const existing = getFile(proposal.filePath)
    if (existing) {
      updateFileContent(proposal.filePath, proposal.content)
    } else {
      openFile(proposal.filePath, proposal.content, undefined)
    }
    appendMessage({
      id: crypto.randomUUID(), role: 'system',
      content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, getFile, updateFileContent, openFile, appendMessage])

  const handleRejectEdit = useCallback(() => {
    if (!activeDiff) return
    appendMessage({
      id: crypto.randomUUID(), role: 'system',
      content: `Rejected edit to \`${activeDiff.proposal.filePath}\`.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, appendMessage])

  // ─── Slash command suggestions ────────────────────────────────
  const suggestions = useMemo(() => {
    if (!input.startsWith('/')) return []
    const cmds = [
      { cmd: '/edit', desc: 'Edit current file', icon: 'lucide:pencil' },
      { cmd: '/explain', desc: 'Explain code', icon: 'lucide:book-open' },
      { cmd: '/refactor', desc: 'Refactor code', icon: 'lucide:refresh-cw' },
      { cmd: '/generate', desc: 'Generate new code', icon: 'lucide:plus' },
      { cmd: '/search', desc: 'Search across repo', icon: 'lucide:search' },
      { cmd: '/commit', desc: 'Commit changes', icon: 'lucide:git-commit-horizontal' },
      { cmd: '/diff', desc: 'Show changes', icon: 'lucide:git-compare' },
    ]
    const term = input.toLowerCase()
    return cmds.filter(c => c.cmd.startsWith(term))
  }, [input])

  // ─── Keyboard ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestionIdx(i => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestionIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const idx = activeSuggestionIdx >= 0 ? activeSuggestionIdx : 0
        setInput(suggestions[idx].cmd + ' ')
        setActiveSuggestionIdx(-1)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setActiveSuggestionIdx(-1)
        setInput('')
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [suggestions, activeSuggestionIdx, sendMessage])

  // ─── Clear chat ───────────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false)
  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setMessages([])
    setConfirmClear(false)
  }, [confirmClear])

  // ─── Diff overlay ─────────────────────────────────────────────
  if (activeDiff) {
    return (
      <DiffViewer
        filePath={activeDiff.proposal.filePath}
        original={activeDiff.original}
        modified={activeDiff.proposal.content}
        onApply={handleApplyEdit}
        onReject={handleRejectEdit}
      />
    )
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:sparkles" width={14} height={14} className="text-[var(--brand)]" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">Agent</span>
          <span className="text-[10px] text-[var(--text-tertiary)]">&middot;</span>
          <span className={`text-[10px] ${isConnected ? 'text-[var(--color-additions)]' : 'text-[var(--color-deletions)]'}`}>
            {isConnected ? 'connected' : 'offline'}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className={`p-1 rounded text-[10px] transition-colors cursor-pointer ${
              confirmClear
                ? 'text-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title={confirmClear ? 'Click again to clear' : 'Clear chat'}
          >
            <Icon icon={confirmClear ? 'lucide:alert-triangle' : 'lucide:eraser'} width={13} height={13} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-8">
            <Icon icon="lucide:sparkles" width={24} height={24} className="text-[var(--brand)] mb-2" />
            <p className="text-[12px] font-medium text-[var(--text-secondary)]">Coding Agent</p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 max-w-[200px]">
              Full-stack expert. Ask me to edit, explain, refactor, or generate code.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
              {['/edit', '/explain', '/refactor', '/generate'].map(cmd => (
                <button
                  key={cmd}
                  onClick={() => setInput(cmd + ' ')}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors cursor-pointer"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[90%] min-w-0 rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--text-primary)] rounded-br-sm'
                : msg.role === 'system'
                  ? 'px-2.5 py-1.5 text-[10px] border-l-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] text-[var(--text-secondary)]'
                  : 'bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm'
            }`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div
                  className="prose-chat"
                  onClick={(e) => {
                    // Click-to-navigate: detect line references in clicked text
                    const target = e.target as HTMLElement
                    const text = target.textContent ?? ''
                    // Match "line N", "lines N-M", "LN", path:N patterns
                    const lineMatch = text.match(/(?:lines?\s+|L)(\d+)(?:\s*[-–]\s*L?(\d+))?/i)
                      || text.match(/([\w./\-]+\.\w+)[:#]L?(\d+)/)
                    if (lineMatch) {
                      const start = parseInt(lineMatch[1] ?? '', 10)
                      const end = lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined
                      if (!isNaN(start)) {
                        e.preventDefault()
                        navigateToLine(start, end)
                      }
                    }
                  }}
                >
                  <MarkdownPreview content={msg.content} />
                </div>
              )}
            </div>

            {/* Edit proposal buttons */}
            {msg.editProposals && msg.editProposals.length > 0 && (
              <div className="flex flex-col gap-1 mt-1.5">
                {msg.editProposals.map((proposal, i) => (
                  <div key={i} className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => handleQuickApply(proposal)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors cursor-pointer"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--color-additions) 40%, transparent)',
                        backgroundColor: 'color-mix(in srgb, var(--color-additions) 12%, transparent)',
                        color: 'var(--color-additions)',
                      }}
                      title="Apply changes to editor"
                    >
                      <Icon icon="lucide:play" width={12} height={12} />
                      Apply to {proposal.filePath.split('/').pop()}
                    </button>
                    <button
                      onClick={() => handleShowDiff(proposal, msg.id)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      title="Review changes in diff viewer first"
                    >
                      <Icon icon="lucide:git-compare" width={12} height={12} />
                      Diff
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div className="flex flex-col items-start">
            {streamBuffer ? (
              <div className="max-w-[90%] min-w-0 rounded-xl px-3 py-2 text-[12px] leading-relaxed bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm">
                <div className="prose-chat">
                  <MarkdownPreview content={streamBuffer} />
                </div>
                <span className="inline-block w-1.5 h-3.5 bg-[var(--brand)] animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] rounded-bl-sm">
                <Icon icon="lucide:loader-2" width={14} height={14} className="text-[var(--brand)] animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-3 pb-1 shrink-0">
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s, i) => (
              <button
                key={s.cmd}
                onClick={() => { setInput(s.cmd + ' '); setActiveSuggestionIdx(-1) }}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  i === activeSuggestionIdx
                    ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]'
                }`}
              >
                <Icon icon={s.icon} width={10} height={10} className="text-[var(--brand)]" />
                <span className="font-mono text-[var(--brand)]">{s.cmd}</span>
                <span className="text-[var(--text-tertiary)]">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); setActiveSuggestionIdx(-1) }}
            onKeyDown={handleKeyDown}
            placeholder={activeFile ? `Ask about ${activeFile.split('/').pop()}...` : 'Ask or type /command...'}
            rows={1}
            className="w-full resize-none rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-2 pr-10 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--brand)] disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            title="Send (Enter)"
          >
            <Icon icon={isStreaming ? 'lucide:square' : 'lucide:send'} width={14} height={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
