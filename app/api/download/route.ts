import { NextRequest, NextResponse } from 'next/server'

/**
 * Required env vars:
 *
 *   GITHUB_SPONSOR_LOGIN    Your GitHub username/org (e.g. "openknots")
 *   RELEASE_GITHUB_TOKEN    PAT with `repo` scope — used to read draft releases
 *   RELEASE_REPO            "<owner>/<repo>" of the repo that has the release assets
 *
 * How it works:
 *   1. The request must carry the end-user's GitHub token in `Authorization: Bearer <token>`.
 *   2. We call the GitHub GraphQL API (as the user) to check `user($login).viewerIsSponsoring`.
 *   3. If they are a sponsor we fetch the latest DMG asset from the (draft) release using the
 *      server-side RELEASE_GITHUB_TOKEN and stream it back to the client.
 *   4. If not, we return 402 with a link to the sponsors page.
 */

const SPONSOR_LOGIN = process.env.GITHUB_SPONSOR_LOGIN ?? ''
const RELEASE_TOKEN = process.env.RELEASE_GITHUB_TOKEN ?? ''
const RELEASE_REPO = process.env.RELEASE_REPO ?? ''

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

// ── Sponsorship check ──────────────────────────────────────────────────────

async function isViewerSponsoring(userToken: string): Promise<boolean> {
  if (!SPONSOR_LOGIN) return false

  const query = `
    query CheckSponsoring($login: String!) {
      user(login: $login) {
        viewerIsSponsoring
      }
    }
  `

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { login: SPONSOR_LOGIN } }),
    })
    if (!res.ok) return false
    const { data } = (await res.json()) as { data?: { user?: { viewerIsSponsoring?: boolean } } }
    return data?.user?.viewerIsSponsoring === true
  } catch {
    return false
  }
}

// ── Release asset lookup ───────────────────────────────────────────────────

interface DmgAsset {
  name: string
  url: string
  size: number
}

async function getLatestDmgAsset(): Promise<DmgAsset | null> {
  if (!RELEASE_TOKEN || !RELEASE_REPO) return null

  const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases`, {
    headers: { ...GH_HEADERS, Authorization: `Bearer ${RELEASE_TOKEN}` },
  })
  if (!res.ok) return null

  const releases = (await res.json()) as Array<{
    draft: boolean
    assets: Array<{ name: string; url: string; size: number }>
  }>

  for (const release of releases) {
    const dmg = release.assets.find(a => a.name.endsWith('.dmg'))
    if (dmg) return { name: dmg.name, url: dmg.url, size: dmg.size }
  }
  return null
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Require user's GitHub token
  const authHeader = req.headers.get('authorization')
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!userToken) {
    return NextResponse.json({ error: 'GitHub token required' }, { status: 401 })
  }

  // Check sponsorship
  const sponsored = await isViewerSponsoring(userToken)
  if (!sponsored) {
    return NextResponse.json(
      {
        error: 'Sponsorship required',
        sponsor_url: `https://github.com/sponsors/${SPONSOR_LOGIN}`,
      },
      { status: 402 },
    )
  }

  // Find latest DMG asset
  const asset = await getLatestDmgAsset()
  if (!asset) {
    return NextResponse.json({ error: 'No release available yet — check back soon' }, { status: 404 })
  }

  // Stream download via server-side release token so the draft asset URL stays private
  const upstream = await fetch(asset.url, {
    headers: {
      ...GH_HEADERS,
      Authorization: `Bearer ${RELEASE_TOKEN}`,
      Accept: 'application/octet-stream',
    },
    redirect: 'follow',
  })

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Failed to retrieve release asset' }, { status: 502 })
  }

  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${asset.name}"`,
  })
  if (asset.size) headers.set('Content-Length', String(asset.size))

  return new NextResponse(upstream.body, { headers })
}
