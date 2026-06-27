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

export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = 'KbNL-'
  const values = new Uint32Array(5)
  crypto.getRandomValues(values)
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(values[i] % chars.length)
  }
  return result
}
