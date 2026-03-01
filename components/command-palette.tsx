'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

type CommandId =
  | 'find-files'
  | 'format-document'
  | 'find-in-file'
  | 'replace-in-file'
  | 'toggle-case-sensitive'
  | 'toggle-whole-word'
  | 'toggle-regex'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onRun: (commandId: CommandId) => void
}

interface CommandItem {
  id: CommandId
  label: string
  hint: string
  keywords: string[]
}

const COMMANDS: CommandItem[] = [
  { id: 'find-files', label: 'Find files', hint: 'Open quick file search', keywords: ['file', 'quick', 'open', 'cmd+p'] },
  { id: 'format-document', label: 'Format document', hint: 'Run formatter in active editor', keywords: ['format', 'prettier', 'beautify'] },
  { id: 'find-in-file', label: 'Find in file', hint: 'Open editor search', keywords: ['find', 'search', 'match'] },
  { id: 'replace-in-file', label: 'Search and replace', hint: 'Open replace widget', keywords: ['replace', 'search', 'find'] },
  { id: 'toggle-case-sensitive', label: 'Toggle case matching', hint: 'Enable/disable case sensitive search', keywords: ['case', 'sensitive', 'match'] },
  { id: 'toggle-whole-word', label: 'Toggle whole word', hint: 'Match whole words only', keywords: ['whole', 'word', 'search'] },
  { id: 'toggle-regex', label: 'Toggle regex mode', hint: 'Use regular expression search', keywords: ['regex', 'pattern', 'search'] },
]

export function CommandPalette({ open, onClose, onRun }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter((command) => {
      if (command.label.toLowerCase().includes(q)) return true
      if (command.hint.toLowerCase().includes(q)) return true
      return command.keywords.some(k => k.includes(q))
    })
  }, [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const run = (index: number) => {
    const command = filtered[index]
    if (!command) return
    onRun(command.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Icon icon="lucide:command" width={16} height={16} className="text-[var(--brand)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(i => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(i => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(selectedIndex)
              }
            }}
            placeholder="Run a command..."
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-5 text-center text-[12px] text-[var(--text-tertiary)]">
              No matching commands
            </div>
          )}
          {filtered.map((command, index) => (
            <button
              key={command.id}
              onClick={() => run(index)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                index === selectedIndex
                  ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]'
                  : 'hover:bg-[var(--bg-subtle)]',
              )}
            >
              <div>
                <p className="text-[13px] text-[var(--text-primary)]">{command.label}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">{command.hint}</p>
              </div>
              <Icon icon="lucide:corner-down-left" width={13} height={13} className="text-[var(--text-tertiary)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { CommandId }
