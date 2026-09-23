import { supabase } from './supabase'

export async function getUserRoles(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('UserRoles')
    .select('role')
    .eq('user_id', userId)

  if (error) throw error
  return data?.map((r) => r.role) || []
}

export async function getPrimaryRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('Profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data?.role || null
}

export async function requireDashboardRole(
  userId: string,
  requiredRole: string
): Promise<boolean> {
  const roles = await getUserRoles(userId)
  if (roles.length === 0) {
    const primaryRole = await getPrimaryRole(userId)
    return primaryRole === requiredRole
  }
  return roles.includes(requiredRole)
}

export function generateTempPassword(): string {
  const passwordRange = 1_000_000
  const randomRange = 0x1_0000_0000
  const rejectionLimit = Math.floor(randomRange / passwordRange) * passwordRange
  const values = new Uint32Array(1)

  do {
    crypto.getRandomValues(values)
  } while (values[0] >= rejectionLimit)

  return (values[0] % passwordRange).toString().padStart(6, "0")
}
