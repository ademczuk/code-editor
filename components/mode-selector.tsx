'use client'

import { useRef, useLayoutEffect, useState } from 'react'
import { Icon } from '@iconify/react'

export type AgentMode = 'plan' | 'code' | 'agent'

const MODES: Array<{ id: AgentMode; label: string; icon: string; desc: string }> = [
  { id: 'plan', label: 'Plan', icon: 'lucide:list-checks', desc: 'Discuss and plan before coding' },
  { id: 'code', label: 'Code', icon: 'lucide:code-2', desc: 'Direct code changes' },
  { id: 'agent', label: 'Agent', icon: 'lucide:infinity', desc: 'Autonomous multi-step agent' },
]

interface Props {
  mode: AgentMode
  onChange: (mode: AgentMode) => void
  size?: 'sm' | 'md'
}

export function ModeSelector({ mode, onChange, size = 'sm' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const idx = MODES.findIndex(m => m.id === mode)
    const btn = btnRefs.current[idx]
    const container = containerRef.current
    if (btn && container) {
      const cRect = container.getBoundingClientRect()
      const bRect = btn.getBoundingClientRect()
      setPill({ left: bRect.left - cRect.left, width: bRect.width })
    }
  }, [mode])

  const isMd = size === 'md'

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center rounded-[10px] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] ${
        isMd ? 'gap-0.5 p-[3px]' : 'gap-px p-[2px]'
      }`}
    >
      <span
        className={`absolute rounded-lg bg-[var(--bg-elevated)] pointer-events-none ${
          isMd ? 'top-[3px] h-[calc(100%-6px)] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]' : 'top-[2px] h-[calc(100%-4px)] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_var(--border)]'
        }`}
        style={{
          left: pill.left,
          width: pill.width,
          transition: 'left 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
          opacity: pill.width > 0 ? 1 : 0,
        }}
      />
      {MODES.map((m, i) => (
        <button
          key={m.id}
          ref={el => { btnRefs.current[i] = el }}
          onClick={() => onChange(m.id)}
          className={`relative z-[1] flex items-center rounded-lg font-medium transition-all duration-200 cursor-pointer select-none ${
            isMd ? 'gap-1.5 px-3.5 py-1.5 text-[13px]' : 'gap-1 px-2.5 py-1 text-[11px]'
          } ${
            mode === m.id
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-disabled)] hover:text-[var(--text-tertiary)]'
          }`}
          title={m.desc}
        >
          <Icon icon={m.icon} width={isMd ? 15 : 13} height={isMd ? 15 : 13} />
          {m.label}
        </button>
      ))}
    </div>
  )
}
