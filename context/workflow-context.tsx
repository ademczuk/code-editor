'use client'

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { useGateway } from '@/context/gateway-context'
import { WorkflowExecutionEngine } from '@/lib/workflow-engine'

// ── Workflow Types ───────────────────────────────────────────

export type NodeKind = 'trigger' | 'agent' | 'tool' | 'condition' | 'transform' | 'output' | 'human' | 'loop'
export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped' | 'waiting'
export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface WorkflowNode {
  id: string
  kind: NodeKind
  label: string
  description?: string
  status: NodeStatus
  x: number
  y: number
  config: Record<string, unknown>
  duration?: number
  tokens?: { input: number; output: number }
  error?: string
  output?: unknown
}

export interface WorkflowEdge {
  id: string
  from: string
  to: string
  label?: string
  condition?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  status: RunStatus
  createdAt: number
  updatedAt: number
  runCount: number
  lastRunAt?: number
  lastRunDuration?: number
}

// ── Trace / Execution Types ─────────────────────────────────

export interface TraceStep {
  id: string
  nodeId: string
  nodeName: string
  nodeKind: NodeKind
  status: NodeStatus
  startedAt: number
  endedAt?: number
  duration?: number
  input?: unknown
  output?: unknown
  error?: string
  tokens?: { input: number; output: number }
  model?: string
  cost?: number
  toolCalls?: { name: string; args: unknown; result: unknown }[]
}

export interface TraceRun {
  id: string
  workflowId: string
  workflowName: string
  status: RunStatus
  startedAt: number
  endedAt?: number
  duration?: number
  steps: TraceStep[]
  totalTokens: { input: number; output: number }
  totalCost: number
  trigger?: string
}

// ── Analytics Types ─────────────────────────────────────────

export interface AnalyticsSnapshot {
  totalRuns: number
  successRate: number
  avgDuration: number
  totalTokens: number
  totalCost: number
  runsToday: number
  tokensToday: number
  costToday: number
  runsByDay: { date: string; runs: number; success: number; failed: number }[]
  tokensByModel: { model: string; tokens: number; cost: number }[]
  topWorkflows: { id: string; name: string; runs: number; successRate: number; avgDuration: number }[]
  recentErrors: { workflowName: string; error: string; timestamp: number }[]
}

// ── Context ─────────────────────────────────────────────────

interface WorkflowContextValue {
  workflows: Workflow[]
  activeWorkflow: Workflow | null
  setActiveWorkflow: (id: string | null) => void
  createWorkflow: (name: string, description?: string) => Workflow
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  addNode: (workflowId: string, node: Omit<WorkflowNode, 'id' | 'status'>) => void
  removeNode: (workflowId: string, nodeId: string) => void
  addEdge: (workflowId: string, edge: Omit<WorkflowEdge, 'id'>) => void
  removeEdge: (workflowId: string, edgeId: string) => void

  // Traces
  traces: TraceRun[]
  activeTrace: TraceRun | null
  setActiveTrace: (id: string | null) => void

  // Analytics
  analytics: AnalyticsSnapshot

  // Execution
  runWorkflow: (id: string) => void
  stopWorkflow: (id: string) => void

  // Execution
  runWorkflow: (id: string) => void
  stopWorkflow: (id: string) => void
  approveHumanNode: (nodeId: string) => void
  rejectHumanNode: (nodeId: string) => void
  executionLog: string[]

  // Node inspector
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  updateNodeConfig: (workflowId: string, nodeId: string, config: Record<string, unknown>) => void
  updateNodePosition: (workflowId: string, nodeId: string, x: number, y: number) => void

