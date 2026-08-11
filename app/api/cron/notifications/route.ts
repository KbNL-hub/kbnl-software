import { NextRequest, NextResponse } from 'next/server'
import {
  notifyBrokerStopReminder,
  notifyBrokerStoreSaleReminder,
  notifyAdminPendingStoreSale,
  notifyBrokerCreditExceeded15Days,
  notifyAdminCreditDaysExceeded,
  notifyAdminLowDieselBalance,
  notifyDriverStopReminder,
} from '@/lib/notifications'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { type } = body

    console.log(`[cron-notifications] Processing: ${type}`)

    switch (type) {
      case 'stop-reminder':
        await notifyBrokerStopReminder(body.brokerId, body.plateNumber)
        break

      case 'store-sale-reminder':
        await notifyBrokerStoreSaleReminder(body.brokerId, body.storeName)
        break

      case 'admin-pending-sale':
        await notifyAdminPendingStoreSale(body.brokerName, body.storeName, body.hours)
        break

      case 'credit-exceeded-broker':
        await notifyBrokerCreditExceeded15Days(body.brokerId, body.customerName)
        break

      case 'credit-exceeded-admin':
        await notifyAdminCreditDaysExceeded(body.customerName)
        break

      case 'low-fuel-admin':
        await notifyAdminLowDieselBalance(body.stationName, body.balance)
        break

      case 'driver-stop-reminder':
        await notifyDriverStopReminder()
        break

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, type })
  } catch (error) {
    console.error('[cron-notifications] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
