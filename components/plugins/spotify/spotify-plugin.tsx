'use client'

import { useEffect } from 'react'
import { usePlugins } from '@/context/plugin-context'
import { SpotifyPlayer } from './spotify-player'
import { SpotifySettings } from './spotify-settings'
import { SpotifyStatusBar } from './spotify-status-bar'

export function SpotifyPlugin() {
  const { registerPlugin, unregisterPlugin } = usePlugins()

  useEffect(() => {
    registerPlugin('floating', {
      id: 'spotify-player',
      component: SpotifyPlayer,
      order: 10,
    })

    registerPlugin('status-bar-right', {
      id: 'spotify-status-bar',
      component: SpotifyStatusBar,
      order: 10,
    })

    registerPlugin('settings', {
      id: 'spotify-settings',
      component: SpotifySettings,
      order: 10,
    })

    return () => {
      unregisterPlugin('spotify-player')
      unregisterPlugin('spotify-status-bar')
      unregisterPlugin('spotify-settings')
    }
  }, [registerPlugin, unregisterPlugin])

  return null
}