  // View state
  viewMode: 'workflows' | 'traces' | 'analytics'
  setViewMode: (mode: 'workflows' | 'traces' | 'analytics') => void
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

// ── Demo data generator ─────────────────────────────────────

function generateDemoData() {
  const now = Date.now()
  const DAY = 86400000

  const workflows: Workflow[] = [
    {
      id: 'wf-1',
      name: 'PR Review Pipeline',
      description: 'Automated code review with AI agent',
      status: 'completed',
      createdAt: now - 7 * DAY,
      updatedAt: now - 2000,
      runCount: 47,
      lastRunAt: now - 2000,
      lastRunDuration: 34200,
      nodes: [
        { id: 'n1', kind: 'trigger', label: 'PR Opened', x: 80, y: 200, status: 'success', config: { event: 'pull_request.opened' } },
        { id: 'n2', kind: 'tool', label: 'Fetch Diff', x: 280, y: 200, status: 'success', config: { tool: 'gh' }, duration: 1200 },
        { id: 'n3', kind: 'agent', label: 'Code Review', x: 480, y: 140, status: 'success', config: { model: 'claude-opus-4-6' }, duration: 18000, tokens: { input: 4200, output: 1800 } },
        { id: 'n4', kind: 'condition', label: 'Has Issues?', x: 680, y: 200, status: 'success', config: {} },
        { id: 'n5', kind: 'tool', label: 'Post Comment', x: 880, y: 140, status: 'success', config: { tool: 'gh' }, duration: 800 },
        { id: 'n6', kind: 'agent', label: 'Fix Suggestions', x: 480, y: 300, status: 'idle', config: { model: 'claude-sonnet-4-5' }, tokens: { input: 2100, output: 3400 } },
        { id: 'n7', kind: 'output', label: 'Done', x: 1080, y: 200, status: 'success', config: {} },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'yes' },
        { id: 'e5', from: 'n4', to: 'n7', label: 'no' },
        { id: 'e6', from: 'n5', to: 'n6' },
        { id: 'e7', from: 'n6', to: 'n7' },
      ],
    },
    {
      id: 'wf-2',
      name: 'Issue Triage',
      description: 'Classify and route incoming issues',
      status: 'idle',
      createdAt: now - 5 * DAY,
      updatedAt: now - 1 * DAY,
      runCount: 23,
      lastRunAt: now - 1 * DAY,
      lastRunDuration: 8400,
      nodes: [
        { id: 'n1', kind: 'trigger', label: 'Issue Created', x: 80, y: 180, status: 'idle', config: {} },
        { id: 'n2', kind: 'agent', label: 'Classify', x: 300, y: 180, status: 'idle', config: { model: 'claude-haiku-3.5' }, tokens: { input: 800, output: 200 } },
        { id: 'n3', kind: 'condition', label: 'Priority?', x: 520, y: 180, status: 'idle', config: {} },
        { id: 'n4', kind: 'tool', label: 'Label: urgent', x: 740, y: 100, status: 'idle', config: {} },
        { id: 'n5', kind: 'tool', label: 'Label: normal', x: 740, y: 260, status: 'idle', config: {} },
        { id: 'n6', kind: 'output', label: 'Done', x: 940, y: 180, status: 'idle', config: {} },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'high' },
        { id: 'e4', from: 'n3', to: 'n5', label: 'normal' },
        { id: 'e5', from: 'n4', to: 'n6' },
        { id: 'e6', from: 'n5', to: 'n6' },
      ],
    },
    {
      id: 'wf-3',
      name: 'Deploy Pipeline',
      description: 'Build, test, and deploy to production',
      status: 'running',
      createdAt: now - 3 * DAY,
      updatedAt: now - 60000,
      runCount: 12,
      lastRunAt: now - 60000,
      nodes: [
        { id: 'n1', kind: 'trigger', label: 'Push to main', x: 80, y: 180, status: 'success', config: {} },
        { id: 'n2', kind: 'tool', label: 'Run Tests', x: 280, y: 180, status: 'success', config: {}, duration: 45000 },
        { id: 'n3', kind: 'tool', label: 'Build', x: 480, y: 180, status: 'running', config: {}, duration: 0 },
        { id: 'n4', kind: 'human', label: 'Approve?', x: 680, y: 180, status: 'waiting', config: {} },
        { id: 'n5', kind: 'tool', label: 'Deploy', x: 880, y: 180, status: 'idle', config: {} },
        { id: 'n6', kind: 'output', label: 'Live ✓', x: 1060, y: 180, status: 'idle', config: {} },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' },
        { id: 'e3', from: 'n3', to: 'n4' },
        { id: 'e4', from: 'n4', to: 'n5' },
        { id: 'e5', from: 'n5', to: 'n6' },
      ],
    },
  ]

  const traces: TraceRun[] = [
    {
      id: 'tr-1', workflowId: 'wf-1', workflowName: 'PR Review Pipeline',
      status: 'completed', startedAt: now - 120000, endedAt: now - 85800, duration: 34200,
      totalTokens: { input: 6300, output: 5200 }, totalCost: 0.034, trigger: 'PR #142',
      steps: [
        { id: 's1', nodeId: 'n1', nodeName: 'PR Opened', nodeKind: 'trigger', status: 'success', startedAt: now - 120000, endedAt: now - 119800, duration: 200 },
        { id: 's2', nodeId: 'n2', nodeName: 'Fetch Diff', nodeKind: 'tool', status: 'success', startedAt: now - 119800, endedAt: now - 118600, duration: 1200, toolCalls: [{ name: 'gh pr diff', args: { pr: 142 }, result: '+34 -12 lines' }] },
        { id: 's3', nodeId: 'n3', nodeName: 'Code Review', nodeKind: 'agent', status: 'success', startedAt: now - 118600, endedAt: now - 100600, duration: 18000, tokens: { input: 4200, output: 1800 }, model: 'claude-opus-4-6', cost: 0.028 },
        { id: 's4', nodeId: 'n4', nodeName: 'Has Issues?', nodeKind: 'condition', status: 'success', startedAt: now - 100600, endedAt: now - 100500, duration: 100, output: true },
        { id: 's5', nodeId: 'n5', nodeName: 'Post Comment', nodeKind: 'tool', status: 'success', startedAt: now - 100500, endedAt: now - 99700, duration: 800, toolCalls: [{ name: 'gh pr comment', args: { pr: 142 }, result: 'Comment posted' }] },
        { id: 's6', nodeId: 'n7', nodeName: 'Done', nodeKind: 'output', status: 'success', startedAt: now - 99700, endedAt: now - 85800, duration: 100 },
      ],
    },
    {
      id: 'tr-2', workflowId: 'wf-2', workflowName: 'Issue Triage',
      status: 'completed', startedAt: now - DAY, endedAt: now - DAY + 8400, duration: 8400,
      totalTokens: { input: 800, output: 200 }, totalCost: 0.001, trigger: 'Issue #89',
      steps: [
        { id: 's1', nodeId: 'n1', nodeName: 'Issue Created', nodeKind: 'trigger', status: 'success', startedAt: now - DAY, endedAt: now - DAY + 100, duration: 100 },
        { id: 's2', nodeId: 'n2', nodeName: 'Classify', nodeKind: 'agent', status: 'success', startedAt: now - DAY + 100, endedAt: now - DAY + 5100, duration: 5000, tokens: { input: 800, output: 200 }, model: 'claude-haiku-3.5', cost: 0.001 },
        { id: 's3', nodeId: 'n3', nodeName: 'Priority?', nodeKind: 'condition', status: 'success', startedAt: now - DAY + 5100, endedAt: now - DAY + 5200, duration: 100, output: 'normal' },
        { id: 's4', nodeId: 'n5', nodeName: 'Label: normal', nodeKind: 'tool', status: 'success', startedAt: now - DAY + 5200, endedAt: now - DAY + 8300, duration: 3100 },
        { id: 's5', nodeId: 'n6', nodeName: 'Done', nodeKind: 'output', status: 'success', startedAt: now - DAY + 8300, endedAt: now - DAY + 8400, duration: 100 },
      ],
    },
    {
      id: 'tr-3', workflowId: 'wf-1', workflowName: 'PR Review Pipeline',
      status: 'failed', startedAt: now - 3 * DAY, endedAt: now - 3 * DAY + 15000, duration: 15000,
      totalTokens: { input: 3200, output: 0 }, totalCost: 0.012, trigger: 'PR #138',
      steps: [
        { id: 's1', nodeId: 'n1', nodeName: 'PR Opened', nodeKind: 'trigger', status: 'success', startedAt: now - 3 * DAY, endedAt: now - 3 * DAY + 200, duration: 200 },
        { id: 's2', nodeId: 'n2', nodeName: 'Fetch Diff', nodeKind: 'tool', status: 'success', startedAt: now - 3 * DAY + 200, endedAt: now - 3 * DAY + 1400, duration: 1200 },
        { id: 's3', nodeId: 'n3', nodeName: 'Code Review', nodeKind: 'agent', status: 'error', startedAt: now - 3 * DAY + 1400, endedAt: now - 3 * DAY + 15000, duration: 13600, tokens: { input: 3200, output: 0 }, error: 'Context window exceeded (128k tokens)', model: 'claude-opus-4-6', cost: 0.012 },
      ],
    },
  ]

  const analytics: AnalyticsSnapshot = {
    totalRuns: 82, successRate: 91.5, avgDuration: 22400,
    totalTokens: 284000, totalCost: 1.87,
    runsToday: 5, tokensToday: 18200, costToday: 0.12,
    runsByDay: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * DAY)
      const runs = Math.floor(Math.random() * 15) + 3
      return { date: d.toISOString().slice(0, 10), runs, success: Math.floor(runs * 0.9), failed: runs - Math.floor(runs * 0.9) }
    }),
    tokensByModel: [
      { model: 'claude-opus-4-6', tokens: 156000, cost: 1.24 },
      { model: 'claude-sonnet-4-5', tokens: 89000, cost: 0.48 },
      { model: 'claude-haiku-3.5', tokens: 39000, cost: 0.15 },
    ],
    topWorkflows: [
      { id: 'wf-1', name: 'PR Review Pipeline', runs: 47, successRate: 93.6, avgDuration: 34200 },
      { id: 'wf-2', name: 'Issue Triage', runs: 23, successRate: 95.7, avgDuration: 8400 },
      { id: 'wf-3', name: 'Deploy Pipeline', runs: 12, successRate: 75.0, avgDuration: 62000 },
    ],
    recentErrors: [
      { workflowName: 'PR Review Pipeline', error: 'Context window exceeded', timestamp: now - 3 * DAY },
      { workflowName: 'Deploy Pipeline', error: 'Build timeout after 120s', timestamp: now - 5 * DAY },
    ],
  }

  return { workflows, traces, analytics }
}

