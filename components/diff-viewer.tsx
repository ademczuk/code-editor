'use client'

import { useMemo } from 'react'
import { Icon } from '@iconify/react'

interface DiffViewerProps {
  filePath: string
  original: string
  modified: string
  onApply: () => void
  onReject: () => void
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldLine?: number
  newLine?: number
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = modified.split('\n')
  const lines: DiffLine[] = []

  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1]![j - 1]! + 1
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }

  // Backtrack
  let i = m, j = n
  const result: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'unchanged', content: oldLines[i - 1]!, oldLine: i, newLine: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.push({ type: 'added', content: newLines[j - 1]!, newLine: j })
      j--
    } else {
      result.push({ type: 'removed', content: oldLines[i - 1]!, oldLine: i })
      i--
    }
  }

  return result.reverse()
}

export function DiffViewer({ filePath, original, modified, onApply, onReject }: DiffViewerProps) {
  const diff = useMemo(() => computeDiff(original, modified), [original, modified])
  const additions = diff.filter(l => l.type === 'added').length
  const deletions = diff.filter(l => l.type === 'removed').length

  return (
    <div className="flex flex-col h-full border-t border-[var(--border)] bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon icon="lucide:git-compare" width={14} height={14} className="text-[var(--brand)]" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
            Agent proposed changes
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">
            {filePath}
          </span>
          <span className="text-[10px] text-[var(--color-additions)] font-mono">+{additions}</span>
          <span className="text-[10px] text-[var(--color-deletions)] font-mono">-{deletions}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={12} height={12} />
            Reject
          </button>
          <button
            onClick={onApply}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-additions) 15%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-additions) 30%, transparent)',
              color: 'var(--color-additions)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            <Icon icon="lucide:check" width={12} height={12} />
            Apply
          </button>
        </div>
      </div>

      {/* Diff lines */}
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-[20px]">
        {diff.map((line, i) => (
          <div
            key={i}
            className={`flex ${
              line.type === 'added'
                ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)]'
                : line.type === 'removed'
                  ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]'
                  : ''
            }`}
          >
            {/* Old line number */}
            <span className="w-10 shrink-0 text-right pr-2 select-none text-[var(--text-tertiary)]" style={{ opacity: line.type === 'added' ? 0.3 : 1 }}>
              {line.oldLine ?? ''}
            </span>
            {/* New line number */}
            <span className="w-10 shrink-0 text-right pr-2 select-none text-[var(--text-tertiary)]" style={{ opacity: line.type === 'removed' ? 0.3 : 1 }}>
              {line.newLine ?? ''}
            </span>
            {/* Indicator */}
            <span className={`w-5 shrink-0 text-center select-none ${
              line.type === 'added' ? 'text-[var(--color-additions)]' : line.type === 'removed' ? 'text-[var(--color-deletions)]' : 'text-[var(--text-tertiary)]'
            }`}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            {/* Content */}
            <span className={`flex-1 whitespace-pre px-1 ${
              line.type === 'added' ? 'text-[var(--color-additions)]' : line.type === 'removed' ? 'text-[var(--color-deletions)]' : 'text-[var(--text-primary)]'
            }`}>
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
