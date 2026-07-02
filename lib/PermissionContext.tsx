"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from "react"
import { supabase } from "./supabase"
import { getAdminSections, getEffectiveAccess, type EffectiveAccess, type SectionKey } from "./permissions"

interface PermissionContextType {
  userRoles: string[]
  activeRole: string | null
  setActiveRole: (role: string | null) => void
  userId: string
  sections: SectionKey[]
  getAccess: (sectionKey: string) => EffectiveAccess
  loading: boolean
}

const PermissionContext = createContext<PermissionContextType | null>(null)

export function PermissionProvider({ userId, defaultRole, children }: { userId: string; defaultRole?: string; children: ReactNode }) {
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [activeRole, setActiveRole] = useState<string | null>(defaultRole || null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchRoles() {
      setLoading(true)
      setUserRoles([])

      try {
        const { data, error } = await supabase
          .from("UserRoles")
          .select("role")
          .eq("user_id", userId)

        if (error) throw error

        let roles = data?.map((r) => r.role) ?? []

        if (roles.length === 0) {
          const { data: profile, error: profileError } = await supabase
            .from("Profiles")
            .select("role")
            .eq("user_id", userId)
            .single()

          if (profileError && profileError.code !== "PGRST116") throw profileError
          if (profile?.role) roles = [profile.role]
        }

        if (!cancelled) {
          setUserRoles(roles)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchRoles()

    return () => {
      cancelled = true
    }
  }, [userId])

  const effectiveRoles = useMemo(() => {
    return activeRole ? [activeRole] : userRoles
  }, [activeRole, userRoles])

  const sections = useMemo(() => {
    return loading ? [] : getAdminSections(effectiveRoles)
  }, [loading, effectiveRoles])

  const getAccess = useCallback((sectionKey: string): EffectiveAccess => {
    return getEffectiveAccess(effectiveRoles, sectionKey)
  }, [effectiveRoles])

  return (
    <PermissionContext.Provider value={{ userRoles, activeRole, setActiveRole, userId, sections, getAccess, loading }}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermissions() {
  const ctx = useContext(PermissionContext)
  if (!ctx) throw new Error("usePermissions must be used within PermissionProvider")
  return ctx
}
