'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useWorkflow, type Workflow, type RunStatus } from '@/context/workflow-context'

const STATUS_MAP: Record<RunStatus, { icon: string; color: string; label: string }> = {
  idle: { icon: 'lucide:circle', color: 'text-[var(--text-disabled)]', label: 'Idle' },
  running: { icon: 'lucide:loader-2', color: 'text-[var(--brand)]', label: 'Running' },
  completed: { icon: 'lucide:check-circle', color: 'text-[var(--success)]', label: 'Completed' },
  failed: { icon: 'lucide:x-circle', color: 'text-[var(--error)]', label: 'Failed' },
  cancelled: { icon: 'lucide:ban', color: 'text-[var(--warning)]', label: 'Cancelled' },
}

export function WorkflowList() {
  const { workflows, setActiveWorkflow, createWorkflow, deleteWorkflow, runWorkflow, setViewMode } = useWorkflow()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) return
    const wf = createWorkflow(newName.trim())
    setNewName('')
    setShowCreate(false)
    setActiveWorkflow(wf.id)
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Workflows</h2>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Build and monitor agent workflows</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Icon icon="lucide:plus" width={12} height={12} />
            New Workflow
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-4 p-3 rounded-lg border border-[var(--border-focus)] bg-[var(--bg-elevated)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
                placeholder="Workflow name…"
                autoFocus
                className="flex-1 px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)]"
              />
              <button onClick={handleCreate} disabled={!newName.trim()} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 disabled:opacity-40 cursor-pointer">
                Create
              </button>
              <button onClick={() => setShowCreate(false)} className="px-2 py-1.5 rounded-md text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Workflow cards */}
        <div className="grid gap-3">
          {workflows.map(wf => {
            const st = STATUS_MAP[wf.status]
            return (
              <div
                key={wf.id}
                onClick={() => setActiveWorkflow(wf.id)}
                className="group p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:workflow" width={16} height={16} className="text-[var(--brand)]" />
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{wf.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${st.color} bg-[color-mix(in_srgb,currentColor_8%,transparent)]`}>
                      <Icon icon={st.icon} width={10} height={10} className={wf.status === 'running' ? 'animate-spin' : ''} />
                      {st.label}
                    </span>
                  </div>
                </div>

                {wf.description && (
                  <p className="text-[11px] text-[var(--text-tertiary)] mb-3 ml-[24px]">{wf.description}</p>
                )}

                {/* Node preview strip */}
                <div className="flex items-center gap-1.5 ml-[24px] mb-3">
                  {wf.nodes.slice(0, 6).map((node, i) => (
                    <span key={node.id} className="flex items-center">
                      {i > 0 && <span className="w-3 h-px bg-[var(--border)] mr-1.5" />}
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] ${
                        node.status === 'success' ? 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]' :
                        node.status === 'running' ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]' :
                        node.status === 'error' ? 'bg-[color-mix(in_srgb,var(--error)_12%,transparent)] text-[var(--error)]' :
                        'bg-[var(--bg-subtle)] text-[var(--text-disabled)]'
                      }`} title={node.label}>
                        <Icon icon={nodeKindIcon(node.kind)} width={10} height={10} />
                      </span>
                    </span>
                  ))}
                  {wf.nodes.length > 6 && (
                    <span className="text-[9px] text-[var(--text-disabled)]">+{wf.nodes.length - 6}</span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 ml-[24px]">
                  <span className="text-[10px] text-[var(--text-disabled)]">{wf.runCount} runs</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">{wf.nodes.length} nodes</span>
                  {wf.lastRunDuration && (
                    <span className="text-[10px] text-[var(--text-disabled)] font-mono">{formatDuration(wf.lastRunDuration)}</span>
                  )}
                </div>

                {/* Hover actions */}
                <div className="hidden group-hover:flex items-center gap-1 absolute top-3 right-3">
                  <button
                    onClick={e => { e.stopPropagation(); runWorkflow(wf.id) }}
                    className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--success)] cursor-pointer"
                    title="Run"
                  >
                    <Icon icon="lucide:play" width={12} height={12} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id) }}
                    className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--error)] cursor-pointer"
                    title="Delete"
                  >
                    <Icon icon="lucide:trash-2" width={12} height={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function nodeKindIcon(kind: string): string {
  switch (kind) {
    case 'trigger': return 'lucide:zap'
    case 'agent': return 'lucide:bot'
    case 'tool': return 'lucide:wrench'
    case 'condition': return 'lucide:git-branch'
    case 'transform': return 'lucide:shuffle'
    case 'output': return 'lucide:flag'
    case 'human': return 'lucide:user'
    case 'loop': return 'lucide:repeat'
    default: return 'lucide:circle'
  }
}
