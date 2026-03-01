/**
 * Dual-mode GitHub client.
 * Primary: gateway RPC (sendRequest)
 * Fallback: Next.js API routes (/api/github/*)
 */

import type { GitHubPR, GitHubIssue, GitHubComment, GitHubReviewComment, GitHubCollaborator, PRFilter, IssueFilter, TreeEntry, FileContent, Branch } from './github-types'

type SendRequest = (method: string, params?: Record<string, unknown>) => Promise<unknown>

let _sendRequest: SendRequest | null = null
let _githubToken: string = ''
let _targetRepo: string = ''
let _readOnly: boolean = true
const PR_FETCH_COOLDOWN_MS = 15_000
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000

interface GitHubClientErrorOptions {
  status?: number
  retryAfterMs?: number
}

export class GitHubClientError extends Error {
  status?: number
  retryAfterMs?: number

  constructor(message: string, options: GitHubClientErrorOptions = {}) {
    super(message)
    this.name = 'GitHubClientError'
    this.status = options.status
    this.retryAfterMs = options.retryAfterMs
  }
}

interface CachedPRResult {
  prs: GitHubPR[]
  fetchedAt: number
}

const _prCache = new Map<string, CachedPRResult>()
const _prInFlight = new Map<string, Promise<GitHubPR[]>>()

/** Register the gateway sendRequest function (called from GatewayProvider) */
export function setGatewaySender(fn: SendRequest | null) {
  _sendRequest = fn
}

export function setGithubToken(token: string) {
  _githubToken = token
}

export function setTargetRepo(repo: string) {
  _targetRepo = repo
}

export function setReadOnly(flag: boolean) {
  _readOnly = flag
}

function assertWritable() {
  if (_readOnly) {
    throw new GitHubClientError('Read-only mode is active', { status: 403 })
  }
}

export function authHeaders(): Record<string, string> {
  let token = _githubToken
  if (!token && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('code-flow:global-settings')
      if (raw) token = (JSON.parse(raw) as { githubToken?: string }).githubToken ?? ''
    } catch {}
  }
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function sorted(values: string[] | undefined): string[] {
  return [...(values ?? [])].sort()
}

function makePRQueryKey(filters: Partial<PRFilter>): string {
  return JSON.stringify({
    repos: sorted(filters.repos),
    labels: sorted(filters.labels),
    authors: sorted(filters.authors),
    status: filters.status ?? '',
    search: filters.search ?? '',
  })
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000)
  }
  const retryAtMs = Date.parse(value)
  if (Number.isNaN(retryAtMs)) return undefined
  const diff = retryAtMs - Date.now()
  return diff > 0 ? diff : undefined
}

async function parseRetryAfterFromResponse(res: Response): Promise<number | undefined> {
  const fromHeader = parseRetryAfterMs(res.headers.get('retry-after'))
  if (fromHeader) return fromHeader

  try {
    const payload = await res.clone().json() as { retryAfterSeconds?: unknown }
    const retryAfterSeconds = Number(payload.retryAfterSeconds)
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds * 1000)
    }
  } catch {}

  return undefined
}

async function fetchPRsFromSource(filters: Partial<PRFilter>): Promise<GitHubPR[]> {
  // Try gateway first
  if (_sendRequest) {
    try {
      const result = await _sendRequest('github.list-prs', {
        repos: filters.repos,
        labels: filters.labels,
        authors: filters.authors,
        status: filters.status,
        search: filters.search,
      })
      if (Array.isArray(result)) return result as GitHubPR[]
      const obj = result as Record<string, unknown>
      if (Array.isArray(obj?.prs)) return obj.prs as GitHubPR[]
    } catch {
      // Fall through to API route
    }
  }

  // Fallback: API route
  const params = new URLSearchParams()
  const repos = filters.repos?.length ? filters.repos : _targetRepo ? [_targetRepo] : []
  if (repos.length) params.set('repos', repos.join(','))
  if (filters.labels?.length) params.set('labels', filters.labels.join(','))
  if (filters.authors?.length) params.set('authors', filters.authors.join(','))
  if (filters.status) params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  if (filters.perPage) params.set('per_page', String(filters.perPage))

  const res = await fetch(`/api/github/prs?${params}`, { headers: authHeaders() })
  if (!res.ok) {
    const retryAfterMs = await parseRetryAfterFromResponse(res)
    throw new GitHubClientError(`Failed to fetch PRs: ${res.status}`, {
      status: res.status,
      retryAfterMs,
    })
  }

  const payload = await res.json()
  if (!Array.isArray(payload)) {
    throw new GitHubClientError('Invalid response while fetching PRs')
  }
  return payload as GitHubPR[]
}

