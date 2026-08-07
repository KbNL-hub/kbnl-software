export function includes<T extends readonly string[]>(
  arr: T,
  value: string
): value is T[number] {
  return (arr as readonly string[]).includes(value)
}
