/**
 * Workflow Execution Engine
 *
 * Executes workflow DAGs by sending agent calls through the OpenClaw gateway.
 * Each node type maps to a gateway RPC call:
 *   - trigger: fires immediately or waits for event
 *   - agent:   sends chat.send with the node's prompt, streams response
 *   - tool:    sends a tool call (exec, read, web_search, etc.)
 *   - condition: evaluates output from previous node via agent
 *   - transform: processes data with a JS expression
 *   - output:  terminal node, records final output
 *   - human:   pauses execution, waits for user approval
 *   - loop:    repeats connected subgraph
 */

import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  TraceRun,
  TraceStep,
  NodeStatus,
  RunStatus,
} from '@/context/workflow-context'

type SendRequestFn = (method: string, params?: Record<string, unknown>) => Promise<unknown>
type OnEventFn = (event: string, cb: (payload: unknown) => void) => () => void

export interface ExecutionCallbacks {
  onNodeStatusChange: (nodeId: string, status: NodeStatus, data?: Partial<TraceStep>) => void
  onWorkflowStatusChange: (status: RunStatus) => void
  onTraceStep: (step: TraceStep) => void
  onLog: (message: string) => void
}

interface NodeResult {
  output: unknown
  tokens?: { input: number; output: number }
  cost?: number
  duration?: number
  model?: string
  toolCalls?: { name: string; args: unknown; result: unknown }[]
}

const WORKFLOW_SESSION_PREFIX = 'knot-code:workflow'

export class WorkflowExecutionEngine {
  private sendRequest: SendRequestFn
  private onEvent: OnEventFn
  private callbacks: ExecutionCallbacks
  private abortController: AbortController | null = null
  private nodeOutputs: Map<string, unknown> = new Map()
  private humanApprovalResolvers: Map<string, (approved: boolean) => void> = new Map()

  constructor(sendRequest: SendRequestFn, onEvent: OnEventFn, callbacks: ExecutionCallbacks) {
    this.sendRequest = sendRequest
    this.onEvent = onEvent
    this.callbacks = callbacks
  }

  async execute(workflow: Workflow): Promise<TraceRun> {
    this.abortController = new AbortController()
    this.nodeOutputs.clear()

    const traceRun: TraceRun = {
      id: `tr-${crypto.randomUUID().slice(0, 8)}`,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      startedAt: Date.now(),
      steps: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
    }

    this.callbacks.onWorkflowStatusChange('running')
    this.callbacks.onLog(`▶ Starting workflow: ${workflow.name}`)

    // Find entry nodes (nodes with no incoming edges)
    const incomingSet = new Set(workflow.edges.map(e => e.to))
    const entryNodes = workflow.nodes.filter(n => !incomingSet.has(n.id))

    if (entryNodes.length === 0) {
      this.callbacks.onLog('⚠ No entry nodes found')
      traceRun.status = 'failed'
      traceRun.endedAt = Date.now()
      this.callbacks.onWorkflowStatusChange('failed')
      return traceRun
    }

    try {
      const executed = new Set<string>()
      const queue = [...entryNodes]
      let staleGuard = 0
      const maxIter = workflow.nodes.length * 2 + 10

      while (queue.length > 0 && staleGuard++ < maxIter) {
        if (this.abortController.signal.aborted) {
          traceRun.status = 'cancelled'
          break
        }

        const node = queue.shift()!
        if (executed.has(node.id)) continue

        // Check all dependencies are met
        const deps = workflow.edges.filter(e => e.to === node.id).map(e => e.from)
        if (deps.some(d => !executed.has(d))) {
          queue.push(node) // re-queue
          continue
        }

        executed.add(node.id)

        // Collect inputs from parent nodes
        const inputs = deps.map(d => this.nodeOutputs.get(d))
        const parentInput = inputs.length === 1 ? inputs[0] : inputs.length > 0 ? inputs : undefined

        const step = await this.executeNode(node, workflow, parentInput)
        traceRun.steps.push(step)

        if (step.tokens) {
          traceRun.totalTokens.input += step.tokens.input
          traceRun.totalTokens.output += step.tokens.output
        }
        if (step.cost) traceRun.totalCost += step.cost

        if (step.status === 'error') {
          traceRun.status = 'failed'
          traceRun.endedAt = Date.now()
          traceRun.duration = traceRun.endedAt - traceRun.startedAt
          this.callbacks.onWorkflowStatusChange('failed')
          this.callbacks.onLog(`✗ Workflow failed at: ${node.label}`)
          return traceRun
        }

        // Determine next nodes
        const outEdges = workflow.edges.filter(e => e.from === node.id)

        if (node.kind === 'condition') {
          const condResult = String(step.output ?? '').toLowerCase().trim()
          const matchingEdge = outEdges.find(e =>
            e.label?.toLowerCase() === condResult ||
            e.condition?.toLowerCase() === condResult
          ) || outEdges.find(e => {
            const isTruthy = condResult === 'true' || condResult === 'yes'
            const lbl = e.label?.toLowerCase()
            return isTruthy ? (lbl === 'yes' || lbl === 'true') : (lbl === 'no' || lbl === 'false')
          }) || outEdges[0]

          if (matchingEdge) {
            const next = workflow.nodes.find(n => n.id === matchingEdge.to)
            if (next) queue.push(next)
          }
          for (const edge of outEdges) {
            if (edge !== matchingEdge) {
              const skipped = workflow.nodes.find(n => n.id === edge.to)
              if (skipped && !executed.has(skipped.id)) {
                this.callbacks.onNodeStatusChange(skipped.id, 'skipped')
                executed.add(skipped.id) // prevent re-processing
              }
            }
          }
        } else {
          for (const edge of outEdges) {
            const next = workflow.nodes.find(n => n.id === edge.to)
            if (next && !executed.has(next.id)) queue.push(next)
          }
        }
      }

      if (traceRun.status === 'running') {
        traceRun.status = 'completed'
        this.callbacks.onLog(`✓ Workflow completed: ${workflow.name}`)
      }
    } catch (err) {
      traceRun.status = 'failed'
      this.callbacks.onLog(`✗ Workflow error: ${err instanceof Error ? err.message : String(err)}`)
    }

    traceRun.endedAt = Date.now()
    traceRun.duration = traceRun.endedAt - traceRun.startedAt
    this.callbacks.onWorkflowStatusChange(traceRun.status)
    return traceRun
  }

