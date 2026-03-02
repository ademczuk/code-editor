'use client'

import { useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useWorkflow, type WorkflowNode, type WorkflowEdge } from '@/context/workflow-context'
import { nodeKindIcon } from './workflow-list'

/**
 * Workflow Canvas — visual DAG editor showing nodes and edges.
 * Renders a minimap of the workflow with status indicators.
 */
export function WorkflowCanvas() {
  const { activeWorkflow, runWorkflow, stopWorkflow } = useWorkflow()
  const svgRef = useRef<SVGSVGElement>(null)

  if (!activeWorkflow) return null

  const { nodes, edges, status } = activeWorkflow

  // Calculate canvas bounds
  const padding = 60
  const maxX = Math.max(...nodes.map(n => n.x), 400) + 200
  const maxY = Math.max(...nodes.map(n => n.y), 300) + 100

  const nodeStatusColor = (s: string) => {
    switch (s) {
      case 'success': return { bg: 'var(--success)', bgMuted: 'color-mix(in srgb, var(--success) 12%, transparent)', text: 'var(--success)' }
      case 'running': return { bg: 'var(--brand)', bgMuted: 'color-mix(in srgb, var(--brand) 12%, transparent)', text: 'var(--brand)' }
      case 'error': return { bg: 'var(--error)', bgMuted: 'color-mix(in srgb, var(--error) 12%, transparent)', text: 'var(--error)' }
      case 'waiting': return { bg: 'var(--warning)', bgMuted: 'color-mix(in srgb, var(--warning) 12%, transparent)', text: 'var(--warning)' }
      default: return { bg: 'var(--text-disabled)', bgMuted: 'var(--bg-subtle)', text: 'var(--text-disabled)' }
    }
  }

  // Build edge paths (curved bezier)
  const getEdgePath = (edge: WorkflowEdge) => {
    const from = nodes.find(n => n.id === edge.from)
    const to = nodes.find(n => n.id === edge.to)
    if (!from || !to) return ''

    const x1 = from.x + 70 // right side of node
    const y1 = from.y + 20
    const x2 = to.x - 10 // left side of node
    const y2 = to.y + 20
    const cx = (x1 + x2) / 2

    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] shrink-0">
        <Icon icon="lucide:workflow" width={14} height={14} className="text-[var(--brand)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{activeWorkflow.name}</span>
        {activeWorkflow.description && (
          <span className="text-[10px] text-[var(--text-tertiary)] mx-2">— {activeWorkflow.description}</span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--text-disabled)]">{nodes.length} nodes · {edges.length} edges</span>
        <div className="flex gap-1 ml-2">
          {status === 'running' ? (
            <button onClick={() => stopWorkflow(activeWorkflow.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[color-mix(in_srgb,var(--error)_12%,transparent)] text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_20%,transparent)] cursor-pointer">
              <Icon icon="lucide:square" width={10} height={10} />
              Stop
            </button>
          ) : (
            <button onClick={() => runWorkflow(activeWorkflow.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 cursor-pointer">
              <Icon icon="lucide:play" width={10} height={10} />
              Run
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-[var(--bg)]" style={{ backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        <svg ref={svgRef} width={maxX + padding} height={maxY + padding} className="min-w-full min-h-full">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--text-disabled)" opacity="0.5" />
            </marker>
            <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--brand)" opacity="0.8" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map(edge => {
            const from = nodes.find(n => n.id === edge.from)
            const to = nodes.find(n => n.id === edge.to)
            const isActive = from?.status === 'success' || from?.status === 'running'
            const path = getEdgePath(edge)

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={isActive ? 'var(--brand)' : 'var(--border)'}
                  strokeWidth={isActive ? 2 : 1.5}
                  strokeDasharray={isActive ? 'none' : '4 3'}
                  markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                  opacity={isActive ? 0.8 : 0.4}
                />
                {/* Animated flow dot on active edges */}
                {from?.status === 'running' && (
                  <circle r="3" fill="var(--brand)">
                    <animateMotion dur="1.5s" repeatCount="indefinite" path={path} />
                  </circle>
                )}
                {/* Edge label */}
                {edge.label && from && to && (
                  <text
                    x={(from.x + 70 + to.x - 10) / 2}
                    y={(from.y + to.y) / 2 + 16}
                    textAnchor="middle"
                    className="text-[9px] fill-[var(--text-disabled)]"
                    fontFamily="var(--font-mono, monospace)"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const colors = nodeStatusColor(node.status)
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer">
                {/* Glow for running nodes */}
                {node.status === 'running' && (
                  <rect x="-4" y="-4" width="148" height="48" rx="12" fill="none" stroke={colors.bg} strokeWidth="2" opacity="0.3">
                    <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1.5s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Node body */}
                <rect width="140" height="40" rx="8" fill="var(--bg-elevated)" stroke={colors.bg} strokeWidth={node.status === 'idle' ? 1 : 2} opacity={node.status === 'skipped' ? 0.4 : 1} />

                {/* Kind icon */}
                <foreignObject x="8" y="8" width="24" height="24">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: colors.bgMuted }}>
                    <Icon icon={nodeKindIcon(node.kind)} width={12} height={12} style={{ color: colors.text }} className={node.status === 'running' ? 'animate-spin' : ''} />
                  </div>
                </foreignObject>

                {/* Label */}
                <text x="38" y="18" className="text-[10px] font-medium" fill="var(--text-primary)" fontFamily="system-ui, sans-serif">
                  {node.label.length > 14 ? node.label.slice(0, 13) + '…' : node.label}
                </text>

                {/* Duration / tokens */}
                <text x="38" y="32" className="text-[8px]" fill="var(--text-disabled)" fontFamily="var(--font-mono, monospace)">
                  {node.duration ? `${(node.duration / 1000).toFixed(1)}s` : ''}
                  {node.tokens ? ` · ${((node.tokens.input + node.tokens.output) / 1000).toFixed(1)}k` : ''}
                </text>

                {/* Status dot */}
                <circle cx="130" cy="10" r="4" fill={colors.bg} opacity={node.status === 'idle' ? 0.3 : 0.8}>
                  {node.status === 'running' && (
                    <animate attributeName="opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
                  )}
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
