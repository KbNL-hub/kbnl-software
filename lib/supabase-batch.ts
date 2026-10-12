import type { PostgrestError } from "@supabase/supabase-js"

// PostgREST encodes every value in an `.in()` filter straight into the query
// string. A few hundred UUIDs is enough to push the request URL past the HTTP
// header limit, at which point the request fails outright. Chunking keeps each
// request comfortably small regardless of how many rows the app has accumulated.
export const IN_CHUNK_SIZE = 150

export function chunk<T>(items: T[], size = IN_CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type SelectResult<TRow> = {
  data: TRow[] | null
  error: PostgrestError | null
}

/**
 * Runs a PostgREST `.select()` whose `.in()` filter is split into batches, and
 * merges the results. `build` receives one batch of ids and must return the
 * query promise for it.
 *
 * Unlike a bare `const { data } = await supabase...`, this never discards the
 * error: a failed batch is reported instead of silently yielding an empty list,
 * so a dropped request can't masquerade as "this data does not exist".
 */
export async function selectInChunks<TRow>(
  build: (ids: string[]) => PromiseLike<SelectResult<TRow>>,
  ids: string[],
  size = IN_CHUNK_SIZE,
): Promise<{ data: TRow[]; error: PostgrestError | null; failedBatches: number }> {
  const rows: TRow[] = []
  let firstError: PostgrestError | null = null
  let failedBatches = 0

  for (const batch of chunk(ids, size)) {
    const { data, error } = await build(batch)
    if (error) {
      failedBatches += 1
      if (!firstError) firstError = error
      continue
    }
    if (data) rows.push(...data)
  }

  return { data: rows, error: firstError, failedBatches }
}
