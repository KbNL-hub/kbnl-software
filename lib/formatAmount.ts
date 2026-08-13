export function formatAmount(value: string): string {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("en-NG")
}

export function parseAmount(value: string | undefined | null): number {
  return Number((value ?? "").replace(/[^\d]/g, ""))
}