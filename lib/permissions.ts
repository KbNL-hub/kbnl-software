import { Role } from "./roles"

export type AccessLevel = 'view' | 'write' | 'authorize'

export interface RoleConfig {
  sections: string[]
  access: AccessLevel
  label: string
}

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
  'complaints',
  'reports',
  'company-prices',
  'store-sales',
  'side-trips',
] as const

export type SectionKey = (typeof ALL_SECTIONS)[number]

export const ROLES: Partial<Record<Role, RoleConfig>> = {
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
      'manage-brokers', 'customer-payments', 'credit',
      'reports', 'complaints', 'invite-users',
    ],
    access: 'write',
    label: 'Desk Officer',
  },
  [Role.ATCOfficer]: {
    sections: [
      'manage-drivers', 'monitor-trips', 'add-truck',
      'monitor-trucks', 'manage-trucks', 'truck-officers',
      'tricycles', 'diesel-manager', 'reports', 'side-trips',
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
  [Role.StationManager]: '/station-manager',
  [Role.TruckOfficer]: '/truck-officer',
  [Role.StoreOfficer]: '/store-officer',
  [Role.CashOfficer]: '/cash-officer',
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

    if (config.access === 'write') {
      canEdit = true
    }

    if (config.access === 'authorize') {
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
