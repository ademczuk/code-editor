#!/usr/bin/env node
/**
 * Tauri static build wrapper.
 *
 * `output: 'export'` (Next.js static export) cannot include dynamic API route
 * handlers — they require a live server. For the Tauri desktop build these
 * routes are unused anyway: all GitHub API calls go directly from the client
 * via lib/github-client.ts.
 *
 * This script temporarily moves the server-only routes out of the app directory
 * before `next build`, then restores them in a finally block so the source tree
 * is always left intact regardless of build outcome.
 */

import { execSync } from 'child_process'
import { renameSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SERVER_ROUTES = [
  [resolve(root, 'app/api'),      resolve(root, '.tauri-api-tmp')],
  [resolve(root, 'app/callback'), resolve(root, '.tauri-callback-tmp')],
  [resolve(root, 'app/download'), resolve(root, '.tauri-download-tmp')],
]

function hide() {
  for (const [src, dst] of SERVER_ROUTES) {
    if (existsSync(src)) renameSync(src, dst)
  }
}

function restore() {
  for (const [src, dst] of SERVER_ROUTES) {
    if (existsSync(dst)) renameSync(dst, src)
  }
}

hide()
try {
  execSync('next build --webpack', { stdio: 'inherit', cwd: root })
} finally {
  restore()
}
