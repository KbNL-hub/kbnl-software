# KbNL Logistics System — Project State
*Last updated: current session*

## Stack
- Next.js (no src/ folder), Supabase, Vercel
- Repo: Private GitHub → https://truck-system-ten.vercel.app
- Inline styles throughout (no CSS framework except Tailwind imported but unused)
- `app/hooks/useBreakpoint.ts` — mobile/tablet/desktop breakpoint hook

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
admin/page.tsx
broker/page.tsx
driver/page.tsx
login/page.tsx
store-officer/page.tsx
station-manager/page.tsx
maintenance-manager/page.tsx  ← TruckOfficer dashboard
truck-admin/page.tsx
auth/callback/page.tsx
hooks/useBreakpoint.ts
page.tsx (redirects to /login)
components/
  admin/
    AddTruck.tsx, AddDriver.tsx, ManageBrokers.tsx
    MonitorTrucks.tsx, ManageTrucks.tsx, ManageDrivers.tsx
    MonitorTrips.tsx, DieselManager.tsx, StationManagers.tsx
    TruckOfficers.tsx, TruckAdmins.tsx, StoreOfficers.tsx
    Reports.tsx, Complaints.tsx
  BrokerDropdown.tsx
  BuyDiesel.tsx  ← BEING REPLACED by ATF flow
  CustomerSelector.tsx
  OfficeClerkPanel.tsx  ← Reusable cash expenses panel (used by /office-clerk and /broker dual-role)
  StopForm.tsx
lib/
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

---

## Supabase Enums
- `product` → get_products() RPC
- `Centres` → get_material_centres() RPC (pure enum, no table)
- Truck status: Empty, Loaded, Need Repairs, Decommissioned
- Trip status: In transit, On hold, Completed
- Driver status: Invited, Active, Suspended

---

## Loading Points
Factory: Lafarge (Unicem) → [Classic, Supaset]
Dangote BOCO → [Falcon, 3X]
Depot:   Calabar Mini Depot, Ikom Mini Depot, Ogoja Warehouse, Uyo Depot, Calabar Warehouse
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
   - Station Manager: pill colors, input borders
   - Truck Admin: tab vs filter pill differentiation, bleeding text
   - Truck Officer: same tab/filter issue, button overflow
   - Global: select caret breathing room
   - Admin dashboard full responsive pass (after above) - DONE
3. **Super Admin (MD) role** — read-only, mobile/tablet-first dashboard
4. **Reports** — store sales, cash transactions, ATF fuel costs once new features land

---

## Notes
- `color-scheme: light only` in globals.css forces light mode regardless of OS
- All explicit text uses #171717, backgrounds use white — dark mode proof
- Primary color is #0070f3
- Modals: sheet (bottom) on mobile, centered on desktop
- Min touch target: 48px height on all interactive elements
- Iconify (@iconify/react) installed for admin sidebar icons
- xlsx installed for report exports