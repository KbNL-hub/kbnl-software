export const Role = {
  Admin: "Admin",
  SuperAdmin: "SuperAdmin",
  Supervisor: "Supervisor",
  CashAuthorizer: "CashAuthorizer",
  Broker: "Broker",
  TruckAdmin: "TruckAdmin",
  DeskOfficer: "DeskOfficer",
  ATCOfficer: "ATCOfficer",
  Driver: "Driver",
  StationManager: "StationManager",
  TruckOfficer: "TruckOfficer",
  StoreOfficer: "StoreOfficer",
  CashOfficer: "CashOfficer",
  StoreSupervisor: "StoreSupervisor",
  CreditManager: "CreditManager",
} as const

export type Role = (typeof Role)[keyof typeof Role]

export const ROLE_LABELS: Record<Role, string> = {
  [Role.Admin]: "Admin",
  [Role.SuperAdmin]: "Super Admin",
  [Role.Supervisor]: "Supervisor",
  [Role.CashAuthorizer]: "Cash Authorizer",
  [Role.Broker]: "Broker",
  [Role.TruckAdmin]: "Truck Admin",
  [Role.DeskOfficer]: "Desk Officer",
  [Role.ATCOfficer]: "ATC Officer",
  [Role.Driver]: "Driver",
  [Role.StationManager]: "Station Manager",
  [Role.TruckOfficer]: "Truck Officer",
  [Role.StoreOfficer]: "Store Officer",
  [Role.CashOfficer]: "Cash Officer",
  [Role.StoreSupervisor]: "Store Supervisor",
  [Role.CreditManager]: "Credit Manager",
}

export function isRole(value: string): value is Role {
  return Object.values(Role).includes(value as Role)
}