// ─── Fetch PRs ──────────────────────────────────────────────────

export async function fetchPRs(filters: Partial<PRFilter>): Promise<GitHubPR[]> {
  const key = makePRQueryKey(filters)
  const now = Date.now()
  const cached = _prCache.get(key)
  if (cached && now - cached.fetchedAt < PR_FETCH_COOLDOWN_MS) {
    return cached.prs
  }

  const inFlight = _prInFlight.get(key)
  if (inFlight) return inFlight

  const request = fetchPRsFromSource(filters)
    .then((prs) => {
      const seen = new Set<string>()
      const unique = prs.filter((pr) => {
        const id = `${pr.base.repo.full_name}-${pr.number}`
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      _prCache.set(key, { prs: unique, fetchedAt: Date.now() })
      return unique
    })
    .catch((err) => {
      if (err instanceof GitHubClientError) {
        if (err.status === 429 && !err.retryAfterMs) {
          throw new GitHubClientError(err.message, {
            status: err.status,
            retryAfterMs: DEFAULT_RATE_LIMIT_BACKOFF_MS,
          })
        }
        throw err
      }

      throw new GitHubClientError(err instanceof Error ? err.message : 'Failed to fetch PRs')
    })
    .finally(() => {
      _prInFlight.delete(key)
    })

  _prInFlight.set(key, request)
  return request
}

// ─── Issues ─────────────────────────────────────────────────────

interface CachedIssueResult {
  issues: GitHubIssue[]
  fetchedAt: number
}

const ISSUE_FETCH_COOLDOWN_MS = 15_000
const _issueCache = new Map<string, CachedIssueResult>()
const _issueInFlight = new Map<string, Promise<GitHubIssue[]>>()

function makeIssueQueryKey(filters: Partial<IssueFilter>): string {
  return JSON.stringify({
    repo: filters.repo ?? '',
    labels: sorted(filters.labels),
    assignees: sorted(filters.assignees),
    status: filters.status ?? '',
    search: filters.search ?? '',
    milestone: filters.milestone ?? '',
  })
}

async function fetchIssuesFromSource(filters: Partial<IssueFilter>): Promise<GitHubIssue[]> {
  if (_sendRequest) {
    try {
      const result = await _sendRequest('github.list-issues', {
        repo: filters.repo,
        labels: filters.labels,
        assignees: filters.assignees,
        status: filters.status,
        search: filters.search,
        milestone: filters.milestone,
      })
      if (Array.isArray(result)) return result as GitHubIssue[]
      const obj = result as Record<string, unknown>
      if (Array.isArray(obj?.issues)) return obj.issues as GitHubIssue[]
    } catch {
      // Fall through to API route
    }
  }

  const params = new URLSearchParams()
  const repo = filters.repo || _targetRepo
  if (repo) params.set('repo', repo)
  if (filters.labels?.length) params.set('labels', filters.labels.join(','))
  if (filters.assignees?.length) params.set('assignees', filters.assignees.join(','))
  if (filters.status) params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  if (filters.milestone) params.set('milestone', filters.milestone)

  const res = await fetch(`/api/github/issues?${params}`, { headers: authHeaders() })
  if (!res.ok) {
    const retryAfterMs = await parseRetryAfterFromResponse(res)
    throw new GitHubClientError(`Failed to fetch issues: ${res.status}`, {
      status: res.status,
      retryAfterMs,
    })
  }

  const payload = await res.json()
  if (!Array.isArray(payload)) {
    throw new GitHubClientError('Invalid response while fetching issues')
  }
  return payload as GitHubIssue[]
}

export async function fetchIssues(filters: Partial<IssueFilter>): Promise<GitHubIssue[]> {
  const key = makeIssueQueryKey(filters)
  const now = Date.now()
  const cached = _issueCache.get(key)
  if (cached && now - cached.fetchedAt < ISSUE_FETCH_COOLDOWN_MS) {
    return cached.issues
  }

  const inFlight = _issueInFlight.get(key)
  if (inFlight) return inFlight

  const request = fetchIssuesFromSource(filters)
    .then((issues) => {
      const seen = new Set<number>()
      const unique = issues.filter((issue) => {
        if (seen.has(issue.id)) return false
        seen.add(issue.id)
        return true
      })
      _issueCache.set(key, { issues: unique, fetchedAt: Date.now() })
      return unique
    })
    .catch((err) => {
      if (err instanceof GitHubClientError) {
        if (err.status === 429 && !err.retryAfterMs) {
          throw new GitHubClientError(err.message, {
            status: err.status,
            retryAfterMs: DEFAULT_RATE_LIMIT_BACKOFF_MS,
          })
        }
        throw err
      }
      throw new GitHubClientError(err instanceof Error ? err.message : 'Failed to fetch issues')
    })
    .finally(() => {
      _issueInFlight.delete(key)
    })

  _issueInFlight.set(key, request)
  return request
}

export async function fetchIssue(repo: string, number: number): Promise<GitHubIssue> {
  if (_sendRequest) {
    try {
      const result = await _sendRequest('github.get-issue', { repo, number })
      return result as GitHubIssue
    } catch {
      // Fall through
    }
  }

  const [owner, repoName] = repo.split('/')
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/issues/${number}`,
    { headers: authHeaders() },
  )
  if (!res.ok) throw new GitHubClientError(`Failed to fetch issue #${number}: ${res.status}`, { status: res.status })
  return res.json()
}

// ─── Fetch single PR ────────────────────────────────────────────

export async function fetchPR(repo: string, number: number): Promise<GitHubPR> {
  if (_sendRequest) {
    try {
      const result = await _sendRequest('github.get-pr', { repo, number })
      return result as GitHubPR
    } catch {
      // Fall through
    }
  }

  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch PR #${number}: ${res.status}`)
  return res.json()
}

// ─── Fetch PR diff ──────────────────────────────────────────────

export async function fetchPRDiff(repo: string, number: number): Promise<string> {
  if (_sendRequest) {
    try {
      const result = await _sendRequest('github.get-pr-diff', { repo, number })
      return result as string
    } catch {
      // Fall through
    }
  }

  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/diff`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.status}`)
  return res.text()
}

// ─── Generate commit message ────────────────────────────────────

export async function generateCommitMessage(
  repo: string,
  number: number
): Promise<string> {
  if (_sendRequest) {
    try {
      const result = await _sendRequest('github.generate-commit-message', {
        repo,
        number,
      })
      if (typeof result === 'string') return result
      const obj = result as Record<string, unknown>
      return (obj?.message as string) ?? ''
    } catch {
      // Fall through
    }
  }

  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/commit-message`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to generate commit message: ${res.status}`)
  const data = await res.json()
  return data.message ?? ''
}

