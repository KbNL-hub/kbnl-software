# KbNL Company Operation Management System — Project State
*Last updated: current session*

## Stack
- Next.js (no src/ folder), Supabase, Vercel
- Repo: Private GitHub → https://truck-system-ten.vercel.app
- Inline styles throughout (no CSS framework except Tailwind imported but unused)
- `app/hooks/useBreakpoint.ts` — mobile/tablet/desktop breakpoint hook
- `app/hooks/useOfflineTripAction.ts` - Offline sync for drivers
- `app/hooks/usePWAInstall.ts` - PWA app install prompt hook

## Environment Variables
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_APP_URL

---

## Roles
Admin, Driver, Broker, StationManager, TruckOfficer, TruckAdmin, StoreOfficer, OfficeClerk
- Login routing: each role → /[role-slug]
- Auth callback sets status → Active for non-Admin/Broker roles
- Invite flow: /api/invite-user handles all roles

## Folder Structure
app/
  (dashboards)
    admin/page.tsx
    broker/page.tsx
    driver/page.tsx
    login/page.tsx
    store-officer/page.tsx
    station-manager/page.tsx
    truck-officer/page.tsx
    truck-admin/page.tsx
    api/invite-user/route.ts
    auth/callback/page.tsx
    hooks/useBreakpoint.ts
    page.tsx (redirects to /login)
components/
  admin/
    AddTruck.tsx, AddDriver.tsx, ManageBrokers.tsx
    MonitorTrucks.tsx, ManageTrucks.tsx, ManageDrivers.tsx
    MonitorTrips.tsx, DieselManager.tsx, StationManagers.tsx
    TruckOfficers.tsx, TruckAdmins.tsx, StoreOfficers.tsx
    Reports.tsx, Complaints.tsx, CashTransactions.tsx, CustomerPayments.tsx
    DataTable.tsx, DateRangeSelector.tsx, EmptyState.tsx, ExportActions.tsx, LoadingState.tsx
    OfficeClerks.tsx, QuickFilterPills.tsx, ReassignBroker.tsx, ReportCard.tsx
    ReportModal.tsx, Tricycles.tsx, 
  BrokerDropdown.tsx
  BuyDiesel.tsx  ← BEING REPLACED by ATF flow
  CustomerSelector.tsx
  CustomerPayments.tsx
  ModernInput.tsx
  PWAInstallPrompt.tsx
  OfficeClerkPanel.tsx  ← Reusable cash expenses panel (used by /office-clerk and /broker dual-role)
  StopForm.tsx
  SplashScreen.tsx
  TripOfflineIndicator.tsx
lib/
  offline/
    tripActionSync.ts
    tripsDb.ts
  supabase.ts
  formatAmount.ts

---

## Database Tables

### Core
- `Profiles` — user_id, role, full_name, phone_number
- `Trucks` — plate_number (PK), kbnl_truck_no, truck_model, capacity, tonnage, status, fuel_balance
- `Drivers` — driver_id, full_name, phone_number, status
- `Brokers` — broker_id, broker_name, phone_number
- `Customers` — customer_id, full_name, phone_number
- `Trips` — trip_id, plate_number, driver_id, product, material_centre, loaded_quantity, ATC, trip_status, route_points (TEXT[]), created_at, updated_at
- `Stops` — stop_id, trip_id, broker_id (nullable), customer_id, quantity_offloaded, stop_location, store_name, latitude, longitude, stop_time, confirmed, disputed, dispute_reason, disputed_by, updated_by
- `Stop_Confirmations` — confirmation_id, stop_id, broker_id, customer_id, price_per_bag, confirmed_at
- `trip_discrepancies` — discrepancy_id, trip_id, driver_id, shortage, caked_bags, notes, drop_location, reported_at

### Fuel (ATF — IN PROGRESS)
- `fuel_requests` — request_id (UUID PK), plate_number, driver_id, company_id, litres, atf_code, atf_status (Pending/Authorised/Dispensed/Confirmed/Invalidated), initiated_by (TruckOfficer), authorised_by (TruckAdmin), rate_per_litre, total_amount (generated), dispensed_at, confirmed_at, confirmed_by, invalidated_at, invalidation_reason, requested_at
- `fuel_companies` — company_id, company_name, current_balance, low_balance_threshold
- `fuel_deposits` — deposit_id, company_id, amount, note, deposited_at
- `station_managers` — manager_id, full_name, phone_number, company_id, status
- `truck_fuel_expenses` — expense_id, manager_id, plate_number, trip_id, litres, notes, logged_at

