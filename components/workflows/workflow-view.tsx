'use client'

import { Icon } from '@iconify/react'
import { useWorkflow } from '@/context/workflow-context'
import { WorkflowList } from './workflow-list'
import { WorkflowCanvas } from './workflow-canvas'
import { TraceViewer } from './trace-viewer'
import { AnalyticsDashboard } from './analytics-dashboard'

export function WorkflowView() {
  const { viewMode, setViewMode, activeWorkflow, activeTrace, setActiveWorkflow, setActiveTrace } = useWorkflow()

  const tabs: { id: typeof viewMode; label: string; icon: string }[] = [
    { id: 'workflows', label: 'Workflows', icon: 'lucide:workflow' },
    { id: 'traces', label: 'Traces', icon: 'lucide:list-tree' },
    { id: 'analytics', label: 'Analytics', icon: 'lucide:bar-chart-3' },
  ]

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      {/* Sub-navigation */}
      <div className="flex items-center h-9 px-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 gap-1">
        {/* Back button when viewing a specific workflow/trace */}
        {(activeWorkflow || activeTrace) && (
          <button
            onClick={() => { setActiveWorkflow(null); setActiveTrace(null) }}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer mr-1"
          >
            <Icon icon="lucide:arrow-left" width={14} height={14} />
          </button>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setViewMode(t.id); setActiveWorkflow(null); setActiveTrace(null) }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                viewMode === t.id
                  ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                  : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon icon={t.icon} width={12} height={12} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Breadcrumb */}
        {activeWorkflow && (
          <span className="text-[10px] text-[var(--text-disabled)] font-mono truncate">
            {activeWorkflow.name}
          </span>
        )}
        {activeTrace && (
          <span className="text-[10px] text-[var(--text-disabled)] font-mono truncate">
            {activeTrace.workflowName} → {activeTrace.id.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'workflows' && (
          activeWorkflow ? <WorkflowCanvas /> : <WorkflowList />
        )}
        {viewMode === 'traces' && (
          activeTrace ? <TraceViewer /> : <TraceList />
        )}
        {viewMode === 'analytics' && <AnalyticsDashboard />}
      </div>
    </div>
  )
}

/* ── Trace List ──────────────────────────────────────────────── */
function TraceList() {
  const { traces, setActiveTrace, setViewMode } = useWorkflow()

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return { icon: 'lucide:check-circle', color: 'text-[var(--success)]' }
      case 'failed': return { icon: 'lucide:x-circle', color: 'text-[var(--error)]' }
      case 'running': return { icon: 'lucide:loader-2', color: 'text-[var(--brand)]' }
      default: return { icon: 'lucide:circle', color: 'text-[var(--text-disabled)]' }
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = Date.now()
    const diff = now - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Execution Traces</h2>
          <span className="text-[10px] text-[var(--text-disabled)]">{traces.length} traces</span>
        </div>

        <div className="space-y-1">
          {traces.map(trace => {
            const si = statusIcon(trace.status)
            return (
              <button
                key={trace.id}
                onClick={() => setActiveTrace(trace.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-elevated)] transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon icon={si.icon} width={14} height={14} className={`${si.color} ${trace.status === 'running' ? 'animate-spin' : ''}`} />
                  <span className="text-[12px] font-medium text-[var(--text-primary)] flex-1">{trace.workflowName}</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">{formatTime(trace.startedAt)}</span>
                </div>
                <div className="flex items-center gap-3 ml-[22px]">
                  {trace.trigger && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">{trace.trigger}</span>
                  )}
                  {trace.duration && (
                    <span className="text-[10px] text-[var(--text-disabled)] font-mono">{formatDuration(trace.duration)}</span>
                  )}
                  <span className="text-[10px] text-[var(--text-disabled)] font-mono">
                    {((trace.totalTokens.input + trace.totalTokens.output) / 1000).toFixed(1)}k tok
                  </span>
                  {trace.totalCost > 0 && (
                    <span className="text-[10px] text-[var(--text-disabled)] font-mono">${trace.totalCost.toFixed(3)}</span>
                  )}
                  <span className="text-[10px] text-[var(--text-disabled)]">{trace.steps.length} steps</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
