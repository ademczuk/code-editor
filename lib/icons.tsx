/**
 * Centralized icon mapping using @iconify/react.
 *
 * Replaces all emoji usage with proper vector icons.
 * Uses icon sets: lucide, mdi, ph (phosphor), carbon, tabler
 */
import { Icon } from '@iconify/react'
import React, { type ComponentProps } from 'react'

type IconProps = Omit<ComponentProps<typeof Icon>, 'icon'>

// ─── Workflow Mode Icons ───────────────────────────────────────
export function TriageIcon(props: IconProps) {
  return <Icon icon="lucide:scan-search" {...props} />
}
export function ReviewIcon(props: IconProps) {
  return <Icon icon="lucide:clipboard-check" {...props} />
}
export function PrepareIcon(props: IconProps) {
  return <Icon icon="lucide:wrench" {...props} />
}
export function MergeIcon(props: IconProps) {
  return <Icon icon="lucide:rocket" {...props} />
}
export function PostMergeIcon(props: IconProps) {
  return <Icon icon="lucide:circle-check" {...props} />
}

// ─── PR Grouping Icons ─────────────────────────────────────────
export function LabelIcon(props: IconProps) {
  return <Icon icon="lucide:tag" {...props} />
}
export function UnlabeledIcon(props: IconProps) {
  return <Icon icon="lucide:clipboard-list" {...props} />
}
export function DraftIcon(props: IconProps) {
  return <Icon icon="lucide:pencil-line" {...props} />
}
export function GearIcon(props: IconProps) {
  return <Icon icon="lucide:settings" {...props} />
}

// ─── PR Memory / Note Icons ────────────────────────────────────
export function InsightIcon(props: IconProps) {
  return <Icon icon="lucide:lightbulb" {...props} />
}
export function DecisionIcon(props: IconProps) {
  return <Icon icon="lucide:circle-check" {...props} />
}
export function TodoIcon(props: IconProps) {
  return <Icon icon="lucide:clipboard-list" {...props} />
}
export function SummaryIcon(props: IconProps) {
  return <Icon icon="lucide:file-text" {...props} />
}
export function PinnedIcon(props: IconProps) {
  return <Icon icon="lucide:pin" {...props} />
}

// ─── Status Icons ──────────────────────────────────────────────
export function CheckIcon(props: IconProps) {
  return <Icon icon="lucide:check" {...props} />
}
export function WarningIcon(props: IconProps) {
  return <Icon icon="lucide:triangle-alert" {...props} />
}
export function ErrorIcon(props: IconProps) {
  return <Icon icon="lucide:circle-x" {...props} />
}

// ─── Workflow Mode → Icon Component Map ────────────────────────
export const WORKFLOW_MODE_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  triage: TriageIcon,
  review: ReviewIcon,
  prepare: PrepareIcon,
  merge: MergeIcon,
  'post-merge': PostMergeIcon,
}

// ─── Note Type → Icon Component Map ───────────────────────────
export const NOTE_TYPE_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  insight: InsightIcon,
  decision: DecisionIcon,
  todo: TodoIcon,
  summary: SummaryIcon,
  general: PinnedIcon,
}
