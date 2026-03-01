import { getSignInUrl } from '@workos-inc/authkit-nextjs'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('redirect') ?? '/'
  const url = await getSignInUrl({ returnTo })
  redirect(url)
}
