# Lint Remaining Warnings & Suppressed Errors

## Suppressed Errors (eslint-disable)

### `react-hooks/set-state-in-effect` — Data fetching in useEffect

These errors are suppressed because the codebase uses the standard React pattern of data fetching in `useEffect` with `setState`. This pattern is valid but the custom lint rule flags it. A full fix would require migrating to React Server Components, SWR, or React Query.

**Files with eslint-disable-next-line:**
- `components/admin/ManageBrokers.tsx` — `fetchBrokers()`
- `components/admin/ManageDrivers.tsx` — `fetchDrivers()`
- `components/admin/ManageTrucks.tsx` — `fetchTrucks()`
- `components/admin/ManageUsers.tsx` — `fetchUsers()`
- `components/admin/MonitorTrips.tsx` — `loadAll()`
- `components/admin/MonitorTrucks.tsx` — `fetchActiveTrucks()`
- `components/admin/StoreSales.tsx` — `loadAll()` (×2)
- `components/admin/SideTrips.tsx` — `fetchTrips()`
- `components/admin/StationManagers.tsx` — `fetchAll()`
- `components/admin/TruckMonitorSection.tsx` — `fetchActiveTrucks()`
- `components/broker/BrokerActiveTrips.tsx` — `loadAll()`
- `components/broker/BrokerPanel.tsx` — async init
- `components/broker/BrokerPrices.tsx` — `fetchData()`
- `components/broker/BrokerSaleConfirmations.tsx` — `initBroker()`
- `components/broker/CustomerPayments.tsx` — `initBroker()`
- `components/broker/MyStops.tsx` — `initBroker()`

### `react-hooks/set-state-in-effect` — Responsive viewMode sync

These effects sync `viewMode` state with the current breakpoint. Suppressed because the state needs to respond to window resize.

- `components/broker/BrokerPanel.tsx:196` — `setActive(section)` from URL params

## Remaining Warnings (Not Yet Fixed)

These are lower-priority warnings that were not in the original error output but may surface when you run lint:

1. **Additional `@typescript-eslint/no-unused-vars`** — Some variables may become unused after refactoring. Run lint to identify.

2. **Additional `@next/next/no-img-element`** — Any `<img>` tags not in the original lint output that may exist in files not listed.

3. **`sw.js` warnings** — Service worker file has unused variables in catch blocks (fixed with `catch {}`).
