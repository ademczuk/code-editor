'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

export function SpotifySettings() {
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    try {
      const t = localStorage.getItem('knot:spotify-token')
      if (t) setToken(t)
    } catch {}
  }, [])

  const save = () => {
    try {
      const trimmed = token.trim()
      if (trimmed) {
        localStorage.setItem('knot:spotify-token', trimmed)
      } else {
        localStorage.removeItem('knot:spotify-token')
      }
      window.dispatchEvent(new CustomEvent('spotify-token-changed'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
  }

  const clear = () => {
    setToken('')
    try {
      localStorage.removeItem('knot:spotify-token')
      window.dispatchEvent(new CustomEvent('spotify-token-changed'))
    } catch {}
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:music" width={14} height={14} className="text-[#1DB954]" />
        <span className="text-[11px] font-medium text-[var(--text-primary)]">Spotify</span>
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
        Paste Spotify access token for mini-player. Get one from the{' '}
        <a
          href="https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--brand)] hover:underline"
        >
          Spotify Developer Console
        </a>
        {' '}(requires Premium).
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Paste access token..."
          className="flex-1 h-7 px-2 text-[10px] rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors font-mono"
        />
        <button
          onClick={save}
          className="h-7 px-2.5 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 cursor-pointer transition-opacity"
        >
          {saved ? 'Saved' : 'Save'}
        </button>
        {token && (
          <button
            onClick={clear}
            className="h-7 px-2 rounded-md text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
            title="Clear token"
          >
            <Icon icon="lucide:x" width={12} height={12} />
          </button>
        )}
      </div>
    </div>
  )
}