### Maintenance
- `maintenance_assignments` — assignment_id, manager_id, plate_number (UNIQUE)
- `maintenance_reports` — report_id, manager_id, plate_number, maintenance_type, maintenance_location, amount, notes, status, rejection_reason, reported_at, validated_at, validated_by
- `maintenance_balance` — id (always 1), current_balance, low_balance_threshold, updated_at
- `maintenance_deposits` — deposit_id, amount, note, deposited_by, deposited_at
- `bulk_procurement` — procurement_id, item_name, total_amount, notes, logged_by, logged_at
- `procurement_distributions` — distribution_id, procurement_id, plate_number, amount_allocated

### Personnel
- `truck_officers` — manager_id (FK auth.users), full_name, phone_number, status
- `truck_admins` — admin_id (FK auth.users), full_name, phone_number, status
- `store_officers` — officer_id (FK auth.users), full_name, phone_number, store_name, status
- `office_clerks` — clerk_id (FK auth.users), full_name, phone_number, office_name, status ← NEW

### Store / Sales
- `store_stock` — stock_id, store_name, product, balance, updated_at
- `store_supply_confirmations` — confirmation_id, stop_id, officer_id, store_name, confirmed_at
- `store_supply_lines` — line_id, confirmation_id, product, quantity
- `store_sales` — sale_id, officer_id, store_name, product, quantity, price_per_bag, total_amount (generated), customer_name, payment_mode, sale_type (direct/tricycle), tricycle_id, sold_at
- `tricycles` — tricycle_id, tricycle_number, store_name, created_at ← NEW

### Cash Transactions ← NEW
- `cash_offices` — office_id, office_name (Uyo/Ikom/Calabar/Ogoja), current_balance
- `cash_expenses` — expense_id, office_name, clerk_id, title, total_amount, status (Pending/Authorised/Rejected), authorised_by, rejection_reason, created_at, resolved_at
- `cash_expense_items` — item_id, expense_id, item_name, amount
- `cash_deposits` — deposit_id, office_name, amount, note, deposited_by, deposited_at
- `admin_office_assignments` — admin_id (PK), office_name ← NEW

### Complaints
- `driver_complaints` — complaint_id, driver_id, trip_id, plate_number, complaint_type, notes, resolved, reported_at