// ── Provider ────────────────────────────────────────────────

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { sendRequest, onEvent, status: gwStatus } = useGateway()
  const [viewMode, setViewMode] = useState<'workflows' | 'traces' | 'analytics'>('workflows')
  const [executionLog, setExecutionLog] = useState<string[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const engineRef = useRef<WorkflowExecutionEngine | null>(null)
  const demo = useMemo(() => generateDemoData(), [])
  const [workflows, setWorkflows] = useState<Workflow[]>(demo.workflows)
  const [traces, setTraces] = useState<TraceRun[]>(demo.traces)
  const [analytics] = useState<AnalyticsSnapshot>(demo.analytics)
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null)
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null)

  const activeWorkflow = useMemo(() => workflows.find(w => w.id === activeWorkflowId) ?? null, [workflows, activeWorkflowId])
  const activeTrace = useMemo(() => traces.find(t => t.id === activeTraceId) ?? null, [traces, activeTraceId])

  const setActiveWorkflow = useCallback((id: string | null) => setActiveWorkflowId(id), [])
  const setActiveTrace = useCallback((id: string | null) => setActiveTraceId(id), [])

  const createWorkflow = useCallback((name: string, description?: string) => {
    const wf: Workflow = {
      id: `wf-${crypto.randomUUID().slice(0, 8)}`, name, description,
      nodes: [], edges: [], status: 'idle',
      createdAt: Date.now(), updatedAt: Date.now(), runCount: 0,
    }
    setWorkflows(prev => [...prev, wf])
    return wf
  }, [])

  const updateWorkflow = useCallback((id: string, updates: Partial<Workflow>) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w))
  }, [])

  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id))
    if (activeWorkflowId === id) setActiveWorkflowId(null)
  }, [activeWorkflowId])

  const addNode = useCallback((workflowId: string, node: Omit<WorkflowNode, 'id' | 'status'>) => {
    const newNode: WorkflowNode = { ...node, id: `n-${crypto.randomUUID().slice(0, 8)}`, status: 'idle' }
    updateWorkflow(workflowId, {
      nodes: [...(workflows.find(w => w.id === workflowId)?.nodes ?? []), newNode],
    })
  }, [workflows, updateWorkflow])

  const removeNode = useCallback((workflowId: string, nodeId: string) => {
    const wf = workflows.find(w => w.id === workflowId)
    if (!wf) return
    updateWorkflow(workflowId, {
      nodes: wf.nodes.filter(n => n.id !== nodeId),
      edges: wf.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    })
  }, [workflows, updateWorkflow])

  const addEdge = useCallback((workflowId: string, edge: Omit<WorkflowEdge, 'id'>) => {
    const newEdge: WorkflowEdge = { ...edge, id: `e-${crypto.randomUUID().slice(0, 8)}` }
    updateWorkflow(workflowId, {
      edges: [...(workflows.find(w => w.id === workflowId)?.edges ?? []), newEdge],
    })
  }, [workflows, updateWorkflow])

  const removeEdge = useCallback((workflowId: string, edgeId: string) => {
    const wf = workflows.find(w => w.id === workflowId)
    if (!wf) return
    updateWorkflow(workflowId, { edges: wf.edges.filter(e => e.id !== edgeId) })
  }, [workflows, updateWorkflow])

  const updateNodeConfig = useCallback((workflowId: string, nodeId: string, config: Record<string, unknown>) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id !== workflowId) return w
      return { ...w, nodes: w.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n), updatedAt: Date.now() }
    }))
  }, [])

  const updateNodePosition = useCallback((workflowId: string, nodeId: string, x: number, y: number) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id !== workflowId) return w
      return { ...w, nodes: w.nodes.map(n => n.id === nodeId ? { ...n, x, y } : n) }
    }))
  }, [])

  const runWorkflow = useCallback((id: string) => {
    const wf = workflows.find(w => w.id === id)
    if (!wf || gwStatus !== 'connected') {
      if (gwStatus !== 'connected') setExecutionLog(prev => [...prev, '⚠ Gateway not connected — connect first'])
      return
    }

    // Reset all node statuses
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: 'running' as RunStatus, nodes: w.nodes.map(n => ({ ...n, status: 'idle' as NodeStatus })) } : w))
    setExecutionLog([])

    const engine = new WorkflowExecutionEngine(sendRequest, onEvent, {
      onNodeStatusChange: (nodeId, status, data) => {
        setWorkflows(prev => prev.map(w => {
          if (w.id !== id) return w
          return { ...w, nodes: w.nodes.map(n => n.id === nodeId ? { ...n, status, duration: data?.duration, tokens: data?.tokens } : n) }
        }))
      },
      onWorkflowStatusChange: (status) => {
        setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status, lastRunAt: Date.now(), runCount: w.runCount + (status === 'completed' || status === 'failed' ? 1 : 0) } : w))
      },
      onTraceStep: (step) => {
        // Will be collected in the trace run
      },
      onLog: (msg) => {
        setExecutionLog(prev => [...prev.slice(-50), msg])
      },
    })

    engineRef.current = engine

    // Execute and store the trace
    engine.execute(wf).then(trace => {
      setTraces(prev => [trace, ...prev])
      engineRef.current = null
    })
  }, [workflows, gwStatus, sendRequest, onEvent])

  const stopWorkflow = useCallback((id: string) => {
    engineRef.current?.abort()
    engineRef.current = null
    updateWorkflow(id, { status: 'cancelled' as RunStatus })
    setExecutionLog(prev => [...prev, '⏹ Workflow stopped'])
  }, [updateWorkflow])

  const approveHumanNode = useCallback((nodeId: string) => {
    engineRef.current?.approveHumanNode(nodeId)
  }, [])

  const rejectHumanNode = useCallback((nodeId: string) => {
    engineRef.current?.rejectHumanNode(nodeId)
  }, [])

  const value = useMemo<WorkflowContextValue>(() => ({
    workflows, activeWorkflow, setActiveWorkflow,
    createWorkflow, updateWorkflow, deleteWorkflow,
    addNode, removeNode, addEdge, removeEdge,
    traces, activeTrace, setActiveTrace,
    analytics,
    runWorkflow, stopWorkflow,
    approveHumanNode, rejectHumanNode,
    executionLog,
    selectedNodeId, setSelectedNodeId,
    updateNodeConfig, updateNodePosition,
    viewMode, setViewMode,
  }), [
    workflows, activeWorkflow, setActiveWorkflow,
    createWorkflow, updateWorkflow, deleteWorkflow,
    addNode, removeNode, addEdge, removeEdge,
    traces, activeTrace, setActiveTrace,
    analytics, runWorkflow, stopWorkflow,
    approveHumanNode, rejectHumanNode,
    executionLog,
    selectedNodeId, setSelectedNodeId,
    updateNodeConfig, updateNodePosition,
    viewMode, setViewMode,
  ])

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider')
  return ctx
}
