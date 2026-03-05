import { computeDiff } from '@/lib/diff'

export interface CommitMessageChange {
  path: string
  status: string
  summary?: string
  patch?: string
}

interface GenerateCommitMessageParams {
  sendRequest: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  onEvent: (event: string, cb: (payload: unknown) => void) => () => void
  sessionKey: string
  repoFullName?: string
  branch?: string
  changes: CommitMessageChange[]
}

const MAX_FILES = 12
const MAX_PATCH_PER_FILE = 1400
const MAX_PATCH_TOTAL = 8000

function extractText(message: unknown): string {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  const content = msg.content as string | Array<Record<string, unknown>> | undefined
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text' || b.type === 'output_text')
      .map((b) => (b.text as string) || '')
      .join('')
  }
  if (typeof msg.text === 'string') return msg.text
  if (typeof msg.output_text === 'string') return msg.output_text
  return ''
}

function extractEventText(payload: Record<string, unknown>): string {
  const fromMessage = extractText(payload.message)
  if (fromMessage) return fromMessage
  if (typeof payload.reply === 'string') return payload.reply
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.content === 'string') return payload.content
  if (typeof payload.delta === 'string') return payload.delta
  return ''
}

function normalizeCommitMessage(raw: string): string {
  const direct = raw.match(
    /\b(feat|fix|refactor|docs|chore|test|style|build|ci|perf|revert)(\([^)]+\))?:\s+([^\n`"]+)/i,
  )
  if (direct?.[0]) {
    return direct[0].trim().slice(0, 72).trim()
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('```'))
    .map((line) =>
      line
        .replace(/^[-*]\s*/, '')
        .replace(/^(commit message|message|subject)\s*:\s*/i, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim(),
    )
    .filter(Boolean)

  const firstUseful =
    lines.find((line) => !/^(here('| i)?s|suggested|proposed|generated|next step)\b/i.test(line)) ??
    lines[0] ??
    ''

  return firstUseful.replace(/\s+/g, ' ').slice(0, 72).trim()
}

function buildPrompt(params: {
  repoFullName?: string
  branch?: string
  changes: CommitMessageChange[]
}): string {
  const lines: string[] = [
    'Generate a git commit subject line for these changes.',
    '',
    'Rules:',
    '- Return exactly one line.',
    '- No markdown, no backticks, no quotes, no explanations.',
    '- Prefer Conventional Commits (feat/fix/refactor/docs/chore/test/style/build/ci/perf).',
    '- Use imperative mood and keep it under 72 characters.',
    '',
  ]

  if (params.repoFullName) {
    lines.push(`Repository: ${params.repoFullName}`)
  }
  if (params.branch) {
    lines.push(`Branch: ${params.branch}`)
  }
  lines.push('')
  lines.push('Changed files:')

  for (const change of params.changes.slice(0, MAX_FILES)) {
    const summary = change.summary ? ` - ${change.summary}` : ''
    lines.push(`- [${change.status}] ${change.path}${summary}`)
  }

  let remaining = MAX_PATCH_TOTAL
  const withPatch = params.changes.filter((change) => Boolean(change.patch))
  if (withPatch.length > 0) {
    lines.push('')
    lines.push('Diff snippets:')
  }

  for (const change of withPatch.slice(0, MAX_FILES)) {
    if (remaining <= 0) break
    const patch = change.patch?.trim()
    if (!patch) continue
    const clipped = patch.slice(0, Math.min(MAX_PATCH_PER_FILE, remaining))
    if (!clipped) continue
    remaining -= clipped.length
    lines.push('')
    lines.push(`[${change.path}]`)
    lines.push('```diff')
    lines.push(clipped)
    lines.push('```')
  }

  return lines.join('\n')
}

export function buildEditorPatchSnippet(
  original: string,
  updated: string,
  maxChangedLines = 80,
): string | undefined {
  const diffLines = computeDiff(original, updated).filter(
    (line) => line.type === 'added' || line.type === 'removed',
  )
  if (diffLines.length === 0) return undefined
  const clipped = diffLines.slice(0, maxChangedLines)
  const body = clipped
    .map((line) => `${line.type === 'added' ? '+' : '-'}${line.content}`)
    .join('\n')
  if (diffLines.length > clipped.length) {
    return `${body}\n... (${diffLines.length - clipped.length} more changed lines)`
  }
  return body
}

export async function generateCommitMessageWithGateway({
  sendRequest,
  onEvent,
  sessionKey,
  repoFullName,
  branch,
  changes,
}: GenerateCommitMessageParams): Promise<string> {
  if (changes.length === 0) {
    throw new Error('No changes available to summarize.')
  }

  const idempotencyKey = `ce-commit-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const prompt = buildPrompt({ repoFullName, branch, changes })

  const rawReply = await new Promise<string>((resolve, reject) => {
    let settled = false
    let streamBuffer = ''

    const resolveOnce = (value: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }

    const rejectOnce = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      reject(error)
    }

    const unsubscribe = onEvent('chat', (payload: unknown) => {
      const evt = payload as Record<string, unknown>
      const eventKey = (evt.idempotencyKey ?? evt.idempotency_key ?? evt.idemKey) as
        | string
        | undefined
      if (eventKey !== idempotencyKey) return
      const state = evt.state as string | undefined
      if (state === 'delta') {
        const delta = extractEventText(evt)
        if (!delta) return
        if (!streamBuffer) {
          streamBuffer = delta
        } else if (delta.startsWith(streamBuffer)) {
          streamBuffer = delta
        } else if (!streamBuffer.endsWith(delta)) {
          streamBuffer += delta
        }
        return
      }
      if (state === 'final') {
        const finalText = extractEventText(evt) || streamBuffer
        if (!finalText.trim()) {
          rejectOnce(new Error('Gateway returned an empty reply.'))
          return
        }
        resolveOnce(finalText)
        return
      }
      if (state === 'error') {
        const errorMsg =
          (evt.errorMessage as string) || 'Gateway failed to generate a commit message.'
        rejectOnce(new Error(errorMsg))
        return
      }
      if (state === 'aborted') {
        rejectOnce(new Error('Gateway commit message generation was aborted.'))
      }
    })

    const timer = setTimeout(() => {
      rejectOnce(new Error('Timed out waiting for commit message from gateway.'))
    }, 30000)

    sendRequest('chat.send', {
      sessionKey,
      message: prompt,
      idempotencyKey,
    })
      .then((responseRaw) => {
        const response = responseRaw as Record<string, unknown> | undefined

        const inlineReply = extractEventText(response ?? {}).trim()
        if (inlineReply) {
          resolveOnce(inlineReply)
          return
        }

        const responseState = response?.state as string | undefined
        if (responseState === 'error') {
          const msg =
            (response?.errorMessage as string) || 'Gateway failed to generate a commit message.'
          rejectOnce(new Error(msg))
        }
      })
      .catch((error) => {
        rejectOnce(error instanceof Error ? error : new Error(String(error)))
      })
  })

  const normalized = normalizeCommitMessage(rawReply)
  if (!normalized) {
    throw new Error('Gateway reply did not contain a usable commit message.')
  }
  return normalized
}