// ─── PR Comments (issue comments) ───────────────────────────────

export async function fetchPRComments(repo: string, number: number): Promise<GitHubComment[]> {
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/comments`, { headers: authHeaders() })
  if (!res.ok) throw new GitHubClientError(`Failed to fetch comments: ${res.status}`, { status: res.status })
  return res.json()
}

export async function postPRComment(repo: string, number: number, body: string): Promise<GitHubComment> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to post comment: ${res.status}`, { status: res.status })
  return res.json()
}

// ─── Submit review ──────────────────────────────────────────────

export async function submitReview(
  repo: string,
  number: number,
  { body, event }: { body: string; event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' }
): Promise<void> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/reviews`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, event }),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to submit review: ${res.status}`, { status: res.status })
}

// ─── Update PR (title, body, state) ─────────────────────────────

export async function updatePR(
  repo: string,
  number: number,
  update: { title?: string; body?: string; state?: 'open' | 'closed' }
): Promise<GitHubPR> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to update PR: ${res.status}`, { status: res.status })
  return res.json()
}

// ─── Merge PR ───────────────────────────────────────────────────

export interface MergePRResult {
  merged: boolean
  message: string
  sha?: string
}

export async function mergePR(
  repo: string,
  number: number,
  options: { sha?: string; mergeMethod?: 'merge' | 'squash' | 'rebase' } = {}
): Promise<MergePRResult> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/merge`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sha: options.sha,
      mergeMethod: options.mergeMethod ?? 'squash',
    }),
  })
  if (!res.ok) {
    let message = `Failed to merge PR (${res.status})`
    try {
      const json = await res.json() as { error?: string; reason?: string }
      if (json.error) message = json.error
    } catch {
      const text = await res.text().catch(() => '')
      if (text) message = text
    }
    throw new GitHubClientError(message, { status: res.status })
  }
  return res.json()
}

export async function updatePRBranch(
  repo: string,
  number: number,
  options: { expectedHeadSha?: string } = {}
): Promise<{ message: string; url: string }> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/update-branch`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expected_head_sha: options.expectedHeadSha,
    }),
  })
  if (!res.ok) {
    const message = await res.text()
    throw new GitHubClientError(`Failed to update branch: ${res.status} ${message}`, { status: res.status })
  }
  return res.json()
}

// ─── Labels ─────────────────────────────────────────────────────

export async function addLabels(repo: string, number: number, labels: string[]): Promise<void> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/labels`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels }),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to add labels: ${res.status}`, { status: res.status })
}

export async function removeLabel(repo: string, number: number, labelName: string): Promise<void> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/labels/${encodeURIComponent(labelName)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to remove label: ${res.status}`, { status: res.status })
}

