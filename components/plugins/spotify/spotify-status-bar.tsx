'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

const SPOTIFY_API = 'https://api.spotify.com/v1'

function getToken(): string | null {
  try { return localStorage.getItem('knot:spotify-token') } catch { return null }
}

export function SpotifyStatusBar() {
  const [trackInfo, setTrackInfo] = useState<{ name: string; artist: string; isPlaying: boolean } | null>(null)

  const fetchTrack = useCallback(async () => {
    const token = getToken()
    if (!token) { setTrackInfo(null); return }
    try {
      const res = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 204 || !res.ok) { setTrackInfo(null); return }
      const data = await res.json()
      if (!data?.item) { setTrackInfo(null); return }
      setTrackInfo({
        name: data.item.name,
        artist: data.item.artists?.[0]?.name ?? '',
        isPlaying: data.is_playing,
      })
    } catch {
      setTrackInfo(null)
    }
  }, [])

  useEffect(() => {
    fetchTrack()
    const id = setInterval(fetchTrack, 10000)
    return () => clearInterval(id)
  }, [fetchTrack])

  useEffect(() => {
    const handler = () => fetchTrack()
    window.addEventListener('spotify-token-changed', handler)
    return () => window.removeEventListener('spotify-token-changed', handler)
  }, [fetchTrack])

  if (!trackInfo) return null

  return (
    <span className="flex items-center gap-1 max-w-[150px] text-[var(--text-tertiary)] cursor-default" title={`${trackInfo.name} — ${trackInfo.artist}`}>
      <Icon
        icon={trackInfo.isPlaying ? 'lucide:volume-2' : 'lucide:volume-x'}
        width={9}
        height={9}
        className={trackInfo.isPlaying ? 'text-[#1DB954]' : ''}
      />
      <span className="truncate text-[10px]">
        {trackInfo.name}
        {trackInfo.artist ? ` · ${trackInfo.artist}` : ''}
      </span>
    </span>
  )
}
