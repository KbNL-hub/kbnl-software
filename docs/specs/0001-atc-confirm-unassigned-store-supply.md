# 0001. ATC confirmation of store supplies without an active store officer

**Date**: 2026-11-19
**Status**: Done

## Summary

Some stores have no active store officer, so their pending store stops never move and the trip cannot be recorded. This spec lets an ATC officer, Admin, or SuperAdmin confirm the supply from the trip details in Monitor Trips. The confirmation records the product breakdown, marks the stop confirmed, adds the bags to store stock, and stores the confirmer's name for audit. The app side is built and migration 065 is applied. The remaining rollout step is deploying the code.

## Context

The store officer dashboard is currently the only place where a store supply can be confirmed. That flow needs an active store officer for the store. Three stores have no active store officer today: Calabar Mini Depot, Reserve Store, and Ogoja Outlet. At the time of writing, Calabar Mini Depot has one pending store stop and Reserve Store has three. Those stops stay pending, and `record_trip` refuses to record a trip while any stop is unconfirmed. The trip is therefore stuck even though the bags were delivered.

The current confirmation is also not one operation. The store officer page inserts the confirmation, then inserts each product line, then updates the stop, then adjusts stock. Each step is a separate request. A failure in the middle leaves a half saved confirmation and a stop that may or may not be confirmed. Adding a second path that copies those steps would repeat the same weakness, and stock is money, so a partial write is not acceptable.

The audit shape is another gap. `store_supply_confirmations.officer_id` points at a store officer, so there is no place to record an ATC user. The business wants the confirmer's name shown in the app, not a raw user id. Existing store officer rows also have no stored display name, so they would need a backfill.

The decision is narrow: give ATC a way to clear a pending store stop only when the store has no active store officer, and do it in a way that either saves everything or saves nothing.

## Requirements

**User stories**:

- As an ATC officer, I want to confirm a pending store supply for a store with no active store officer from the trip details, so the trip can be recorded and finished.
- As an ATC officer, I want to enter the actual product breakdown and quantities, so store stock is credited correctly when the load is split across products.
- As an ATC officer, I want a required note when the entered total differs from the driver's offloaded quantity, so the difference is explained.
- As an Admin, I want to see who confirmed each supply by name, so I can audit confirmations made outside the store officer flow.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: A pending store stop at a store with no `store_officers` row whose status is `Active` shows a Confirm Supply action in the trip details to users with `ATCOfficer`, `Admin`, or `SuperAdmin`. The action is not shown to any other role.
- **AC-2**: The action opens a modal prefilled with the trip product and the stop's offloaded quantity, with a product selector and controls to add or remove product lines.
- **AC-3**: A valid submission writes one `store_supply_confirmations` row with `stop_id`, `store_name`, `confirmed_by`, `confirmed_by_name`, `confirmed_by_role`, and `officer_id` set to null, writes the matching `store_supply_lines`, sets the stop `confirmed` to true, and adds each line quantity to `store_stock` for the store, all in one transaction. If any part fails, nothing is saved.
- **AC-4**: If the entered total differs from `Stops.quantity_offloaded`, the request is rejected unless a non empty note is supplied, and the stored `discrepancy_quantity` equals the entered total minus the offloaded quantity.
- **AC-5**: The server rejects the request with a conflict error and makes no change when the store has an Active officer, the stop is already confirmed, the stop is disputed, or the trip is recorded or posted.
- **AC-6**: A repeated or concurrent confirm request cannot create a second confirmation or add the same bags to stock twice.
- **AC-7**: The action requires `ATCOfficer`, `Admin`, or `SuperAdmin`. Any other role receives a 403 and no change is made.
- **AC-8**: After a successful confirmation, the stop shows Confirmed, the trip list counters update, and Record Trip becomes available when every stop is confirmed and the other record rules are met.
- **AC-9**: Store Sales supply details show the confirmer's name, never a raw user id. Existing confirmations whose `officer_id` matches a `store_officers` row are backfilled with that officer's name and the role `StoreOfficer`. A row without a match falls back to the role label when the role is known, otherwise `Not recorded`.

## Options considered

### Option 1: Reuse the store officer steps inside Monitor Trips

Call the same inserts, stop update, and stock adjustments from a new modal in Monitor Trips.

**Pros**:
- No new database function.
- The existing payload shapes are already known.

**Cons**:
- Four or more separate requests can leave a half saved confirmation.
- Eligibility is enforced only in the browser unless more checks are added.
- It copies the weakest part of the current flow.

### Option 2: Add an atomic server action and a confirmation modal (chosen)

Add a `confirm_store_supply` action to the trips mutation route that calls one database function. The function locks the stop, checks eligibility, writes the confirmation and lines, updates the stop, and adjusts stock in one transaction. Add a modal in Monitor Trips and an eligibility read.