// ─── Reviewers ──────────────────────────────────────────────────

export async function requestReviewers(repo: string, number: number, reviewers: string[]): Promise<void> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/reviewers`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewers }),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to request reviewers: ${res.status}`, { status: res.status })
}

export async function fetchCollaborators(repo: string): Promise<GitHubCollaborator[]> {
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/repos/${owner}/${repoName}/collaborators`, { headers: authHeaders() })
  if (!res.ok) throw new GitHubClientError(`Failed to fetch collaborators: ${res.status}`, { status: res.status })
  return res.json()
}

// ─── Inline review comments ────────────────────────────────────

export async function fetchReviewComments(repo: string, number: number): Promise<GitHubReviewComment[]> {
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/review-comments`, { headers: authHeaders() })
  if (!res.ok) throw new GitHubClientError(`Failed to fetch review comments: ${res.status}`, { status: res.status })
  return res.json()
}

export async function postReviewComment(
  repo: string,
  number: number,
  comment: { body: string; path: string; line: number; side?: 'LEFT' | 'RIGHT' }
): Promise<GitHubReviewComment> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/review-comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(comment),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to post review comment: ${res.status}`, { status: res.status })
  return res.json()
}

export async function replyToReviewComment(
  repo: string,
  number: number,
  commentId: number,
  body: string
): Promise<GitHubReviewComment> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/pr/${owner}/${repoName}/${number}/review-comments/${commentId}/replies`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to reply to comment: ${res.status}`, { status: res.status })
  return res.json()
}

// ─── Code Browser ───────────────────────────────────────────────

export async function fetchRepoTree(repo: string, ref?: string, headRepo?: string): Promise<TreeEntry[]> {
  const [owner, repoName] = repo.split('/')
  const qp = new URLSearchParams()
  if (ref) qp.set('ref', ref)
  // For fork PRs, pass head repo so the API fetches from the fork
  if (headRepo && headRepo !== repo) {
    const [ho, hr] = headRepo.split('/')
    qp.set('headOwner', ho)
    qp.set('headRepo', hr)
  }
  const params = qp.toString() ? `?${qp}` : ''
  const res = await fetch(`/api/github/repos/${owner}/${repoName}/tree${params}`, { headers: authHeaders() })
  if (!res.ok) throw new GitHubClientError(`Failed to fetch tree: ${res.status}`, { status: res.status })
  const data = (await res.json()) as { entries: TreeEntry[] }
  return data.entries
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif'])

function isImagePath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTS.has(ext)
}

export async function fetchFileContents(repo: string, path: string, ref?: string, headRepo?: string): Promise<FileContent> {
  const [owner, repoName] = repo.split('/')
  const qp = new URLSearchParams()
  if (ref) qp.set('ref', ref)
  if (headRepo && headRepo !== repo) {
    const [ho, hr] = headRepo.split('/')
    qp.set('headOwner', ho)
    qp.set('headRepo', hr)
  }
  const params = qp.toString() ? `?${qp}` : ''
  const res = await fetch(`/api/github/repos/${owner}/${repoName}/contents/${path}${params}`, { headers: authHeaders() })
  if (!res.ok) throw new GitHubClientError(`Failed to fetch file: ${res.status}`, { status: res.status })
  const data = await res.json()
  let content = data.content ?? ''
  if (data.encoding === 'base64' && content) {
    if (isImagePath(path)) {
      content = content.replace(/\n/g, '')
    } else {
      const bin = atob(content.replace(/\n/g, ''))
      content = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
    }
  }
  return {
    name: data.name, path: data.path, sha: data.sha, size: data.size,
    content, encoding: data.encoding, download_url: data.download_url,
  }
}

export async function fetchBranches(repo: string): Promise<Branch[]> {
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/repos/${owner}/${repoName}/branches`, { headers: authHeaders() })
  if (!res.ok) throw new GitHubClientError(`Failed to fetch branches: ${res.status}`, { status: res.status })
  return res.json()
}

export async function createOrUpdateFile(
  repo: string,
  path: string,
  opts: { content: string; message: string; sha?: string; branch?: string }
): Promise<{ sha: string }> {
  assertWritable()
  const [owner, repoName] = repo.split('/')
  const res = await fetch(`/api/github/repos/${owner}/${repoName}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) throw new GitHubClientError(`Failed to save file: ${res.status}`, { status: res.status })
  return res.json()
}
