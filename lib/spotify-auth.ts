const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''
const SCOPES = 'streaming user-read-playback-state user-modify-playback-state user-read-currently-playing'
const TOKEN_KEY = 'knot:spotify-token'
const REFRESH_KEY = 'knot:spotify-refresh'
const EXPIRY_KEY = 'knot:spotify-expiry'
const VERIFIER_KEY = 'knot:spotify-pkce-verifier'

export function spotifyAvailable(): boolean {
  return !!SPOTIFY_CLIENT_ID
}

export function getSpotifyToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const expiry = localStorage.getItem(EXPIRY_KEY)
    if (!token) return null
    if (expiry && Date.now() > Number(expiry) - 60_000) return null
    return token
  } catch { return null }
}

export function getSpotifyRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function isSpotifyAuthenticated(): boolean {
  return !!getSpotifyToken() || !!getSpotifyRefreshToken()
}

function saveTokens(access: string, refresh: string | null, expiresIn: number) {
  try {
    localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000))
    window.dispatchEvent(new CustomEvent('spotify-auth-changed'))
  } catch {}
}

export function clearSpotifyAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    localStorage.removeItem(VERIFIER_KEY)
    window.dispatchEvent(new CustomEvent('spotify-auth-changed'))
  } catch {}
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return Array.from(array, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function getRedirectUri(): string {
  return window.location.origin + window.location.pathname
}

/**
 * Start Spotify PKCE login via popup window.
 * Returns a promise that resolves with the access token on success.
 */
export async function startSpotifyLogin(): Promise<string> {
  if (!SPOTIFY_CLIENT_ID) throw new Error('Spotify Client ID not configured')

  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  localStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'false',
  })

  const authUrl = `https://accounts.spotify.com/authorize?${params}`

  return new Promise<string>((resolve, reject) => {
    const width = 500
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(authUrl, 'spotify-auth', `width=${width},height=${height},left=${left},top=${top}`)

    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site'))
      return
    }

    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval)
          reject(new Error('Login cancelled'))
          return
        }

        const url = popup.location.href
        if (!url.startsWith(getRedirectUri())) return

        const params = new URL(url).searchParams
        const code = params.get('code')
        const error = params.get('error')

        clearInterval(interval)
        popup.close()

        if (error) {
          reject(new Error(error === 'access_denied' ? 'Access denied' : error))
          return
        }

        if (code) {
          exchangeCode(code).then(resolve).catch(reject)
        } else {
          reject(new Error('No authorization code received'))
        }
      } catch {
        // Cross-origin — popup hasn't redirected back yet
      }
    }, 200)

    setTimeout(() => {
      clearInterval(interval)
      try { popup.close() } catch {}
      reject(new Error('Login timed out'))
    }, 300_000)
  })
}

async function exchangeCode(code: string): Promise<string> {
  const verifier = localStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Missing PKCE verifier')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed: ${body}`)
  }

  const data = await res.json()
  saveTokens(data.access_token, data.refresh_token, data.expires_in)
  localStorage.removeItem(VERIFIER_KEY)
  return data.access_token
}

export async function refreshSpotifyToken(): Promise<string | null> {
  const refreshToken = getSpotifyRefreshToken()
  if (!refreshToken || !SPOTIFY_CLIENT_ID) return null

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!res.ok) {
      clearSpotifyAuth()
      return null
    }

    const data = await res.json()
    saveTokens(data.access_token, data.refresh_token ?? refreshToken, data.expires_in)
    return data.access_token
  } catch {
    return null
  }
}

/**
 * Get a valid token, refreshing if necessary.
 */
export async function ensureSpotifyToken(): Promise<string | null> {
  const token = getSpotifyToken()
  if (token) return token
  return refreshSpotifyToken()
}

/**
 * Make an authenticated Spotify API request, auto-refreshing if needed.
 */
export async function spotifyFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  let token = await ensureSpotifyToken()
  if (!token) throw new Error('Not authenticated with Spotify')

  let res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  })

  if (res.status === 401) {
    token = await refreshSpotifyToken()
    if (!token) throw new Error('Spotify session expired')
    res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    })
  }

  return res
}
