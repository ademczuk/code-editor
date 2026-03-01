import { NextResponse } from 'next/server'
import { withAuth } from '@workos-inc/authkit-nextjs'

export async function GET() {
  const { user } = await withAuth()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const plan = (user.metadata as Record<string, string>)?.KnotCode

  if (plan !== 'pro') {
    return NextResponse.json(
      {
        error: 'not_pro',
        message: 'Your account does not have KnotCode Pro access.',
      },
      { status: 403 },
    )
  }

  return NextResponse.json({ ok: true, plan })
}