### Complete database schema
- [
  {
    "table_name": "Brokers",
    "column_name": "broker_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "Brokers",
    "column_name": "broker_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "Brokers",
    "column_name": "phone_number",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Brokers",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Brokers",
    "column_name": "profile_picture_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Customers",
    "column_name": "customer_id",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "''::character varying",
    "key_type": "PK"
  },
  {
    "table_name": "Customers",
    "column_name": "full_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "''::character varying",
    "key_type": ""
  },
  {
    "table_name": "Customers",
    "column_name": "phone_number",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Customers",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Drivers",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "Drivers",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "Drivers",
    "column_name": "phone_number",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Drivers",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Drivers",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": "'Invited'::text",
    "key_type": ""
  },
  {
    "table_name": "Drivers",
    "column_name": "profile_picture_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Material Centre",
    "column_name": "centre_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "Material Centre",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Material Centre",
    "column_name": "centre_name",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Profiles",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "Profiles",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Profiles",
    "column_name": "role",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Profiles",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Profiles",
    "column_name": "phone_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Profiles",
    "column_name": "profile_picture_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stop_Confirmations",
    "column_name": "confirmation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "Stop_Confirmations",
    "column_name": "stop_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stop_Confirmations",
    "column_name": "broker_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stop_Confirmations",
    "column_name": "customer_id",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stop_Confirmations",
    "column_name": "price_per_bag",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stop_Confirmations",
    "column_name": "confirmed_at",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "stop_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "Stops",
    "column_name": "trip_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stops",
    "column_name": "broker_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": "gen_random_uuid()",
    "key_type": "FK"
  },
  {
    "table_name": "Stops",
    "column_name": "customer_id",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stops",
    "column_name": "quantity_offloaded",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "stop_time",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "stop_location",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "latitude",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "longitude",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "order_of_stops",
    "data_type": "smallint",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "confirmed",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false",
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "updated_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stops",
    "column_name": "disputed",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false",
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "dispute_reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "disputed_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "Stops",
    "column_name": "store_name",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Stops",
    "column_name": "stop_type",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "trip_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "Trips",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "''::character varying",
    "key_type": "FK"
  },
  {
    "table_name": "Trips",
    "column_name": "loaded_quantity",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "FK"
  },
  {
    "table_name": "Trips",
    "column_name": "trip_status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "material_centre",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'Lafarge Mfamosing'::\"Centres\"",
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "product",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "ATC",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "updated_at",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Trips",
    "column_name": "route_points",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": "'{}'::text[]",
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "''::character varying",
    "key_type": "PK"
  },
  {
    "table_name": "Trucks",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "capacity",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "truck_model",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "tonnage",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "kbnl_truck_no",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "''::character varying",
    "key_type": ""
  },
  {
    "table_name": "Trucks",
    "column_name": "fuel_balance",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "admin_office_assignments",
    "column_name": "admin_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "admin_office_assignments",
    "column_name": "admin_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "admin_office_assignments",
    "column_name": "office_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "bulk_procurement",
    "column_name": "procurement_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "bulk_procurement",
    "column_name": "item_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "bulk_procurement",
    "column_name": "total_amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "bulk_procurement",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "bulk_procurement",
    "column_name": "logged_by",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "bulk_procurement",
    "column_name": "logged_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "cash_deposits",
    "column_name": "deposit_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "cash_deposits",
    "column_name": "office_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_deposits",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_deposits",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_deposits",
    "column_name": "deposited_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "cash_deposits",
    "column_name": "deposited_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "cash_expense_items",
    "column_name": "item_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "cash_expense_items",
    "column_name": "expense_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "cash_expense_items",
    "column_name": "item_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_expense_items",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "expense_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "cash_expenses",
    "column_name": "office_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "clerk_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "cash_expenses",
    "column_name": "title",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "total_amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "status",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "'Pending'::character varying",
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "authorised_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "cash_expenses",
    "column_name": "rejection_reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "cash_expenses",
    "column_name": "resolved_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_offices",
    "column_name": "office_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "cash_offices",
    "column_name": "office_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "cash_offices",
    "column_name": "current_balance",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "cash_offices",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "payment_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "uuid_generate_v4()",
    "key_type": "PK"
  },
  {
    "table_name": "customer_payments",
    "column_name": "broker_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "customer_payments",
    "column_name": "bank_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "payment_date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "depositor_name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "customer_id",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "customer_payments",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Pending'::text",
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "posted_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "customer_payments",
    "column_name": "posted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "customer_payments",
    "column_name": "customer_name",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": "''::character varying",
    "key_type": ""
  },
  {
    "table_name": "driver_complaints",
    "column_name": "complaint_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "driver_complaints",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "driver_complaints",
    "column_name": "trip_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "driver_complaints",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "driver_complaints",
    "column_name": "complaint_type",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "driver_complaints",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "driver_complaints",
    "column_name": "reported_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "driver_complaints",
    "column_name": "resolved",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false",
    "key_type": ""
  },
  {
    "table_name": "fuel_companies",
    "column_name": "company_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "fuel_companies",
    "column_name": "company_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_companies",
    "column_name": "current_balance",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "fuel_companies",
    "column_name": "low_balance_threshold",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1000000",
    "key_type": ""
  },
  {
    "table_name": "fuel_companies",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "fuel_deposits",
    "column_name": "deposit_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "fuel_deposits",
    "column_name": "company_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_deposits",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_deposits",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_deposits",
    "column_name": "deposited_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "request_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "company_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "litres",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "rate_per_litre",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "requested_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "atf_code",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "initiated_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "authorised_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "dispensed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "confirmed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "confirmed_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "fuel_requests",
    "column_name": "invalidated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "invalidation_reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "atf_status",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "'Pending'::character varying",
    "key_type": ""
  },
  {
    "table_name": "fuel_requests",
    "column_name": "total_amount",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_assignments",
    "column_name": "assignment_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "maintenance_assignments",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "maintenance_assignments",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_assignments",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "maintenance_assignments",
    "column_name": "assigned_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "maintenance_balance",
    "column_name": "id",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "1",
    "key_type": "PK"
  },
  {
    "table_name": "maintenance_balance",
    "column_name": "current_balance",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "maintenance_balance",
    "column_name": "low_balance_threshold",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "maintenance_balance",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "maintenance_deposits",
    "column_name": "deposit_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "maintenance_deposits",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_deposits",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_deposits",
    "column_name": "deposited_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "maintenance_deposits",
    "column_name": "deposited_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "report_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "maintenance_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Pending'::text",
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "rejection_reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "reported_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "validated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "validated_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "maintenance_reports",
    "column_name": "maintenance_location",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "office_clerks",
    "column_name": "clerk_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "office_clerks",
    "column_name": "clerk_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "office_clerks",
    "column_name": "full_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "office_clerks",
    "column_name": "phone_number",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "office_clerks",
    "column_name": "office_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "office_clerks",
    "column_name": "status",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "'Invited'::character varying",
    "key_type": ""
  },
  {
    "table_name": "office_clerks",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "office_clerks",
    "column_name": "profile_picture_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "procurement_distributions",
    "column_name": "distribution_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "procurement_distributions",
    "column_name": "procurement_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "procurement_distributions",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "procurement_distributions",
    "column_name": "amount_allocated",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "station_managers",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "station_managers",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "station_managers",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "station_managers",
    "column_name": "phone_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "station_managers",
    "column_name": "company_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "station_managers",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Invited'::text",
    "key_type": ""
  },
  {
    "table_name": "station_managers",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "store_officers",
    "column_name": "officer_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "store_officers",
    "column_name": "officer_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "store_officers",
    "column_name": "full_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_officers",
    "column_name": "phone_number",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_officers",
    "column_name": "store_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_officers",
    "column_name": "status",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "'Invited'::character varying",
    "key_type": ""
  },
  {
    "table_name": "store_officers",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "store_officers",
    "column_name": "profile_picture_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "sale_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "store_sales",
    "column_name": "officer_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "store_sales",
    "column_name": "store_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "product",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "quantity",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "price_per_bag",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "total_amount",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "customer_name",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "payment_mode",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "sold_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "sale_type",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": "'direct'::character varying",
    "key_type": ""
  },
  {
    "table_name": "store_sales",
    "column_name": "tricycle_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "store_stock",
    "column_name": "stock_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "store_stock",
    "column_name": "store_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_stock",
    "column_name": "product",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_stock",
    "column_name": "balance",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "store_stock",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "store_supply_confirmations",
    "column_name": "confirmation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "store_supply_confirmations",
    "column_name": "stop_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "store_supply_confirmations",
    "column_name": "officer_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "store_supply_confirmations",
    "column_name": "store_name",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_supply_confirmations",
    "column_name": "confirmed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "store_supply_lines",
    "column_name": "line_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "store_supply_lines",
    "column_name": "confirmation_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "store_supply_lines",
    "column_name": "product",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "store_supply_lines",
    "column_name": "quantity",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "tricycles",
    "column_name": "tricycle_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "tricycles",
    "column_name": "tricycle_number",
    "data_type": "character varying",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "tricycles",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "tricycles",
    "column_name": "assigned_to",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "tricycles",
    "column_name": "phone_number",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "discrepancy_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "trip_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "shortage",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "caked_bags",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0",
    "key_type": ""
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "reported_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "trip_discrepancies",
    "column_name": "drop_location",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "key_type": ""
  },
  {
    "table_name": "truck_admins",
    "column_name": "admin_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "truck_admins",
    "column_name": "admin_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "truck_admins",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "truck_admins",
    "column_name": "phone_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "truck_admins",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Invited'::text",
    "key_type": ""
  },
  {
    "table_name": "truck_admins",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "expense_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()",
    "key_type": "PK"
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "plate_number",
    "data_type": "character varying",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "trip_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "litres",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "truck_fuel_expenses",
    "column_name": "logged_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": "now()",
    "key_type": ""
  },
  {
    "table_name": "truck_officers",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "FK"
  },
  {
    "table_name": "truck_officers",
    "column_name": "manager_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": "PK"
  },
  {
    "table_name": "truck_officers",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "truck_officers",
    "column_name": "phone_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "key_type": ""
  },
  {
    "table_name": "truck_officers",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Invited'::text",
    "key_type": ""
  },
  {
    "table_name": "truck_officers",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "key_type": ""
  }
]

