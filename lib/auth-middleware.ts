import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from './api-error'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface AuthContext {
  userId: string
  roles: string[]
  primaryRole: string
}

export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid authorization header')
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    throw ApiError.unauthorized('Invalid or expired token')
  }

  const roles = await getUserRoles(user.id)
  const primaryRole = roles[0] || 'Driver'

  return { userId: user.id, roles, primaryRole }
}

export async function requireRole(
  req: NextRequest,
  allowedRoles: string[]
): Promise<AuthContext> {
  const auth = await requireAuth(req)

  const hasRole = auth.roles.some(r => allowedRoles.includes(r))
  if (!hasRole) {
    throw ApiError.forbidden(
      `Access denied. Requires one of: ${allowedRoles.join(', ')}`
    )
  }

  return auth
}

async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('UserRoles')
    .select('role')
    .eq('user_id', userId)
    .order('role', { ascending: true })

  if (data && data.length > 0) {
    return data.map(r => r.role)
  }

  const { data: profile } = await supabaseAdmin
    .from('Profiles')
    .select('role')
    .eq('user_id', userId)
    .single()

  return profile?.role ? [profile.role] : []
}

export function handleApiError(err: unknown) {
  console.error('API Error:', err)

  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status }
    )
  }

  return NextResponse.json(
    { error: 'Internal server error', code: 'SERVER_ERROR' },
    { status: 500 }
  )
}
