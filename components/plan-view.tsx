'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

export interface PlanStep {
  id: string
  title: string
  description?: string
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
  files?: string[]
  substeps?: Array<{ label: string; done: boolean }>
}

interface Props {
  steps: PlanStep[]
  onApprove?: () => void
  onSkip?: () => void
  onStepToggle?: (stepId: string) => void
  interactive?: boolean
  title?: string
}

export function PlanView({
  steps,
  onApprove,
  onSkip,
  onStepToggle,
  interactive = false,
  title,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Use per-row keys so duplicate step ids from upstream content cannot collide.
    setExpanded(new Set(steps.map((step, idx) => `${step.id}::${idx}`)))
  }, [steps])

  const doneCount = steps.filter((s) => s.status === 'done').length
  const totalCount = steps.length
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0
  const allDone = doneCount === totalCount
  const hasRunning = steps.some((s) => s.status === 'running')

  const statusIcon = (status: PlanStep['status']) => {
    switch (status) {
      case 'done':
        return 'lucide:check-circle'
      case 'running':
        return 'lucide:loader'
      case 'error':
        return 'lucide:alert-circle'
      case 'skipped':
        return 'lucide:minus-circle'
      default:
        return 'lucide:circle'
    }
  }

  const statusColor = (status: PlanStep['status']) => {
    switch (status) {
      case 'done':
        return 'text-[var(--color-additions)]'
      case 'running':
        return 'text-[var(--brand)] animate-spin'
      case 'error':
        return 'text-[var(--color-deletions)]'
      case 'skipped':
        return 'text-[var(--text-disabled)]'
      default:
        return 'text-[var(--text-disabled)]'
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden my-2 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:list-checks" width={13} height={13} className="text-[var(--brand)]" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">
            {title ?? 'Plan'}
          </span>
          <span className="text-[9px] text-[var(--text-disabled)]">
            {doneCount}/{totalCount} steps
          </span>
        </div>
        {hasRunning && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--brand)]" />
            </span>
            <span className="text-[9px] text-[var(--brand)] font-medium">Running</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-[var(--bg-subtle)]">
        <div
          className="h-full bg-[var(--brand)] transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="divide-y divide-[var(--border)]">
        {steps.map((step, idx) => {
          const stepKey = `${step.id}::${idx}`
          const isExpanded = expanded.has(stepKey)
          return (
            <div
              key={stepKey}
              className={`transition-colors duration-300 ${
                step.status === 'running'
                  ? 'bg-[color-mix(in_srgb,var(--brand)_4%,transparent)]'
                  : ''
              }`}
            >
              {/* Step header */}
              <button
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    next.has(stepKey) ? next.delete(stepKey) : next.add(stepKey)
                    onStepToggle?.(step.id)
                    return next
                  })
                }
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <span className="text-[10px] text-[var(--text-disabled)] font-mono w-4 shrink-0">
                  {idx + 1}
                </span>
                <Icon
                  icon={statusIcon(step.status)}
                  width={13}
                  height={13}
                  className={statusColor(step.status)}
                />
                <span
                  className={`text-[11px] flex-1 ${
                    step.status === 'done'
                      ? 'text-[var(--text-tertiary)]'
                      : 'text-[var(--text-primary)] font-medium'
                  }`}
                >
                  {step.title}
                </span>
                {step.files && step.files.length > 0 && (
                  <span className="text-[8px] text-[var(--text-disabled)] font-mono">
                    {step.files.length} files
                  </span>
                )}
                <Icon
                  icon={isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                  width={10}
                  height={10}
                  className="text-[var(--text-disabled)] shrink-0"
                />
              </button>

              {/* Step detail */}
              {isExpanded && (step.description || step.files || step.substeps) && (
                <div className="px-4 pb-3 pl-[52px]">
                  {step.description && (
                    <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed mb-1.5">
                      {step.description}
                    </p>
                  )}
                  {step.files && step.files.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {step.files.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)]"
                        >
                          <Icon icon="lucide:file-code-2" width={8} height={8} />
                          {f.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  )}
                  {step.substeps && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {step.substeps.map((ss, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Icon
                            icon={ss.done ? 'lucide:check-square' : 'lucide:square'}
                            width={10}
                            height={10}
                            className={
                              ss.done
                                ? 'text-[var(--color-additions)]'
                                : 'text-[var(--text-disabled)]'
                            }
                          />
                          <span
                            className={`text-[9px] ${ss.done ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-secondary)]'}`}
                          >
                            {ss.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Action bar — only shown for interactive plans */}
      {interactive && !allDone && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
          <button
            onClick={onSkip}
            className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            Skip All
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
          >
            <Icon icon="lucide:play" width={11} height={11} />
            Continue
          </button>
        </div>
      )}

      {/* Success state */}
      {allDone && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[color-mix(in_srgb,var(--color-additions)_6%,transparent)] border-t border-[var(--border)]">
          <Icon
            icon="lucide:check-circle-2"
            width={13}
            height={13}
            className="text-[var(--color-additions)]"
          />
          <span className="text-[10px] font-medium text-[var(--color-additions)]">
            All steps completed
          </span>
        </div>
      )}
    </div>
  )
}
