'use client'

export type MarkdownViewMode = 'edit' | 'preview' | 'split'

interface MarkdownModeToggleProps {
  mode: MarkdownViewMode
  onModeChange: (mode: MarkdownViewMode) => void
}

const MODES: Array<{ id: MarkdownViewMode; label: string }> = [
  { id: 'edit', label: 'Editor' },
  { id: 'preview', label: 'Preview' },
  { id: 'split', label: 'Split' },
]

export function MarkdownModeToggle({ mode, onModeChange }: MarkdownModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)]" role="tablist" aria-label="Markdown view mode">
      {MODES.map(m => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          onClick={() => onModeChange(m.id)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
            mode === m.id
              ? 'bg-[var(--bg)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
