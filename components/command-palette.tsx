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
  // Layout toggles
  | 'toggle-files'
  | 'toggle-terminal'
  | 'toggle-engine'
  | 'toggle-chat'
  | 'collapse-editor'
  // Layout presets
  | 'layout-focus'
  | 'layout-review'
  | 'layout-build'
  // Navigation
  | 'view-editor'
  | 'view-git'
  | 'view-prs'
  | 'view-settings'

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
  icon: string
  shortcut?: string
  group: 'search' | 'layout' | 'preset' | 'navigate'
}

const COMMANDS: CommandItem[] = [
  // Search
  { id: 'find-files', label: 'Find files', hint: 'Open quick file search', keywords: ['file', 'quick', 'open'], icon: 'lucide:file-search', shortcut: '⌘P', group: 'search' },
  { id: 'format-document', label: 'Format document', hint: 'Run formatter in active editor', keywords: ['format', 'prettier', 'beautify'], icon: 'lucide:wand-2', group: 'search' },
  { id: 'find-in-file', label: 'Find in file', hint: 'Open editor search', keywords: ['find', 'search', 'match'], icon: 'lucide:search', shortcut: '⌘F', group: 'search' },
  { id: 'replace-in-file', label: 'Search and replace', hint: 'Open replace widget', keywords: ['replace', 'search', 'find'], icon: 'lucide:replace', shortcut: '⌘H', group: 'search' },
  { id: 'toggle-case-sensitive', label: 'Toggle case matching', hint: 'Enable/disable case sensitive search', keywords: ['case', 'sensitive', 'match'], icon: 'lucide:case-sensitive', group: 'search' },
  { id: 'toggle-whole-word', label: 'Toggle whole word', hint: 'Match whole words only', keywords: ['whole', 'word', 'search'], icon: 'lucide:whole-word', group: 'search' },
  { id: 'toggle-regex', label: 'Toggle regex mode', hint: 'Use regular expression search', keywords: ['regex', 'pattern', 'search'], icon: 'lucide:regex', group: 'search' },

  // Layout toggles
  { id: 'toggle-files', label: 'Toggle file explorer', hint: 'Show or hide the file tree', keywords: ['files', 'tree', 'explorer', 'sidebar'], icon: 'lucide:folder', shortcut: '⌘B', group: 'layout' },
  { id: 'toggle-terminal', label: 'Toggle terminal', hint: 'Show or hide the terminal panel', keywords: ['terminal', 'shell', 'console'], icon: 'lucide:terminal', shortcut: '⌘J', group: 'layout' },
  { id: 'toggle-engine', label: 'Toggle engine panel', hint: 'Show or hide the engine output', keywords: ['engine', 'output', 'build', 'logs'], icon: 'lucide:cpu', group: 'layout' },
  { id: 'toggle-chat', label: 'Toggle agent chat', hint: 'Show or hide the AI agent panel', keywords: ['chat', 'agent', 'ai', 'assistant'], icon: 'lucide:message-square', shortcut: '⌘I', group: 'layout' },
  { id: 'collapse-editor', label: 'Collapse editor', hint: 'Minimize editor to icon rail', keywords: ['collapse', 'minimize', 'hide', 'editor'], icon: 'lucide:panel-left-close', shortcut: '⌘E', group: 'layout' },

  // Layout presets
  { id: 'layout-focus', label: 'Layout: Focus', hint: 'Editor only — no panels, pure code', keywords: ['focus', 'zen', 'clean', 'minimal', 'distraction'], icon: 'lucide:maximize-2', group: 'preset' },
  { id: 'layout-review', label: 'Layout: Review', hint: 'Files + editor + chat for code review', keywords: ['review', 'browse', 'explore', 'full'], icon: 'lucide:columns-3', group: 'preset' },
  { id: 'layout-build', label: 'Layout: Build', hint: 'Editor + terminal + engine for build/debug', keywords: ['build', 'debug', 'run', 'terminal', 'compile'], icon: 'lucide:hammer', group: 'preset' },

  // Navigation
  { id: 'view-editor', label: 'Go to Editor', hint: 'Switch to the editor view', keywords: ['editor', 'code', 'edit'], icon: 'lucide:code-2', group: 'navigate' },
  { id: 'view-git', label: 'Go to Source Control', hint: 'Switch to the git view', keywords: ['git', 'source', 'control', 'diff'], icon: 'lucide:git-branch', group: 'navigate' },
  { id: 'view-prs', label: 'Go to Pull Requests', hint: 'Switch to the PR view', keywords: ['pr', 'pull', 'request', 'review'], icon: 'lucide:git-pull-request', group: 'navigate' },
  { id: 'view-settings', label: 'Go to Settings', hint: 'Open settings panel', keywords: ['settings', 'preferences', 'config'], icon: 'lucide:settings', group: 'navigate' },
]

const GROUP_ORDER: Record<string, number> = { preset: 0, layout: 1, navigate: 2, search: 3 }
const GROUP_LABELS: Record<string, string> = { preset: 'Layout Presets', layout: 'Toggle Panels', navigate: 'Navigation', search: 'Editor' }

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

  // Group filtered commands
  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>()
    for (const cmd of filtered) {
      const list = groups.get(cmd.group) || []
      list.push(cmd)
      groups.set(cmd.group, list)
    }
    return [...groups.entries()].sort((a, b) => (GROUP_ORDER[a[0]] ?? 99) - (GROUP_ORDER[b[0]] ?? 99))
  }, [filtered])

  // Flat list for keyboard nav
  const flatList = useMemo(() => grouped.flatMap(([, items]) => items), [grouped])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selected = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | undefined
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const run = (cmd: CommandItem) => {
    onRun(cmd.id)
    onClose()
  }

  let flatIndex = 0

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
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, Math.max(flatList.length - 1, 0))) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); const cmd = flatList[selectedIndex]; if (cmd) run(cmd) }
            }}
            placeholder="Run a command..."
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-y-auto p-1.5">
          {flatList.length === 0 && (
            <div className="px-3 py-5 text-center text-[12px] text-[var(--text-tertiary)]">No matching commands</div>
          )}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">{GROUP_LABELS[group] ?? group}</span>
              </div>
              {items.map((command) => {
                const idx = flatIndex++
                const isSelected = idx === selectedIndex
                return (
                  <button
                    key={command.id}
                    data-selected={isSelected}
                    onClick={() => run(command)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-100 cursor-pointer',
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                        : 'hover:bg-[var(--bg-subtle)]',
                    )}
                  >
                    <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', isSelected ? 'bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] text-[var(--brand)]' : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]')}>
                      <Icon icon={command.icon} width={14} height={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[13px] truncate', isSelected ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]')}>{command.label}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] truncate">{command.hint}</p>
                    </div>
                    {command.shortcut && (
                      <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-disabled)] shrink-0">{command.shortcut}</kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { CommandId }
