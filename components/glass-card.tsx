import { type ReactNode, type CSSProperties } from 'react'

type Elevation = 'base' | 'elevated'

interface GlassCardProps {
  children: ReactNode
  className?: string
  elevation?: Elevation
  interactive?: boolean
  as?: 'div' | 'section' | 'article'
  style?: CSSProperties
}

export function GlassCard({
  children,
  className = '',
  elevation = 'base',
  interactive = false,
  as: Tag = 'div',
  style,
}: GlassCardProps) {
  const base = elevation === 'elevated' ? 'surface surface-raised' : 'surface'
  const interactiveClass = interactive ? 'surface-interactive' : ''

  return (
    <Tag className={`${base} ${interactiveClass} ${className}`} style={style}>
      {children}
    </Tag>
  )
}