**Pros**:
- One transaction, so a failure leaves nothing behind.
- The server enforces the role and the no active officer rule.
- The actor name and role are recorded from trusted server data.
- The action sits on the exact stop that is stuck.

**Cons**:
- Needs a migration, a database function, and a new route.
- The old store officer flow keeps its own non atomic path.

### Option 3: Build a separate unassigned supply queue

Create a new screen that lists every pending store stop whose store has no active officer.

**Pros**:
- The work is visible in one place.
- A clerk can see the whole backlog without opening trips.

**Cons**:
- More screens to build and maintain.
- The action still needs to exist in the trip details for the user to see the stop context.
- The current backlog is four stops, so the extra screen adds little value now.

### Option 4: Let ATC confirm any pending store stop

Show the action for every pending store stop, even when an active officer exists.

**Pros**:
- The simplest rule to implement.
- ATC can always clear a stop without waiting for an officer.

**Cons**:
- It bypasses the store officer process and invites double confirmation.
- Two people can confirm the same supply, which risks double stock.
- It removes the owner of the process from the normal path.

## Decision

**Chosen option**: Option 2: Add an atomic server action and a confirmation modal.

The ATC confirmation will be a privileged server action backed by one database transaction, with the action shown only in Monitor Trips trip details and only for stores with no Active store officer.

## Rationale

Stock changes and stop state must move together. The current store officer flow shows what happens when they do not: the confirmation exists, the stop may still be pending, and stock may be short or double. A single database function removes that class of failure for the new path.

The action belongs inside the trip details because that is where the stuck stop and its offloaded quantity are visible. A separate queue would add a screen without removing the need to open the trip for context.

The override is deliberately narrow. An Active officer remains the primary owner of a store supply. ATC only steps in when no Active officer exists, and `Invited` or `Suspended` officers do not block the action, as agreed. The server repeats the check at confirmation time, so a newly activated officer wins the race.

Recording the actor is a business requirement, not a debug aid. The server derives the actor id, name, and role, and stores the name as a snapshot so later profile changes do not rewrite history.

## Feature design

**Data model sketch**:

- `store_supply_confirmations` gains three nullable columns: `confirmed_by` (uuid), `confirmed_by_name` (text), and `confirmed_by_role` (text). The existing `officer_id` stays nullable and stays populated for store officer confirmations.
- `store_supply_lines` is unchanged: `line_id`, `confirmation_id`, `product`, `quantity`.
- `Stops` is unchanged. `confirmed` moves from false to true.
- `store_stock` is unchanged. The function increments `(store_name, product)` and creates the row when the store has never held that product.
- Backfill: for each existing confirmation with an `officer_id` that matches a `store_officers` row, set `confirmed_by` to the officer id, `confirmed_by_name` to the officer's full name, and `confirmed_by_role` to `StoreOfficer`.

**State transitions**:

- Store stop: pending (not confirmed, not disputed) -> confirmed. This action does not move a stop out of disputed, and it does not touch a recorded or posted trip.
- Confirmation row: created once. This feature does not update or delete it.
- Trip: after every stop is confirmed and the other record rules pass, the trip can move to recorded.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/store-supply/eligibility` | GET | none | `{ active_officer_stores: string[] }` | Bearer, `ATCOfficer` or `Admin` or `SuperAdmin` | 401, 403, 500 |
| `/api/mutations/trips` with action `confirm_store_supply` | POST | `stop_id` (uuid, required), `lines` (array of `{ product: string, quantity: integer }`, required), `discrepancy_note` (string, required only when the total differs) | `{ confirmation_id, stop_id, store_name, total_quantity, discrepancy_quantity, confirmed_at, confirmed_by_name, confirmed_by_role }` | Bearer, `ATCOfficer` or `Admin` or `SuperAdmin` | 400 validation, 403 role, 404 stop, 409 conflict, 500 stock failure |

The eligibility route returns the stores that have an Active officer. The browser trims and lowercases both sides before comparing, and treats a store as eligible when its normalized name is not in that list. This keeps the payload small and makes an unknown store eligible by default, which is the correct behavior when no officer is assigned.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Show the action | list of stores with an active officer | `store_officers.store_name` where `status = 'Active'`, read by the eligibility route |
| Show the action | user may confirm | `UserRoles` through `requireRole`, and `usePermissions().userRoles` in the browser |
| Prefill a line | product | `selectedTrip.product`, which comes from `Trips.product` or `dd_trips.product` |
| Prefill a line | quantity | `Stops.quantity_offloaded` |
| Product options | list of products | `get_products()` database function |
| Confirm | store name | `Stops.store_name`, fallback `Stops.stop_location` |
| Confirm | actor id | `auth.userId` from the bearer token |
| Confirm | actor name | `Profiles.full_name` for the actor, resolved on the server. The request is rejected with a clear error when the profile has no name, and the browser never supplies it |
| Confirm | actor role | the first match from `SuperAdmin`, `Admin`, `ATCOfficer` in `UserRoles` |
| Confirm | total quantity | sum of the submitted line quantities |
| Confirm | discrepancy | submitted total minus `Stops.quantity_offloaded`, computed inside the function |
| Confirm | confirmation time | `store_supply_confirmations.confirmed_at` default `now()` |
| Display the confirmer | name and role | `store_supply_confirmations.confirmed_by_name` and `confirmed_by_role` in Store Sales. A null name falls back to the role label when known, otherwise `Not recorded` |
| Display the confirmer | readable role label | fixed map in the UI: `ATCOfficer` to `ATC Officer`, `Admin` to `Admin`, `SuperAdmin` to `Super Admin`, `StoreOfficer` to `Store Officer`, other values shown as stored |

**Key invariants**:

- One stop cannot receive a second confirmation through this path. The stop row is locked before the check, so two requests cannot both pass.
- The confirmation, its lines, the stop update, and the stock changes commit together or not at all.
- A store with an Active officer is never eligible. `Invited` and `Suspended` officers do not block.
- If the eligibility read fails or has not loaded yet, the action stays hidden. The browser fails closed.
- Every line has a non empty product, a positive whole quantity, and no product appears twice.
- A non zero discrepancy requires a non empty note.
- A null `quantity_offloaded` is treated as zero when the function computes the discrepancy.
- ATC confirmations keep `officer_id` null and always carry `confirmed_by`, `confirmed_by_name`, and `confirmed_by_role`.
- The actor name is a snapshot. A later profile rename does not change past rows.

**Security model**:

- The trips route action and the eligibility route both require `ATCOfficer` or `Admin` or `SuperAdmin`. No other role can read eligibility or confirm.
- The database function is `SECURITY DEFINER`, revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`. The function also rejects an actor role outside the three allowed roles as a second gate.
- The browser does not send the actor name or role. The server derives both from the token and `Profiles`.
- The existing store officer flow is unchanged and keeps its current role checks.
- No new row level security policy is needed because the new paths use the service role route. The existing table policies stay as they are.
- The audit columns are the record of who changed stock outside the store officer flow.

**Configuration required**: none.

**Critical test scenarios** (each maps to an acceptance criterion in Requirements):

- Happy path: ATC opens a trip with a pending store stop at Calabar Mini Depot, sees Confirm Supply, enters the prefilled line, and submits. The confirmation row, line rows, stop state, and stock all change together, verifies **AC-2**, **AC-3**, and **AC-8**.
- Visibility: the action appears for ATC, Admin, and SuperAdmin, is hidden for a store with an Active officer, and the server denies StoreOfficer, StoreSupervisor, Supervisor, and Broker, verifies **AC-1** and **AC-7**.
- Discrepancy: entering 95 bags against 100 offloaded is rejected until a note is added, then stores `discrepancy_quantity = -5` and the note, verifies **AC-4**.
- Eligibility race: an officer is activated after the page loads, then the ATC submits. The server rejects the request and no confirmation, stop change, or stock change is saved, verifies **AC-5**.
- Duplicate submit: the same request is sent twice in a row. The second call returns a conflict and stock moves once, verifies **AC-6**.
- Stock failure: force `adjust_store_stock` to raise. The transaction rolls back, the stop stays pending, and no confirmation or lines exist, verifies **AC-3**.
- Audit display: Store Sales shows the ATC name on a new supply and the store officer name on a backfilled supply, verifies **AC-9**.

## Build plan

This feature follows a thin vertical path: the migration and the two server endpoints first, then the modal and the Monitor Trips wiring, then the audit display and the verification sweep.

1. Create migration `065_confirm_store_supply.sql`. Add the three nullable audit columns, backfill them from `store_officers`, create the `confirm_store_supply` function with the stop lock, store stop check, recorded or posted trip check, active officer check, line validation, discrepancy rule, confirmation and line inserts, stop update, and stock adjustment, revoke public execute, grant `service_role`, and reload the PostgREST schema. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-9**.
2. Extend `MutationAction` in `lib/api-mutation.ts` and add the `confirm_store_supply` branch to `app/api/mutations/trips/route.ts`. Validate the payload, resolve the actor name from `Profiles`, pick the actor role, call the function, and map known function errors to friendly messages and statuses. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-7**.
3. Add `app/api/store-supply/eligibility/route.ts`. It authenticates, requires the three allowed roles, reads `store_officers` with the service role, and returns the deduplicated list of stores whose status is `Active`, with names trimmed. Satisfies **AC-1**, **AC-5**, **AC-7**.
4. Add `components/admin/ConfirmStoreSupplyModal.tsx`. Prefill the trip product and offloaded quantity, load `get_products`, include the trip product in the selector even when `get_products` does not return it, allow add and remove lines, validate duplicate products and positive whole quantities, require a note on a mismatch, call the new action, and show server errors inline. Satisfies **AC-2**, **AC-4**.
5. Wire Monitor Trips. Fetch eligibility on load and with the trip poll, keep the action hidden until eligibility has loaded, show the no active officer note and the Confirm Supply button on eligible store stops, open the modal, and refresh the stop detail and list counters after success. Satisfies **AC-1**, **AC-2**, **AC-8**.
6. Show the confirmer in Store Sales. Add `confirmed_by_name` and `confirmed_by_role` to the supply read and the activity row, and display the name and a readable role label in the supply detail. Satisfies **AC-9**.
7. Verify the migration against a rebuilt schema, then run the critical scenarios against one real unassigned stop and one store with an Active officer inside a transaction that rolls back. Satisfies all acceptance criteria.

