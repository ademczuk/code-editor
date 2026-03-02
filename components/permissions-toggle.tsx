'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'

export type PermissionLevel = 'default' | 'full'

const LEVELS: Array<{ id: PermissionLevel; label: string; icon: string; desc: string }> = [
  { id: 'default', label: 'Default permissions', icon: 'lucide:shield', desc: 'Agent proposes edits for review before applying' },
  { id: 'full', label: 'Full access', icon: 'lucide:shield-off', desc: 'Agent auto-applies edits and runs commands without confirmation' },
]

const STORAGE_KEY = 'code-editor:agent-permissions'

function loadPermissions(): PermissionLevel {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'default' || v === 'full') return v
  } catch {}
  return 'default'
}

interface Props {
  size?: 'sm' | 'md'
}

export function PermissionsToggle({ size = 'sm' }: Props) {
  const [level, setLevel] = useState<PermissionLevel>(loadPermissions)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, level) } catch {}
    window.dispatchEvent(new CustomEvent('permissions-change', { detail: { permissions: level } }))
  }, [level])

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

  const current = LEVELS.find(l => l.id === level) ?? LEVELS[0]
  const isMd = size === 'md'

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center rounded-lg font-medium transition-all cursor-pointer select-none ${
          level === 'full'
            ? 'text-[var(--warning,#eab308)] bg-[color-mix(in_srgb,var(--warning,#eab308)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning,#eab308)_12%,transparent)]'
            : 'text-[var(--text-secondary)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)]'
        } ${
          isMd ? 'gap-1.5 px-3 py-1.5 text-[13px]' : 'gap-1 px-2 py-1 text-[11px]'
        }`}
        title={current.desc}
      >
        <Icon icon={current.icon} width={isMd ? 14 : 12} height={isMd ? 14 : 12} />
        {isMd ? current.label : (level === 'full' ? 'Full' : 'Default')}
        <Icon icon="lucide:chevron-down" width={isMd ? 10 : 8} height={isMd ? 10 : 8} className="opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute z-50 w-56 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl py-1 ${
            isMd ? 'bottom-full mb-1.5' : 'bottom-full mb-1'
          }`}>
            {LEVELS.map(l => (
              <button
                key={l.id}
                onClick={() => { setLevel(l.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                  l.id === level
                    ? l.id === 'full'
                      ? 'text-[var(--warning,#eab308)] bg-[color-mix(in_srgb,var(--warning,#eab308)_8%,transparent)]'
                      : 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                }`}
              >
                <Icon icon={l.icon} width={14} height={14} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">{l.label}</div>
                  <div className="text-[10px] text-[var(--text-disabled)] leading-tight">{l.desc}</div>
                </div>
                {l.id === level && <Icon icon="lucide:check" width={12} height={12} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function usePermissions(): PermissionLevel {
  const [level, setLevel] = useState<PermissionLevel>(loadPermissions)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.permissions) setLevel(detail.permissions)
    }
    window.addEventListener('permissions-change', handler)
    return () => window.removeEventListener('permissions-change', handler)
  }, [])

  return level
}
