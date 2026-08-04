import { NextRequest, NextResponse } from 'next/server'
import { removeSubscription } from '@/lib/push'

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400 }
      )
    }

    await removeSubscription(endpoint)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Push Unsubscribe] Error:', err)
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 }
    )
  }
}
