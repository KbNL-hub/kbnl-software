"use client"

import { useEffect, useCallback, useRef } from "react"

/**
 * A polling hook that pauses when the tab is hidden and
 * immediately refetches when the tab becomes visible again.
 *
 * This prevents:
 * - Timer accumulation when the tab is backgrounded
 * - Frozen loaders when returning to the tab
 * - Wasted network requests in hidden tabs
 */
export function usePolling(
  callback: () => void | Promise<unknown>,
  intervalMs: number,
  enabled = true,
) {
  const savedCallback = useRef(callback)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasHidden = useRef(false)

  savedCallback.current = callback

  const clearPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    clearPolling()
    if (!enabled) return
    intervalRef.current = setInterval(() => {
      savedCallback.current()
    }, intervalMs)
  }, [intervalMs, enabled, clearPolling])

  useEffect(() => {
    if (!enabled) return

    startPolling()

    function handleVisibilityChange() {
      if (document.hidden) {
        wasHidden.current = true
        clearPolling()
      } else if (wasHidden.current) {
        wasHidden.current = false
        savedCallback.current()
        startPolling()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearPolling()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, startPolling, clearPolling])
}