  private async executeNode(node: WorkflowNode, workflow: Workflow, parentInput: unknown): Promise<TraceStep> {
    const startedAt = Date.now()
    this.callbacks.onNodeStatusChange(node.id, 'running')
    this.callbacks.onLog(`  → ${node.label}`)

    const step: TraceStep = {
      id: `s-${crypto.randomUUID().slice(0, 8)}`,
      nodeId: node.id,
      nodeName: node.label,
      nodeKind: node.kind,
      status: 'running',
      startedAt,
    }

    try {
      let result: NodeResult
      switch (node.kind) {
        case 'trigger': result = await this.executeTrigger(node, parentInput); break
        case 'agent': result = await this.executeAgent(node, workflow.id, parentInput); break
        case 'tool': result = await this.executeTool(node, parentInput); break
        case 'condition': result = await this.executeCondition(node, workflow.id, parentInput); break
        case 'transform': result = await this.executeTransform(node, parentInput); break
        case 'human': result = await this.executeHuman(node); break
        case 'output':
        case 'loop':
        default:
          result = { output: parentInput, duration: Date.now() - startedAt }
      }

      this.nodeOutputs.set(node.id, result.output)
      step.status = 'success'
      step.endedAt = Date.now()
      step.duration = step.endedAt - startedAt
      step.output = result.output
      step.tokens = result.tokens
      step.cost = result.cost
      step.model = result.model
      step.toolCalls = result.toolCalls
      this.callbacks.onNodeStatusChange(node.id, 'success', step)
      this.callbacks.onTraceStep(step)
    } catch (err) {
      step.status = 'error'
      step.endedAt = Date.now()
      step.duration = step.endedAt - startedAt
      step.error = err instanceof Error ? err.message : String(err)
      this.callbacks.onNodeStatusChange(node.id, 'error', step)
      this.callbacks.onTraceStep(step)
    }

    return step
  }

  // ── Node executors ──────────────────────────────────────

  private async executeTrigger(node: WorkflowNode, input: unknown): Promise<NodeResult> {
    return { output: { event: (node.config.event as string) || 'manual', input, triggeredAt: Date.now() }, duration: 0 }
  }

