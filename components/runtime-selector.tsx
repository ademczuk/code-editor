'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'

export type RuntimeMode = 'local' | 'worktree' | 'cloud'

const RUNTIMES: Array<{ id: RuntimeMode; label: string; icon: string; desc: string }> = [
  { id: 'local', label: 'Local', icon: 'lucide:laptop', desc: 'Agent edits apply to the current working directory' },
  { id: 'worktree', label: 'Worktree', icon: 'lucide:git-fork', desc: 'Agent works in an isolated git worktree' },
  { id: 'cloud', label: 'Cloud', icon: 'lucide:cloud', desc: 'Agent runs remotely via gateway' },
]

const STORAGE_KEY = 'code-editor:runtime'

function loadRuntime(): RuntimeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'local' || v === 'worktree' || v === 'cloud') return v
  } catch {}
  return 'local'
}

interface Props {
  size?: 'sm' | 'md'
}

export function RuntimeSelector({ size = 'sm' }: Props) {
  const [runtime, setRuntime] = useState<RuntimeMode>(loadRuntime)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, runtime) } catch {}
    window.dispatchEvent(new CustomEvent('runtime-change', { detail: { runtime } }))
  }, [runtime])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = RUNTIMES.find(r => r.id === runtime) ?? RUNTIMES[0]
  const isMd = size === 'md'

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center rounded-lg font-medium transition-all cursor-pointer select-none text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] ${
          isMd ? 'gap-1.5 px-3 py-1.5 text-[13px]' : 'gap-1 px-2 py-1 text-[11px]'
        }`}
        title={current.desc}
      >
        <Icon icon={current.icon} width={isMd ? 14 : 12} height={isMd ? 14 : 12} />
        {current.label}
        <Icon icon="lucide:chevron-down" width={isMd ? 10 : 8} height={isMd ? 10 : 8} className="text-[var(--text-disabled)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute z-50 w-52 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl py-1 ${
            isMd ? 'bottom-full mb-1.5' : 'bottom-full mb-1'
          }`}>
            {RUNTIMES.map(r => (
              <button
                key={r.id}
                onClick={() => { setRuntime(r.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                  r.id === runtime
                    ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                }`}
              >
                <Icon icon={r.icon} width={14} height={14} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">{r.label}</div>
                  <div className="text-[10px] text-[var(--text-disabled)] leading-tight">{r.desc}</div>
                </div>
                {r.id === runtime && <Icon icon="lucide:check" width={12} height={12} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function useRuntime(): RuntimeMode {
  const [runtime, setRuntime] = useState<RuntimeMode>(loadRuntime)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.runtime) setRuntime(detail.runtime)
    }
    window.addEventListener('runtime-change', handler)
    return () => window.removeEventListener('runtime-change', handler)
  }, [])

  return runtime
}
