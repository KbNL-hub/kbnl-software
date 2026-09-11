export interface ATF {
  request_id: string
  atf_code?: string
  plate_number: string
  driver_id: string
  company_id: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre?: number | null
  total_amount?: number | null
  initiated_by?: string
  invalidation_reason?: string
  driver_name?: string
  company_name?: string
}

export interface MaintenanceReport {
  report_id: string
  plate_number: string
  manager_id: string
  maintenance_type: string
  maintenance_location: string | null
  amount: number
  notes: string | null
  status: string
  rejection_reason: string | null
  reported_at: string
  manager_name?: string
}

export interface MaintenanceDeposit {
  deposit_id: string
  amount: number
  note: string | null
  deposited_by: string
  created_at: string
}

export interface BulkProcurement {
  procurement_id: string
  item_name: string
  total_amount: number
  notes: string | null
  logged_at: string
  distributions?: { plate_number: string; amount_allocated: number }[]
}

export interface Trip {
  trip_id: string
  plate_number: string
  material_centre?: string
  ATC?: string
  order_no?: string
  child_order_no?: string
  driver_id?: string
  status?: string
  recorded?: boolean
  posted?: boolean
}

export interface Stop {
  stop_id: string
  trip_id: string
  customer_id?: string
  quantity_offloaded: number
  stop_location: string
  stop_time: string
  confirmed?: boolean
  disputed?: boolean
  broker_id?: string
}

export interface FuelDeposit {
  deposit_id: string
  company_id: string
  amount: number
  note: string | null
  deposited_at: string
  status: string
  confirmed_at?: string
  declined_at?: string
}

export interface Driver {
  driver_id: string
  full_name: string
  profile_picture_url?: string
}

export interface TruckAdmin {
  admin_id: string
  full_name: string
}

export interface StationManager {
  manager_id: string
  full_name: string
  company_id: string
}

export interface Sale {
  sale_id: string
  product: string
  quantity: number
  price_per_bag: number
  total_amount: number
  customer_name: string | null
  payment_mode: string | null
  delivery_mode: string | null
  tricycle_id: string | null
  truck_plate: string | null
  sold_at: string
  broker_id: string | null
  status: string
  tricycle_number?: string | null
  broker_name?: string | null
}

export interface NewBooking {
  id: string
  broker_id: string
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  area: string
  product: string
  location: string
  number_of_bags: number
  rate_per_bag: number
  total_amount: number
  payment_date: string
  status: "pending" | "awaiting_review" | "rejected" | "supplied" | "partial"
  price_reason: string | null
  company_price: number | null
  supply_date: string | null
  supplied_by: string | null
  bags_supplied: number
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  broker_name?: string
}

export interface BookingSupplyEvent {
  id: string
  booking_id: string
  bags_supplied: number
  supply_date: string
  supplied_by: string | null
  created_at: string
}
