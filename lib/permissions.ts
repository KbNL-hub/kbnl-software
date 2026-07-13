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
] as const

export type SectionKey = (typeof ALL_SECTIONS)[number]

export const ROLES: Record<string, RoleConfig> = {
  Admin: {
    sections: [...ALL_SECTIONS],
    access: 'write',
    label: 'Admin',
  },
  SuperAdmin: {
    sections: [...ALL_SECTIONS],
    access: 'write',
    label: 'Super Admin',
  },
  Supervisor: {
    sections: [...ALL_SECTIONS],
    access: 'view',
    label: 'Supervisor',
  },
  CashAuthorizer: {
    sections: ['cash-expenses'],
    access: 'authorize',
    label: 'Cash Authorizer',
  },
  Broker: {
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
  TruckAdmin: {
    sections: [
      'monitor-trucks', 'manage-trucks', 'truck-officers',
      'truck-admins', 'tricycles', 'complaints',
      'diesel-manager', 'reports',
    ],
    access: 'write',
    label: 'Truck Admin',
  },
  DeskOfficer: {
    sections: [
      'manage-brokers', 'customer-payments', 'credit',
      'reports', 'complaints', 'invite-users',
    ],
    access: 'write',
    label: 'Desk Officer',
  },
  ATCOfficer: {
    sections: [
      'manage-drivers', 'monitor-trips', 'add-truck',
      'monitor-trucks', 'manage-trucks', 'truck-officers',
      'tricycles', 'diesel-manager', 'reports',
    ],
    access: 'write',
    label: 'ATC Officer',
  },
  Driver: {
    sections: [],
    access: 'write',
    label: 'Driver',
  },
  StationManager: {
    sections: [],
    access: 'write',
    label: 'Station Manager',
  },
  TruckOfficer: {
    sections: [],
    access: 'write',
    label: 'Truck Officer',
  },
  StoreOfficer: {
    sections: [],
    access: 'write',
    label: 'Store Officer',
  },
  CashOfficer: {
    sections: [],
    access: 'write',
    label: 'Cash Officer',
  },
}

export const ROLE_DASHBOARDS: Record<string, string> = {
  SuperAdmin: '/admin',
  Supervisor: '/admin',
  CashAuthorizer: '/admin',
  Broker: '/admin',
  TruckAdmin: '/truck-admin',
  DeskOfficer: '/admin',
  ATCOfficer: '/admin',
  Admin: '/admin',
  Driver: '/driver',
  StationManager: '/station-manager',
  TruckOfficer: '/truck-officer',
  StoreOfficer: '/store-officer',
  CashOfficer: '/cash-officer',
}

export function getRoleDashboard(role: string): string {
  return ROLE_DASHBOARDS[role] || '/login'
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

  for (const role of userRoles) {
    const config = ROLES[role]
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

  for (const role of userRoles) {
    const config = ROLES[role]
    if (!config) continue

    for (const section of config.sections) {
      sectionSet.add(section as SectionKey)
    }
  }

  return ALL_SECTIONS.filter((s) => sectionSet.has(s))
}
