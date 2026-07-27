import { supabase } from "./supabase"

export const STORE_LOCATIONS = [
  "Calabar Mini Depot", "Ikom Mini Depot", "Ogoja Depot", "Uyo Depot",
  "Brooks Outlet", "Urua Ekpa Outlet", "Urua Nyemeiko Outlet", "Reserve Store", "E1 Outlet", "Ogoja Outlet",
]

let cachedStores: string[] | null = null

export async function fetchStores(): Promise<string[]> {
  if (cachedStores) return cachedStores
  try {
    const { data } = await supabase
      .from("stores")
      .select("store_name")
      .order("store_name", { ascending: true })
    if (data && data.length > 0) {
      cachedStores = data.map(s => s.store_name)
      return cachedStores
    }
  } catch { /* fallback */ }
  return STORE_LOCATIONS
}

export function invalidateStoreCache() {
  cachedStores = null
}
