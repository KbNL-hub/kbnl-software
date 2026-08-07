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
  const inFlight = useRef(false)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const clearPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const runCallback = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await savedCallback.current()
    } finally {
      inFlight.current = false
    }
  }, [])

  const startPolling = useCallback(() => {
    clearPolling()
    if (!enabled) return
    intervalRef.current = setInterval(() => {
      void runCallback()
    }, intervalMs)
  }, [intervalMs, enabled, clearPolling, runCallback])

  useEffect(() => {
    if (!enabled) return

    if (document.hidden) {
      wasHidden.current = true
    } else {
      startPolling()
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        wasHidden.current = true
        clearPolling()
      } else if (wasHidden.current) {
        wasHidden.current = false
        void runCallback()
        startPolling()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearPolling()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, startPolling, clearPolling, runCallback])
}
