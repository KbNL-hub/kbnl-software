export type TransactionEvent = {
  id: string
  kind: "sale" | "supply"
  store_name: string
  total_quantity: number
  timestamp: string
}

/**
 * Reconstructs the stock balance after each sale by walking the transaction
 * history forward from a computed initial balance.
 *
 * Initial balance per store = current_balance - total_supplies + total_sales
 * Then we walk chronologically: supplies add, sales subtract.
 *
 * Uses current total_quantity values (which reflect any edits) so the
 * final balance is consistent with the real current stock.
 */
export function calculateStockBalances(
  events: TransactionEvent[],
  currentBalanceByStore: Map<string, number>
): Map<string, number> {
  const byStore = new Map<string, TransactionEvent[]>()

  for (const evt of events) {
    const arr = byStore.get(evt.store_name) || []
    arr.push(evt)
    byStore.set(evt.store_name, arr)
  }

  const result = new Map<string, number>()

  for (const [storeName, storeEvents] of byStore) {
    const currentBalance = currentBalanceByStore.get(storeName) ?? 0

    let totalSales = 0
    let totalSupplies = 0
    for (const evt of storeEvents) {
      if (evt.kind === "sale") totalSales += evt.total_quantity
      else totalSupplies += evt.total_quantity
    }

    const initialBalance = currentBalance - totalSupplies + totalSales

    storeEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    let running = initialBalance
    for (const evt of storeEvents) {
      if (evt.kind === "supply") {
        running += evt.total_quantity
      } else {
        running -= evt.total_quantity
        result.set(evt.id, running)
      }
    }
  }

  return result
}
