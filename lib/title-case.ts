export function toTitleCase(s: string): string {
  return s.replace(/\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
}
