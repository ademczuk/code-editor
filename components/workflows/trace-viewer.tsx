'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useWorkflow, type TraceStep } from '@/context/workflow-context'
import { nodeKindIcon } from './workflow-list'

export function TraceViewer() {
  const { activeTrace } = useWorkflow()
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  if (!activeTrace) return null

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const statusColor = (s: string) => {
    switch (s) {
      case 'success': return 'text-[var(--success)]'
      case 'error': return 'text-[var(--error)]'
      case 'running': return 'text-[var(--brand)]'
      default: return 'text-[var(--text-disabled)]'
    }
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case 'success': return 'lucide:check-circle'
      case 'error': return 'lucide:x-circle'
      case 'running': return 'lucide:loader-2'
      default: return 'lucide:circle'
    }
  }

  // Calculate waterfall widths
  const traceStart = activeTrace.startedAt
  const traceEnd = activeTrace.endedAt ?? Date.now()
  const totalDuration = traceEnd - traceStart

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Icon icon={statusIcon(activeTrace.status)} width={16} height={16} className={statusColor(activeTrace.status)} />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{activeTrace.workflowName}</span>
          {activeTrace.trigger && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-[var(--bg-subtle)] text-[var(--text-tertiary)] border border-[var(--border)]">
              {activeTrace.trigger}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-5">
          {activeTrace.duration != null && (
            <Stat label="Duration" value={formatDuration(activeTrace.duration)} />
          )}
          <Stat label="Steps" value={String(activeTrace.steps.length)} />
          <Stat label="Tokens" value={`${((activeTrace.totalTokens.input + activeTrace.totalTokens.output) / 1000).toFixed(1)}k`} />
          <Stat label="Input" value={`${(activeTrace.totalTokens.input / 1000).toFixed(1)}k`} />
          <Stat label="Output" value={`${(activeTrace.totalTokens.output / 1000).toFixed(1)}k`} />
          {activeTrace.totalCost > 0 && (
            <Stat label="Cost" value={`$${activeTrace.totalCost.toFixed(3)}`} />
          )}
        </div>
      </div>

      {/* Waterfall + Step list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          {/* Waterfall header */}
          <div className="flex items-center mb-2 text-[9px] text-[var(--text-disabled)] uppercase tracking-wider font-medium">
            <span className="w-[200px] shrink-0">Step</span>
            <span className="flex-1">Timeline</span>
            <span className="w-[80px] text-right shrink-0">Duration</span>
          </div>

          {/* Steps */}
          <div className="space-y-1">
            {activeTrace.steps.map(step => {
              const isExpanded = expandedStep === step.id
              const stepStart = step.startedAt - traceStart
              const stepDuration = step.duration ?? 0
              const leftPct = totalDuration > 0 ? (stepStart / totalDuration) * 100 : 0
              const widthPct = totalDuration > 0 ? Math.max((stepDuration / totalDuration) * 100, 1) : 1

              return (
                <div key={step.id}>
                  <button
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                    className="w-full flex items-center py-2 px-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
                  >
                    {/* Step info */}
                    <div className="w-[200px] shrink-0 flex items-center gap-2">
                      <Icon icon={statusIcon(step.status)} width={12} height={12} className={`${statusColor(step.status)} ${step.status === 'running' ? 'animate-spin' : ''}`} />
                      <div className="w-5 h-5 rounded flex items-center justify-center bg-[var(--bg-subtle)]">
                        <Icon icon={nodeKindIcon(step.nodeKind)} width={10} height={10} className="text-[var(--text-tertiary)]" />
                      </div>
                      <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{step.nodeName}</span>
                    </div>

                    {/* Waterfall bar */}
                    <div className="flex-1 h-5 relative mx-2">
                      <div className="absolute inset-0 rounded bg-[var(--bg-subtle)]" />
                      <div
                        className={`absolute top-0 bottom-0 rounded ${
                          step.status === 'success' ? 'bg-[color-mix(in_srgb,var(--success)_25%,transparent)]' :
                          step.status === 'error' ? 'bg-[color-mix(in_srgb,var(--error)_25%,transparent)]' :
                          step.status === 'running' ? 'bg-[color-mix(in_srgb,var(--brand)_25%,transparent)]' :
                          'bg-[var(--bg-tertiary)]'
                        }`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      >
                        {step.status === 'running' && (
                          <div className="absolute inset-0 rounded bg-[var(--brand)] opacity-20 animate-pulse" />
                        )}
                      </div>
                    </div>

                    {/* Duration */}
                    <span className="w-[80px] text-right text-[10px] font-mono text-[var(--text-disabled)] shrink-0">
                      {step.duration ? formatDuration(step.duration) : '—'}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="ml-[208px] mr-[88px] mb-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] space-y-2 animate-in slide-in-from-top-1">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <Detail label="Kind" value={step.nodeKind} />
                        <Detail label="Started" value={formatTime(step.startedAt)} />
                        {step.model && <Detail label="Model" value={step.model} />}
                        {step.cost != null && <Detail label="Cost" value={`$${step.cost.toFixed(4)}`} />}
                        {step.tokens && (
                          <>
                            <Detail label="Input tokens" value={String(step.tokens.input)} />
                            <Detail label="Output tokens" value={String(step.tokens.output)} />
                          </>
                        )}
                      </div>

                      {step.error && (
                        <div className="p-2 rounded bg-[color-mix(in_srgb,var(--error)_6%,transparent)] border border-[color-mix(in_srgb,var(--error)_20%,transparent)]">
                          <span className="text-[var(--error)] font-mono">{step.error}</span>
                        </div>
                      )}

                      {step.toolCalls && step.toolCalls.length > 0 && (
                        <div>
                          <span className="text-[9px] uppercase tracking-wider font-medium text-[var(--text-disabled)] block mb-1">Tool Calls</span>
                          {step.toolCalls.map((tc, i) => (
                            <div key={i} className="p-2 rounded bg-[var(--bg)] border border-[var(--border)] font-mono mb-1">
                              <span className="text-[var(--brand)]">{tc.name}</span>
                              <span className="text-[var(--text-disabled)]"> → </span>
                              <span className="text-[var(--text-tertiary)]">{JSON.stringify(tc.result).slice(0, 80)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {step.output != null && !step.error && !step.toolCalls?.length && (
                        <div>
                          <span className="text-[9px] uppercase tracking-wider font-medium text-[var(--text-disabled)] block mb-1">Output</span>
                          <pre className="p-2 rounded bg-[var(--bg)] border border-[var(--border)] font-mono text-[var(--text-secondary)] overflow-x-auto">
                            {JSON.stringify(step.output, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-disabled)] block">{label}</span>
      <span className="text-[12px] font-mono font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-disabled)]">{label}</span>
      <span className="text-[var(--text-secondary)] font-mono">{value}</span>
    </div>
  )
}
