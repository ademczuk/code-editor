import type { NextConfig } from 'next'

const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined

const nextConfig: NextConfig = {
  // Static export for Tauri desktop builds
  ...(isTauri ? { output: 'export' } : {}),
}

export default nextConfig
