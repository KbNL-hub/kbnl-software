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
  const values = new Uint32Array(5)
  crypto.getRandomValues(values)
  return Array.from(values).map(v => (v % 10).toString()).join('')
}