---

## Supabase Enums
- `product` → get_products() RPC
- `Centres` → get_material_centres() RPC (pure enum, no table)
- Truck status: Empty, Loaded, Need Repairs, Decommissioned
- Trip status: In transit, On hold, Completed
- Driver status: Invited, Active, Suspended

---

## Loading Points
Factory: Lafarge Mfamosing → [Classic, Supaset]
Lafarge Uyo Warehouse → [Falcon, 3X]
Depot:   Calabar Mini Depot, Ikom Mini Depot, Ogoja Depot, Uyo Depot, Calabar Warehouse
Outlet:  Brooks Outlet, Urua Ekpa Outlet, Urua Nyemeiko Outlet, Reserve Store, E1 Outlet, Ogoja Outlet
Factory → ATC required. Factory products restricted by source.
Depot/Outlet → all products available.

---

## Key Patterns
- `formatAmount` / `parseAmount` from lib/formatAmount.ts — comma-formatted currency inputs
- useRef for Enter key navigation between fields
- Modals for all actions (slide-up sheet on mobile, centered on desktop)
- Filter pills on all list views
- Auto-refresh every 30s + manual refresh button
- Session expiry → redirect via onAuthStateChange
- GPS via navigator.geolocation (optional on stops)
- Service role key in /api/invite-user bypasses RLS

