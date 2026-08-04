import { NextRequest, NextResponse } from 'next/server'
import { sendToRole, sendToUser } from '@/lib/push'
import { requireAuth } from '@/lib/auth-middleware'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)

    const body = await req.json()
    const { title, body: notificationBody, url, targetRole, targetUserId, tag } = body

    if (!title || !notificationBody) {
      return NextResponse.json(
        { error: 'Missing title or body' },
        { status: 400 }
      )
    }

    const payload = { title, body: notificationBody, url, tag }

    if (targetUserId) {
      const result = await sendToUser(targetUserId, payload)
      return NextResponse.json({ success: true, ...result })
    }

    if (targetRole) {
      const result = await sendToRole(targetRole, payload)
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json(
      { error: 'Must specify targetRole or targetUserId' },
      { status: 400 }
    )
  } catch (err) {
    console.error('[Push Send] Error:', err)
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
