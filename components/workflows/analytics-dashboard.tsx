'use client'

import { Icon } from '@iconify/react'
import { useWorkflow } from '@/context/workflow-context'

export function AnalyticsDashboard() {
  const { analytics } = useWorkflow()

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  // Simple spark bar chart (CSS-only)
  const maxRuns = Math.max(...analytics.runsByDay.map(d => d.runs), 1)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon="lucide:play" label="Total Runs" value={String(analytics.totalRuns)} change={`${analytics.runsToday} today`} />
          <KpiCard icon="lucide:check-circle" label="Success Rate" value={`${analytics.successRate.toFixed(1)}%`} good={analytics.successRate > 90} />
          <KpiCard icon="lucide:coins" label="Total Cost" value={`$${analytics.totalCost.toFixed(2)}`} change={`$${analytics.costToday.toFixed(2)} today`} />
          <KpiCard icon="lucide:zap" label="Avg Duration" value={formatDuration(analytics.avgDuration)} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Runs per day */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon icon="lucide:bar-chart-3" width={14} height={14} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">Runs per Day</span>
            </div>
            <div className="flex items-end gap-1.5 h-[100px]">
              {analytics.runsByDay.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-stretch gap-0.5" style={{ height: 80 }}>
                    {/* Failed portion */}
                    <div className="w-full rounded-t" style={{
                      height: `${(day.failed / maxRuns) * 80}px`,
                      background: 'var(--error)',
                      opacity: 0.6,
                    }} />
                    {/* Success portion */}
                    <div className="w-full rounded-t" style={{
                      height: `${(day.success / maxRuns) * 80}px`,
                      background: 'var(--brand)',
                      opacity: 0.7,
                    }} />
                  </div>
                  <span className="text-[8px] text-[var(--text-disabled)]">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[9px] text-[var(--text-disabled)]">
                <span className="w-2 h-2 rounded-sm bg-[var(--brand)] opacity-70" /> Success
              </span>
              <span className="flex items-center gap-1 text-[9px] text-[var(--text-disabled)]">
                <span className="w-2 h-2 rounded-sm bg-[var(--error)] opacity-60" /> Failed
              </span>
            </div>
          </div>

          {/* Cost by model */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon icon="lucide:cpu" width={14} height={14} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">Cost by Model</span>
            </div>
            <div className="space-y-3">
              {analytics.tokensByModel.map(m => {
                const totalCost = analytics.tokensByModel.reduce((a, b) => a + b.cost, 0)
                const pct = totalCost > 0 ? (m.cost / totalCost) * 100 : 0
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-[var(--text-secondary)]">{m.model.split('-').slice(-2).join('-')}</span>
                      <span className="text-[10px] font-mono text-[var(--text-disabled)]">${m.cost.toFixed(2)} · {(m.tokens / 1000).toFixed(0)}k tok</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--brand)] transition-all duration-500"
                        style={{ width: `${pct}%`, opacity: 0.5 + pct / 200 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top workflows */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon icon="lucide:trophy" width={14} height={14} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">Top Workflows</span>
            </div>
            <div className="space-y-2">
              {analytics.topWorkflows.map((wf, i) => (
                <div key={wf.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors">
                  <span className="w-4 text-center text-[10px] font-bold text-[var(--text-disabled)]">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-[var(--text-primary)] block truncate">{wf.name}</span>
                    <span className="text-[9px] text-[var(--text-disabled)]">{wf.runs} runs · {formatDuration(wf.avgDuration)} avg</span>
                  </div>
                  <span className={`text-[10px] font-mono font-medium ${wf.successRate > 90 ? 'text-[var(--success)]' : wf.successRate > 70 ? 'text-[var(--warning)]' : 'text-[var(--error)]'}`}>
                    {wf.successRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent errors */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon icon="lucide:alert-triangle" width={14} height={14} className="text-[var(--error)]" />
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">Recent Errors</span>
            </div>
            {analytics.recentErrors.length > 0 ? (
              <div className="space-y-2">
                {analytics.recentErrors.map((err, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--error)_4%,var(--bg))] border border-[color-mix(in_srgb,var(--error)_15%,var(--border))]">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-medium text-[var(--text-primary)]">{err.workflowName}</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">
                        {Math.floor((Date.now() - err.timestamp) / 86400000)}d ago
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--error)]">{err.error}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-[11px] text-[var(--text-disabled)]">No recent errors 🎉</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, change, good }: { icon: string; label: string; value: string; change?: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon icon={icon} width={12} height={12} className="text-[var(--text-disabled)]" />
        <span className="text-[9px] uppercase tracking-wider font-medium text-[var(--text-disabled)]">{label}</span>
      </div>
      <div className="text-[18px] font-bold text-[var(--text-primary)] font-mono leading-none mb-1">{value}</div>
      {change && (
        <span className="text-[9px] text-[var(--text-tertiary)]">{change}</span>
      )}
      {good !== undefined && (
        <span className={`text-[9px] ${good ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
          {good ? '↑ healthy' : '↓ needs attention'}
        </span>
      )}
    </div>
  )
}