---

## RLS Status
✅ All tables secured as of last session
⚠️ New tables from this session need RLS (see pending section)

---

## ATF Flow (NEW — Now Completed)
1. TruckOfficer initiates → selects truck, driver, litres needed
2. TruckAdmin authorises → generates short ATF code (e.g. ATF-4K9X)
3. Driver sees modal teller with code (read-only, waiting)
4. StationManager sees card with truck/driver/litres → enters rate → "I've Dispensed"
5. Driver confirms receipt
6. StationManager can Invalidate if can't fulfill → flow restarts from step 1

ATF code format: ATF- + 4 random uppercase alphanumeric chars
One ATF per truck at a time (blocked if open ATF exists for that truck)

---

## Cash Transactions (NEW — COMPLETED)
- 4 offices: Uyo, Ikom, Calabar, Ogoja
- Each has own balance (seeded to DB)
- OfficeClerk role logs pending expenses with breakdown of items/amounts and running total
- OfficeClerk dashboard supports logging, details view, and cancellation of pending expenses
- Admin dashboard features Cash Transactions management, office selector, and read-only vs admin assignment controls
- Admin can deposit cash (add balance) and authorise/reject pending expenses for their assigned office
- Authorisation decreases office cash balance; rejection requires reason logging
- Clerk invite flow and status activation completed

---

## Dual Broker/OfficeClerk Role (NEW — COMPLETED)
- A single user can be both a Broker and an Office Clerk without needing two accounts
- Primary role stays `Broker` in Profiles table; a matching record in `office_clerks` enables the dual role
- Admin invite flow: inviting an OfficeClerk with an existing Broker's email inserts an `office_clerks` record with `status: Active` (no duplicate auth invite)
- Cash Expenses UI extracted into reusable `components/OfficeClerkPanel.tsx` (accepts clerkId, officeName, fullName props)
- `/office-clerk` page imports OfficeClerkPanel (standalone clerks)
- `/broker` page checks `office_clerks` on init; if record found, shows a toggle button in the header: "💼 Cash Expenses" / "📦 My Stops"
- Toggling switches between the Broker stops view and the full OfficeClerkPanel (log expenses, view history, cancel pending)
- Container width adapts: 520px for stops, 1000px for expenses table

---

## Tricycles (NEW — COMPLETED)
- Registered per store (tricycle_number, store_name)
- Store sales now have sale_type: direct | tricycle
- Tricycle sales: same visibility as regular sales
- Managed from admin panel (new section needed)

---

## Pending Work
1. **UI pass (partially done)**
   - Driver header buttons (replace emoji with Iconify, move to bottom) - DONE
   - Broker confirmation modal price input border - DONE
   - Store Officer: tab labels, stock card grid, header style, payment color coding - DONE
   - Station Manager: pill colors, input borders - DONE
   - Truck Admin: tab vs filter pill differentiation, bleeding text - DONE
   - Truck Officer: same tab/filter issue, button overflow - DONE
   - Global: select caret breathing room - DONE
   - Admin dashboard full responsive pass (after above) - DONE
3. **Super Admin (MD) role** — read-only, mobile/tablet-first dashboard
4. **Reports** — Broker reports

---

## Notes
- `color-scheme: light only` in globals.css forces light mode regardless of OS
- All explicit text uses #171717, backgrounds use white — dark mode proof
- Primary color is #0070f3
- Modals: sheet (bottom) on mobile, centered on desktop
- Min touch target: 48px height on all interactive elements
- Iconify (@iconify/react) installed for admin sidebar icons
- xlsx installed for report exports