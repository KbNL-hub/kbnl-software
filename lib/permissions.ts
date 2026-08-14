import { Role } from "./roles"

export type AccessLevel = 'view' | 'write' | 'authorize'

export const ALL_SECTIONS = [
  'manage-users',
  'invite-users',
  'add-truck',
  'manage-brokers',
  'manage-drivers',
  'manage-trucks',
  'station-managers',
  'truck-officers',
  'truck-admins',
  'store-officers',
  'cash-officers',
  'tricycles',
  'monitor-trucks',
  'monitor-trips',
  'diesel-manager',
  'customer-payments',
  'credit',
  'cash-expenses',
  'transactions',
  'desk-expenses',
  'complaints',
  'reports',
  'company-prices',
  'store-sales',
  'discounts',
  'side-trips',
  'our-stores',
  'trips',
] as const

export type SectionKey = (typeof ALL_SECTIONS)[number]

export interface RoleConfig {
  sections: string[]
  access: AccessLevel
  label: string
  sectionAccess?: Partial<Record<SectionKey, AccessLevel>>
}

export const ROLES: { [key: string]: RoleConfig | undefined } & Partial<Record<Role, RoleConfig>> = {
  [Role.Admin]: {
    sections: [...ALL_SECTIONS],
    access: 'write',
    label: 'Admin',
  },
  [Role.SuperAdmin]: {
    sections: [...ALL_SECTIONS],
    access: 'write',
    label: 'Super Admin',
  },
  [Role.Supervisor]: {
    sections: [...ALL_SECTIONS],
    access: 'view',
    label: 'Supervisor',
  },
  [Role.CashAuthorizer]: {
    sections: ['cash-expenses'],
    access: 'authorize',
    label: 'Cash Authorizer',
  },
  [Role.Broker]: {
    sections: [
      'add-truck', 'manage-brokers',
      'monitor-trucks', 'manage-trucks', 'manage-drivers',
      'monitor-trips', 'complaints', 'diesel-manager',
      'tricycles', 'cash-expenses', 'customer-payments',
      'credit', 'reports', 'invite-users',
    ],
    access: 'write',
    label: 'Broker',
  },
  [Role.TruckAdmin]: {
    sections: [
      'monitor-trucks', 'manage-trucks', 'truck-officers',
      'truck-admins', 'tricycles', 'complaints',
      'diesel-manager', 'reports', 'side-trips',
    ],
    access: 'write',
    label: 'Truck Admin',
  },
  [Role.DeskOfficer]: {
    sections: [
      'customer-payments', 'credit',
      'reports', 'complaints', 'store-sales', 'our-stores',
      'desk-expenses', 'trips',
    ],
    access: 'write',
    label: 'Desk Officer',
    sectionAccess: {
      'our-stores': 'view',
    },
  },
  [Role.ATCOfficer]: {
    sections: [
      'manage-drivers', 'monitor-trips',
      'monitor-trucks', 'manage-trucks', 'truck-officers',
      'tricycles', 'diesel-manager', 'reports', 'side-trips',
      'company-prices',
    ],
    access: 'write',
    label: 'ATC Officer',
  },
  [Role.Driver]: {
    sections: [],
    access: 'write',
    label: 'Driver',
  },
  [Role.StationManager]: {
    sections: [],
    access: 'write',
    label: 'Station Manager',
  },
  [Role.TruckOfficer]: {
    sections: [],
    access: 'write',
    label: 'Truck Officer',
  },
  [Role.StoreOfficer]: {
    sections: [],
    access: 'write',
    label: 'Store Officer',
  },
  [Role.CashOfficer]: {
    sections: [],
    access: 'write',
    label: 'Cash Officer',
  },
  [Role.StoreSupervisor]: {
    sections: [],
    access: 'write',
    label: 'Store Supervisor',
  },
}

export const ROLE_DASHBOARDS: Record<Role, string> = {
  [Role.SuperAdmin]: '/admin',
  [Role.Supervisor]: '/admin',
  [Role.CashAuthorizer]: '/admin',
  [Role.Broker]: '/admin',
  [Role.TruckAdmin]: '/truck-admin',
  [Role.DeskOfficer]: '/admin',
  [Role.ATCOfficer]: '/admin',
  [Role.Admin]: '/admin',
  [Role.Driver]: '/driver',
  // DORMANT: Station manager role removed from the fuel flow. The dashboard
  // script is kept in the codebase but is no longer routed to.
  [Role.StationManager]: '/login',
  [Role.TruckOfficer]: '/truck-officer',
  [Role.StoreOfficer]: '/store-officer',
  [Role.CashOfficer]: '/cash-officer',
  [Role.StoreSupervisor]: '/store-supervisor',
}

export function getRoleDashboard(role: string): string {
  return ROLE_DASHBOARDS[role as Role] || '/login'
}

export interface EffectiveAccess {
  canView: boolean
  canEdit: boolean
  canAuthorize: boolean
}

export function getEffectiveAccess(
  userRoles: string[],
  sectionKey: string,
): EffectiveAccess {
  let canView = false
  let canEdit = false
  let canAuthorize = false

  for (const userRole of userRoles) {
    const config = ROLES[userRole as Role]
    if (!config) continue

    if (!config.sections.includes(sectionKey)) continue

    canView = true

    const effectiveAccess = config.sectionAccess?.[sectionKey as SectionKey] ?? config.access

    if (effectiveAccess === 'write') {
      canEdit = true
    }

    if (effectiveAccess === 'authorize') {
      canAuthorize = true
    }
  }

  return { canView, canEdit, canAuthorize }
}

export function getAdminSections(userRoles: string[]): SectionKey[] {
  const sectionSet = new Set<SectionKey>()

  for (const userRole of userRoles) {
    const config = ROLES[userRole as Role]
    if (!config) continue

    for (const section of config.sections) {
      sectionSet.add(section as SectionKey)
    }
  }

  return ALL_SECTIONS.filter((s) => sectionSet.has(s))
}
