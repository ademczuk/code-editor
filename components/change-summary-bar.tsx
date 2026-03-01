'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

interface Summary {
  fileCount: number
  additions: number
  deletions: number
  streaming: number
  pending: number
  accepted: number
}

interface Props {
  onReview: () => void
}

export function ChangeSummaryBar({ onReview }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent).detail as Summary
      setSummary(s)
      if (s.fileCount > 0) {
        // Slide in with slight delay for animation
        requestAnimationFrame(() => setVisible(true))
      } else {
        setVisible(false)
      }
    }
    window.addEventListener('change-summary-update', handler)
    return () => window.removeEventListener('change-summary-update', handler)
  }, [])

  if (!summary || summary.fileCount === 0) return null

  const isStreaming = summary.streaming > 0
  const allDone = summary.pending === 0 && summary.accepted > 0

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--brand)]" />
            </span>
            <span className="text-[10px] text-[var(--brand)] font-medium animate-pulse">Writing...</span>
          </div>
        )}

        {/* File count */}
        <div className="flex items-center gap-1.5">
          <Icon icon="lucide:files" width={12} height={12} className="text-[var(--text-tertiary)]" />
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
            {summary.fileCount} file{summary.fileCount !== 1 ? 's' : ''} changed
          </span>
        </div>

        {/* Additions/Deletions */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-medium text-[var(--color-additions)]">
            +{summary.additions.toLocaleString()}
          </span>
          {summary.deletions > 0 && (
            <span className="text-[11px] font-mono font-medium text-[var(--color-deletions)]">
              -{summary.deletions.toLocaleString()}
            </span>
          )}
        </div>

        {/* Progress dots */}
        {summary.fileCount > 1 && (
          <div className="flex items-center gap-0.5 ml-1">
            {Array.from({ length: Math.min(summary.fileCount, 8) }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
                  i < summary.accepted
                    ? 'bg-[var(--color-additions)]'
                    : i < summary.accepted + summary.pending
                    ? 'bg-[var(--warning,#eab308)]'
                    : 'bg-[var(--text-disabled)]'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {allDone ? (
          <div className="flex items-center gap-1.5 text-[var(--color-additions)]">
            <Icon icon="lucide:check-circle" width={13} height={13} />
            <span className="text-[10px] font-medium">All changes accepted</span>
          </div>
        ) : (
          <>
            <button
              onClick={onReview}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
            >
              <Icon icon="lucide:eye" width={11} height={11} />
              Review
            </button>
          </>
        )}
      </div>
    </div>
  )
}
