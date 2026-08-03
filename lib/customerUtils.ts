import { supabase } from "./supabase"

export async function generateCustomerId(): Promise<string> {
  const { data, error } = await supabase
    .from("Customers")
    .select("customer_id")
    .like("customer_id", "CUST-%")
    .order("customer_id", { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return "CUST-0001"
  }

  const lastId = data[0].customer_id
  const match = lastId.match(/^CUST-(\d+)$/)
  if (!match) {
    return "CUST-0001"
  }

  const num = parseInt(match[1], 10) + 1
  return `CUST-${String(num).padStart(4, "0")}`
}
