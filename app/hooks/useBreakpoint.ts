"use client"

import { useState, useEffect } from "react"

type Breakpoint = "mobile" | "tablet" | "desktop"

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop")

  useEffect(() => {
    function update() {
      const w = window.innerWidth
      if (w < 640) setBreakpoint("mobile")
      else if (w < 1024) setBreakpoint("tablet")
      else setBreakpoint("desktop")
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return breakpoint
}