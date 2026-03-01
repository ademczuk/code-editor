'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'

const SPOTIFY_API = 'https://api.spotify.com/v1'
const POLL_INTERVAL = 5000

interface SpotifyTrack {
  name: string
  artist: string
  album: string
  albumArt: string
  isPlaying: boolean
  progressMs: number
  durationMs: number
}

function getToken(): string | null {
  try { return localStorage.getItem('knot:spotify-token') } catch { return null }
}

async function spotifyFetch(path: string, opts: RequestInit = {}) {
  const token = getToken()
  if (!token) throw new Error('No Spotify token')
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Spotify ${res.status}`)
  return res.json()
}

export function SpotifyPlayer() {
  const [track, setTrack] = useState<SpotifyTrack | null>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [visible, setVisible] = useState(true)
  const [error, setError] = useState(false)
  const [localProgress, setLocalProgress] = useState(0)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPollRef = useRef(0)

  const fetchNowPlaying = useCallback(async () => {
    try {
      const data = await spotifyFetch('/me/player/currently-playing')
      if (!data || !data.item) {
        setTrack(null)
        return
      }
      const t: SpotifyTrack = {
        name: data.item.name,
        artist: data.item.artists?.map((a: { name: string }) => a.name).join(', ') ?? '',
        album: data.item.album?.name ?? '',
        albumArt: data.item.album?.images?.[2]?.url ?? data.item.album?.images?.[0]?.url ?? '',
        isPlaying: data.is_playing,
        progressMs: data.progress_ms ?? 0,
        durationMs: data.item.duration_ms ?? 0,
      }
      setTrack(t)
      setLocalProgress(t.progressMs)
      lastPollRef.current = Date.now()
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetchNowPlaying()
    const id = setInterval(fetchNowPlaying, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchNowPlaying])

  // Local progress ticker for smooth progress bar between polls
  useEffect(() => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    if (track?.isPlaying) {
      progressTimer.current = setInterval(() => {
        setLocalProgress(prev => {
          const elapsed = Date.now() - lastPollRef.current
          return (track.progressMs + elapsed)
        })
      }, 500)
    }
    return () => { if (progressTimer.current) clearInterval(progressTimer.current) }
  }, [track?.isPlaying, track?.progressMs])

  // Ctrl+Shift+M toggles visibility
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Listen for token changes
  useEffect(() => {
    const handler = () => { fetchNowPlaying() }
    window.addEventListener('spotify-token-changed', handler)
    return () => window.removeEventListener('spotify-token-changed', handler)
  }, [fetchNowPlaying])

  const togglePlay = async () => {
    if (!track) return
    try {
      await spotifyFetch(track.isPlaying ? '/me/player/pause' : '/me/player/play', { method: 'PUT' })
      setTrack(prev => prev ? { ...prev, isPlaying: !prev.isPlaying } : null)
    } catch {}
  }

  const skipNext = async () => {
    try {
      await spotifyFetch('/me/player/next', { method: 'POST' })
      setTimeout(fetchNowPlaying, 300)
    } catch {}
  }

  const skipPrev = async () => {
    try {
      await spotifyFetch('/me/player/previous', { method: 'POST' })
      setTimeout(fetchNowPlaying, 300)
    } catch {}
  }

  const token = getToken()
  if (!token || !visible) return null

  const progressPct = track ? Math.min(100, (localProgress / track.durationMs) * 100) : 0

  // Collapsed: tiny music icon
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-8 right-4 z-40 w-8 h-8 rounded-full bg-[var(--bg-elevated)]/80 backdrop-blur-xl border border-[var(--border)] shadow-lg flex items-center justify-center text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:scale-110 transition-all duration-200 cursor-pointer opacity-50 hover:opacity-100"
        title="Spotify Player (Ctrl+Shift+M)"
      >
        {track?.isPlaying ? (
          <Icon icon="lucide:music" width={14} height={14} className="animate-pulse" />
        ) : (
          <Icon icon="lucide:music" width={14} height={14} />
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-8 right-4 z-40 w-[280px] rounded-2xl bg-[var(--bg-elevated)]/90 backdrop-blur-xl border border-[var(--border)] shadow-lg overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
      {/* Progress bar (thin, at top) */}
      {track && (
        <div className="h-[2px] w-full bg-[var(--border)]">
          <div
            className="h-full bg-[#1DB954] transition-all duration-500 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-2.5 p-2.5">
        {/* Album art / collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 cursor-pointer group"
          title="Collapse"
        >
          {track?.albumArt ? (
            <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[var(--bg-subtle)] flex items-center justify-center">
              <Icon icon="lucide:music" width={16} height={16} className="text-[var(--text-disabled)]" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Icon icon="lucide:minimize-2" width={12} height={12} className="text-white" />
          </div>
        </button>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          {track ? (
            <>
              <div className="text-[11px] font-medium text-[var(--text-primary)] truncate leading-tight">{track.name}</div>
              <div className="text-[10px] text-[var(--text-tertiary)] truncate leading-tight">{track.artist}</div>
            </>
          ) : error ? (
            <div className="text-[10px] text-[var(--text-disabled)]">Token expired or invalid</div>
          ) : (
            <div className="text-[10px] text-[var(--text-disabled)]">Nothing playing</div>
          )}
        </div>

        {/* Controls */}
        {track && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={skipPrev} className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
              <Icon icon="lucide:skip-back" width={12} height={12} />
            </button>
            <button onClick={togglePlay} className="p-1.5 rounded-full hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] cursor-pointer transition-colors">
              <Icon icon={track.isPlaying ? 'lucide:pause' : 'lucide:play'} width={14} height={14} />
            </button>
            <button onClick={skipNext} className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
              <Icon icon="lucide:skip-forward" width={12} height={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
