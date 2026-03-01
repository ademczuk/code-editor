'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type MarkdownViewMode = 'edit' | 'preview' | 'split'

interface MarkdownModeToggleProps {
  mode: MarkdownViewMode
  onModeChange: (mode: MarkdownViewMode) => void
}

export function MarkdownModeToggle({ mode, onModeChange }: MarkdownModeToggleProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onModeChange(value as MarkdownViewMode)}
      className="gap-0"
    >
      <TabsList aria-label="Markdown view mode">
        <TabsTrigger value="edit">Editor</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="split">Split</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