  private async executeAgent(node: WorkflowNode, workflowId: string, input: unknown): Promise<NodeResult> {
    const model = (node.config.model as string) || undefined
    const systemPrompt = (node.config.systemPrompt as string) || ''
    const prompt = (node.config.prompt as string) || node.label

    let message = prompt
    if (input) {
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
      message = `${systemPrompt ? systemPrompt + '\n\n' : ''}Context from previous step:\n\`\`\`json\n${inputStr.slice(0, 4000)}\n\`\`\`\n\n${prompt}`
    } else if (systemPrompt) {
      message = `${systemPrompt}\n\n${prompt}`
    }

    const sessionKey = `${WORKFLOW_SESSION_PREFIX}:${workflowId}:${node.id}`
    const idemKey = `wf-${Date.now()}-${node.id}`

    return new Promise<NodeResult>((resolve, reject) => {
      let responseText = ''
      const tokens = { input: 0, output: 0 }
      const startTime = Date.now()

      const unsub = this.onEvent('chat', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        if ((p.idempotencyKey as string) !== idemKey) return
        const state = p.state as string

        if (state === 'delta') {
          const msg = p.message as Record<string, unknown> | undefined
          if (msg) {
            const content = msg.content
            if (typeof content === 'string') responseText = content
            else if (Array.isArray(content)) {
              responseText = (content as Array<Record<string, unknown>>).filter(b => b.type === 'text' || b.type === 'output_text').map(b => (b.text as string) || '').join('')
            }
          }
        } else if (state === 'final') {
          unsub()
          const msg = p.message as Record<string, unknown> | undefined
          if (msg) {
            const content = msg.content
            if (typeof content === 'string') responseText = content
            else if (Array.isArray(content)) {
              responseText = (content as Array<Record<string, unknown>>).filter(b => b.type === 'text' || b.type === 'output_text').map(b => (b.text as string) || '').join('')
            }
            const usage = msg.usage as Record<string, unknown> | undefined
            if (usage) {
              tokens.input = Number(usage.input_tokens ?? usage.inputTokens ?? 0)
              tokens.output = Number(usage.output_tokens ?? usage.outputTokens ?? 0)
            }
          }
          const totalTok = tokens.input + tokens.output
          let cost = totalTok * 0.00001
          if (model?.includes('opus')) cost = totalTok * 0.000075
          else if (model?.includes('sonnet')) cost = totalTok * 0.000015
          else if (model?.includes('haiku')) cost = totalTok * 0.000004

          resolve({ output: responseText, tokens, cost, model: model || 'default', duration: Date.now() - startTime })
        } else if (state === 'error') {
          unsub()
          reject(new Error((p.errorMessage as string) || 'Agent call failed'))
        }
      })

      this.sendRequest('chat.send', {
        sessionKey, message, idempotencyKey: idemKey,
        ...(model ? { model } : {}),
      }).catch(err => { unsub(); reject(err) })
    })
  }

  private async executeTool(node: WorkflowNode, input: unknown): Promise<NodeResult> {
    const tool = (node.config.tool as string) || 'exec'
    const command = (node.config.command as string) || ''
    const args = (node.config.args as Record<string, unknown>) || {}
    const sessionKey = `${WORKFLOW_SESSION_PREFIX}:tool:${node.id}`
    const idemKey = `wf-tool-${Date.now()}-${node.id}`
    const inputStr = input ? (typeof input === 'string' ? input : JSON.stringify(input)) : ''

    const toolPrompt = command
      ? `Execute this command and return the result: \`${command}\`${inputStr ? `\n\nContext: ${inputStr.slice(0, 2000)}` : ''}`
      : `Use the ${tool} tool${Object.keys(args).length ? ` with: ${JSON.stringify(args)}` : ''}${inputStr ? `\n\nInput: ${inputStr.slice(0, 2000)}` : ''}`

    return new Promise<NodeResult>((resolve, reject) => {
      let responseText = ''
      const startTime = Date.now()
      const toolCalls: { name: string; args: unknown; result: unknown }[] = []

      const unsub = this.onEvent('chat', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        if ((p.idempotencyKey as string) !== idemKey) return
        const state = p.state as string

        if (state === 'tool_use' || state === 'tool_start') {
          toolCalls.push({ name: (p.toolName as string) || tool, args: p.input || args, result: null })
        } else if (state === 'final') {
          unsub()
          const msg = p.message as Record<string, unknown> | undefined
          if (msg) {
            const content = msg.content
            if (typeof content === 'string') responseText = content
            else if (Array.isArray(content)) {
              responseText = (content as Array<Record<string, unknown>>).filter(b => b.type === 'text' || b.type === 'output_text').map(b => (b.text as string) || '').join('')
            }
          }
          if (toolCalls.length > 0) toolCalls[toolCalls.length - 1].result = responseText.slice(0, 500)
          resolve({ output: responseText, duration: Date.now() - startTime, toolCalls })
        } else if (state === 'delta') {
          const msg = p.message as Record<string, unknown> | undefined
          if (msg) { const c = msg.content; if (typeof c === 'string') responseText = c }
        } else if (state === 'error') {
          unsub(); reject(new Error((p.errorMessage as string) || 'Tool execution failed'))
        }
      })

      this.sendRequest('chat.send', { sessionKey, message: toolPrompt, idempotencyKey: idemKey }).catch(err => { unsub(); reject(err) })
    })
  }

  private async executeCondition(node: WorkflowNode, workflowId: string, input: unknown): Promise<NodeResult> {
    const condition = (node.config.condition as string) || ''
    const inputStr = input ? (typeof input === 'string' ? input : JSON.stringify(input, null, 2)) : 'no input'
    const sessionKey = `${WORKFLOW_SESSION_PREFIX}:${workflowId}:cond:${node.id}`
    const idemKey = `wf-cond-${Date.now()}-${node.id}`

    const prompt = condition
      ? `Given:\n\`\`\`\n${inputStr.slice(0, 3080)}\n\`\`\`\nEvaluate: "${condition}"\nRespond ONLY "true" or "false".`
      : `Given:\n\`\`\`\n${inputStr.slice(0, 3080)}\n\`\`\`\n${node.label}\nRespond ONLY "yes" or "no".`

    return new Promise<NodeResult>((resolve, reject) => {
      let responseText = ''
      const startTime = Date.now()

      const unsub = this.onEvent('chat', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        if ((p.idempotencyKey as string) !== idemKey) return
        if ((p.state as string) === 'final') {
          unsub()
          const msg = p.message as Record<string, unknown> | undefined
          if (msg) {
            const content = msg.content
            if (typeof content === 'string') responseText = content
            else if (Array.isArray(content)) responseText = (content as Array<Record<string, unknown>>).filter(b => b.type === 'text').map(b => (b.text as string) || '').join('')
          }
          const trimmed = responseText.trim().toLowerCase()
          const result = trimmed.includes('true') || trimmed.includes('yes') ? 'yes' : 'no'
          resolve({ output: result, duration: Date.now() - startTime, model: 'haiku' })
        } else if ((p.state as string) === 'error') {
          unsub(); reject(new Error((p.errorMessage as string) || 'Condition eval failed'))
        }
      })

      this.sendRequest('chat.send', {
        sessionKey, message: prompt, idempotencyKey: idemKey,
        model: 'anthropic/claude-haiku-3.5',
      }).catch(err => { unsub(); reject(err) })
    })
  }

  private async executeTransform(node: WorkflowNode, input: unknown): Promise<NodeResult> {
    const expression = (node.config.expression as string) || 'input'
    const startTime = Date.now()
    try {
      const fn = new Function('input', `return ${expression}`)
      return { output: fn(input), duration: Date.now() - startTime }
    } catch {
      return { output: input, duration: Date.now() - startTime }
    }
  }

  private async executeHuman(node: WorkflowNode): Promise<NodeResult> {
    this.callbacks.onNodeStatusChange(node.id, 'waiting')
    this.callbacks.onLog(`  ⏸ Waiting for approval: ${node.label}`)
    return new Promise<NodeResult>((resolve, reject) => {
      this.humanApprovalResolvers.set(node.id, (approved) => {
        if (approved) resolve({ output: { approved: true }, duration: 0 })
        else reject(new Error('Human rejected'))
      })
    })
  }

  approveHumanNode(nodeId: string) {
    const r = this.humanApprovalResolvers.get(nodeId)
    if (r) { this.humanApprovalResolvers.delete(nodeId); r(true) }
  }

  rejectHumanNode(nodeId: string) {
    const r = this.humanApprovalResolvers.get(nodeId)
    if (r) { this.humanApprovalResolvers.delete(nodeId); r(false) }
  }

  abort() {
    this.abortController?.abort()
    for (const [, r] of this.humanApprovalResolvers) r(false)
    this.humanApprovalResolvers.clear()
  }
}
