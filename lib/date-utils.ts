export function toISOString(date: Date = new Date()): string {
  return date.toISOString()
}

export function saleDateWithTime(dateStr: string): string {
  const now = new Date()
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()))
  return date.toISOString()
}
