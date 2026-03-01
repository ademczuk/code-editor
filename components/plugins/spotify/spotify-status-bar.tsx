'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { isSpotifyAuthenticated } from '@/lib/spotify-auth'

interface TrackInfo {
  name: string
  artist: string
  paused: boolean
}

export function SpotifyStatusBar() {
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    setAuthenticated(isSpotifyAuthenticated())
    const authHandler = () => setAuthenticated(isSpotifyAuthenticated())
    window.addEventListener('spotify-auth-changed', authHandler)
    return () => window.removeEventListener('spotify-auth-changed', authHandler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const state = (e as CustomEvent).detail
      if (!state?.track_window?.current_track) {
        setTrack(null)
        return
      }
      const t = state.track_window.current_track
      setTrack({
        name: t.name,
        artist: t.artists?.[0]?.name ?? '',
        paused: state.paused,
      })
    }
    window.addEventListener('spotify-state-changed', handler)
    return () => window.removeEventListener('spotify-state-changed', handler)
  }, [])

  if (!authenticated || !track) return null

  return (
    <span
      className="flex items-center gap-1 max-w-[150px] text-[var(--text-tertiary)] cursor-default"
      title={`${track.name} — ${track.artist}`}
    >
      <Icon
        icon={track.paused ? 'lucide:pause' : 'lucide:volume-2'}
        width={9}
        height={9}
        className={track.paused ? '' : 'text-[#1DB954]'}
      />
      <span className="truncate text-[10px]">
        {track.name}
        {track.artist ? ` · ${track.artist}` : ''}
      </span>
    </span>
  )
}
