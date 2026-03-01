'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { MarkdownPreview } from '@/components/markdown-preview'

const SESSION_KEY = 'agent:main:code-editor'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export function AgentPanel() {
  const { sendRequest, status } = useGateway()
  const { files, activeFile, getFile, updateFileContent } = useEditor()
  const { repo } = useRepo()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isConnected = status === 'connected'

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Build context for agent
  const buildContext = useCallback(() => {
    const parts: string[] = []
    if (repo) parts.push(`[Repo: ${repo.fullName} (${repo.branch})]`)
    const file = activeFile ? getFile(activeFile) : null
    if (file) {
      const preview = file.content.length > 4000 ? file.content.slice(0, 4000) + '\n[...truncated]' : file.content
      parts.push(`[Active file: ${file.path}]\n\`\`\`${file.language}\n${preview}\n\`\`\``)
    }
    if (files.filter(f => f.dirty).length > 0) {
      parts.push(`[Modified files: ${files.filter(f => f.dirty).map(f => f.path).join(', ')}]`)
    }
    return parts.join('\n\n')
  }, [repo, activeFile, files, getFile])

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)

    // Add user message
    appendMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })

    if (!isConnected) {
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: 'Gateway disconnected — cannot reach agent.', timestamp: Date.now() })
      setSending(false)
      return
    }

    try {
      const context = buildContext()
      const fullMessage = context ? `${context}\n\n${text}` : text

      setIsStreaming(true)
      const resp = (await sendRequest('chat.send', {
        sessionKey: SESSION_KEY,
        message: fullMessage,
        idempotencyKey: `ce-${Date.now()}`,
      })) as Record<string, unknown> | undefined

      const reply = String(resp?.reply ?? resp?.text ?? '')
      if (reply) {
        appendMessage({ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: Date.now() })
      }
    } catch (err) {
      appendMessage({
        id: crypto.randomUUID(), role: 'system',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
    } finally {
      setSending(false)
      setIsStreaming(false)
    }
  }, [input, sending, isConnected, sendRequest, buildContext, appendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  // Slash command suggestions
  const suggestions = useMemo(() => {
    if (!input.startsWith('/')) return []
    const cmds = [
      { cmd: '/edit', desc: 'Edit current file' },
      { cmd: '/explain', desc: 'Explain selected code' },
      { cmd: '/refactor', desc: 'Refactor code' },
      { cmd: '/generate', desc: 'Generate new code' },
      { cmd: '/search', desc: 'Search across repo' },
      { cmd: '/commit', desc: 'Commit changes' },
      { cmd: '/diff', desc: 'Show current changes' },
    ]
    const term = input.toLowerCase()
    return cmds.filter(c => c.cmd.startsWith(term))
  }, [input])

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0">
        <Icon icon="lucide:sparkles" width={14} height={14} className="text-[var(--brand)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">Agent</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">&middot;</span>
        <span className={`text-[10px] ${isConnected ? 'text-[var(--color-additions)]' : 'text-[var(--color-deletions)]'}`}>
          {isConnected ? 'connected' : 'offline'}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-8">
            <Icon icon="lucide:sparkles" width={24} height={24} className="text-[var(--brand)] mb-2" />
            <p className="text-[12px] text-[var(--text-secondary)]">Coding Agent</p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 max-w-[200px]">
              Ask me to edit, explain, refactor, or generate code.
            </p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] min-w-0 rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[var(--brand-chat)] text-[var(--foreground)] rounded-br-sm'
                : msg.role === 'system'
                  ? 'px-2.5 py-1.5 text-[10px] border-l-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] text-[var(--text-secondary)]'
                  : 'bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm'
            }`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div className="prose-chat">
                  <MarkdownPreview content={msg.content} />
                </div>
              )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] rounded-bl-sm">
              <Icon icon="lucide:loader-2" width={14} height={14} className="text-[var(--brand)] animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-3 pb-1">
          <div className="flex flex-wrap gap-1">
            {suggestions.map(s => (
              <button
                key={s.cmd}
                onClick={() => setInput(s.cmd + ' ')}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)] transition-colors cursor-pointer"
              >
                <span className="font-mono text-[var(--brand)]">{s.cmd}</span>
                <span className="ml-1 text-[var(--text-tertiary)]">{s.desc}</span>
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
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask or type /command..."
            rows={1}
            className="w-full resize-none rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-2 pr-10 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--brand)] disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            title="Send"
          >
            <Icon icon={isStreaming ? 'lucide:square' : 'lucide:send'} width={14} height={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
