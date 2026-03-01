'use client'

import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'

export function EditorTabs() {
  const { files, activeFile, setActiveFile, closeFile } = useEditor()

  if (files.length === 0) return null

  return (
    <div className="flex items-center border-b border-[var(--border)] bg-[var(--bg)] overflow-x-auto no-scrollbar shrink-0">
      {files.map(file => {
        const name = file.path.split('/').pop() ?? file.path
        const isActive = file.path === activeFile
        return (
          <div
            key={file.path}
            className={`group flex items-center gap-1.5 px-3 py-1.5 border-r border-[var(--border)] cursor-pointer transition-colors min-w-0 shrink-0 ${
              isActive
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-b-2 border-b-[var(--brand)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] border-b-2 border-b-transparent'
            }`}
            onClick={() => setActiveFile(file.path)}
          >
            <span className="text-[11px] truncate max-w-[120px]" title={file.path}>
              {name}
            </span>
            {file.dirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] shrink-0" title="Unsaved changes" />
            )}
            <button
              onClick={e => { e.stopPropagation(); closeFile(file.path) }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              title="Close"
            >
              <Icon icon="lucide:x" width={10} height={10} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