## Verification

Completed 2026-11-20.

- **Schema rebuild**: migration 065 ran against a rebuilt Postgres schema with a 70 assertion harness. It covered the happy path, split products, discrepancies, Invited/Suspended versus Active officers, disputed/confirmed/customer stops, recorded and posted `Trips` and `dd_trips`, line and actor validation, double confirmation, and a forced mid-write failure that rolled every change back.
- **Live preflight**: the migration and the critical calls ran inside a transaction against the production database and rolled back. Calabar Mini Depot (300 bags, Supaset) confirmed with stock +300; Reserve Store (690 entered against 698 offloaded) confirmed with `discrepancy_quantity = -8` and its note; Uyo Depot, which has an Active officer, was rejected with `active_officer_exists`.
- **Applied state**: migration 065 is applied. The project has no remote migration history, so it was applied through `supabase db query` rather than `db push`. All 100 existing confirmations were backfilled, none are missing a name, and `service_role` can execute the function while `anon` and `authenticated` cannot.
- **App checks**: `npx tsc --noEmit`, ESLint on the changed files, and `npm run build` pass.

## Consequences

**Positive**:
- Trips with pending store stops at unassigned stores can be finished.
- Store stock is credited in the same transaction as the stop state.
- The actor is recorded by name and role, and the server cannot be spoofed by the browser.
- The change adds no new role and no new screen.

**Negative / tradeoffs**:
- ATC can add stock without a second human check. The safeguard is the role restriction and the audit row, not a second approval.
- The product name is not checked against a product catalogue inside the function. The modal limits choices through `get_products`, but a direct privileged call could create a new stock product name.
- The old store officer flow remains non atomic. This spec does not fix it.
- The stored name is a snapshot, so an audit row can differ from the person's current profile name.

**Neutral**:
- No push notification is sent, by decision.
- No marker or filter is added to the trip list. The action stays inside the trip details.
- One new server route and one new database function must be maintained.

## Follow-up

- [ ] Clean the duplicate confirmation row for stop `8ea95a06-9ac5-4508-a070-82dcfd6e4bbe` (two rows, one empty) before considering a partial unique index on `store_supply_confirmations(stop_id)`.
- [ ] Move the store officer confirmation to the same atomic function so both paths share one implementation.
- [ ] Reverse stock when a confirmed store stop is deleted or changed. `delete_stop_with_dependencies` and `save_atc_stop` currently remove confirmation rows without reversing stock.
- [ ] Consider showing current store stock in the modal if ATC users ask for it during rollout.
- [ ] Consider a push notification to the store supervisor after an ATC confirmation if the business later wants visibility. This is deliberately out of scope now.

## Migration plan

**Strategy**: strangler. Add the new ATC path alongside the existing store officer path and leave the old path unchanged.

**Phases**:
1. [x] Apply migration `065_confirm_store_supply.sql`. The new columns are nullable, the backfill only fills nulls, and the function is not called until the code ships. Applied on 2026-11-20.
2. [x] Build the trips route action, the eligibility route, the modal, and the Monitor Trips wiring, and the Store Sales audit display. The action stays hidden for stores with an Active officer and for roles outside the three allowed roles.
3. [ ] Deploy the code, confirm one real pending stop at Calabar Mini Depot or Reserve Store, then record the trip and check the store stock balance.

**Rollback**: revert the code and drop the `confirm_store_supply` function. The three columns can stay because they are nullable and harmless. ATC confirmation rows already written remain valid audit records and should be kept.

**Risks**: the backfill matches on `officer_id`, so confirm the matched row count before and after. The known duplicate confirmation for stop `8ea95a06-9ac5-4508-a070-82dcfd6e4bbe` is unrelated to this feature but will block a future unique index until it is cleaned. A first receipt for a store and product creates a new `store_stock` row, which is expected. A wrong store name on the stop would credit the wrong store, so the modal must show the store name clearly before submit.
