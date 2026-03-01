/**
 * GitHub types for code-flow PR management.
 */

export interface GitHubUser {
  login: string
  avatar_url: string
  html_url: string
}

export interface GitHubLabel {
  id: number
  name: string
  color: string
  description?: string
}

export interface GitHubReview {
  id: number
  user: GitHubUser
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
  submitted_at: string
  body?: string
}

export interface GitHubCheckRun {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  html_url: string
}

export interface GitHubComment {
  id: number
  user: GitHubUser
  body: string
  created_at: string
  updated_at: string
  html_url: string
  author_association?: string
}

export interface GitHubReviewComment {
  id: number
  user: GitHubUser
  body: string
  path: string
  line: number | null
  original_line: number | null
  side: 'LEFT' | 'RIGHT'
  diff_hunk: string
  in_reply_to_id?: number
  created_at: string
  updated_at: string
  html_url: string
}

export interface GitHubCollaborator {
  login: string
  avatar_url: string
  permissions?: {
    admin: boolean
    push: boolean
    pull: boolean
  }
}

export interface GitHubPR {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  draft: boolean
  html_url: string
  created_at: string
  updated_at: string
  merged_at: string | null
  user: GitHubUser
  labels: GitHubLabel[]
  head: {
    ref: string
    sha: string
    repo?: { full_name: string }
  }
  base: {
    ref: string
    sha: string
    repo: { full_name: string }
  }
  // Stats
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number

  // Computed / enriched
  reviews?: GitHubReview[]
  check_runs?: GitHubCheckRun[]
  comments?: GitHubComment[]
  mergeable?: boolean
  mergeable_state?: string
  rebaseable?: boolean
  requested_reviewers?: GitHubUser[]
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  state_reason?: 'completed' | 'not_planned' | 'reopened' | null
  html_url: string
  created_at: string
  updated_at: string
  closed_at: string | null
  user: GitHubUser
  labels: GitHubLabel[]
  assignees: GitHubUser[]
  comments: number
  milestone?: { title: string; number: number } | null
  reactions?: { total_count: number }
}

export interface GitHubRepo {
  full_name: string
  html_url: string
  description: string | null
  default_branch: string
}

// ─── Code Browser ───────────────────────────────────────────────

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
  sha: string
}

export interface FileContent {
  name: string
  path: string
  sha: string
  size: number
  content: string
  encoding: string
  download_url?: string
}

export interface Branch {
  name: string
  protected: boolean
  commit: { sha: string }
}

// ─── Filters ────────────────────────────────────────────────────

export type PRStatus =
  | 'all'
  | 'open'
  | 'closed'
  | 'draft'
  | 'review-ready'
  | 'approved'
  | 'changes-requested'

export type GroupBy =
  | 'none'
  | 'auto'
  | 'repo'
  | 'label'
  | 'author'

export interface PRFilter {
  repos: string[]  // Always [TARGET_REPO] — not user-configurable
  labels: string[]
  authors: string[]
  status: PRStatus
  search: string
  groupBy: GroupBy
  perPage?: number
}

// ─── Issue Filters ──────────────────────────────────────────────

export type IssueStatus = 'open' | 'closed' | 'all'
export type IssueSortField = 'created' | 'updated' | 'comments'

export interface IssueFilter {
  repo: string
  labels: string[]
  assignees: string[]
  status: IssueStatus
  search: string
  milestone?: string
}

// ─── Grouping ───────────────────────────────────────────────────

export interface PRGroup {
  id: string
  name: string
  icon?: string
  description?: string
  prs: GitHubPR[]
}

// ─── Defaults ───────────────────────────────────────────────────

/** Hardcoded target repo */
/** Default is empty — user MUST configure in Settings. */
export const TARGET_REPO = ''

export const DEFAULT_FILTER: PRFilter = {
  repos: [TARGET_REPO],
  labels: [],
  authors: [],
  status: 'open',
  search: '',
  groupBy: 'none',
}

export const DEFAULT_ISSUE_FILTER: IssueFilter = {
  repo: TARGET_REPO,
  labels: [],
  assignees: [],
  status: 'open',
  search: '',
}
