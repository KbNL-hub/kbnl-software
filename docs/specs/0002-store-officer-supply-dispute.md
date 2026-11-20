# 0002. Store officer supply dispute and ATC reassignment

**Date**: 2026-11-20
**Status**: Done

## Summary

Store officers can confirm a pending supply today, but they cannot reject one. When a driver delivers to the wrong store or customer, the officer is forced to either confirm stock into the wrong place or leave the stop pending, which blocks the trip. This spec adds a Dispute Supply action for store officers and turns the existing ATC Resolve Dispute screen into one atomic reassignment to the correct store or customer. The app side is built and migration 066 is applied. The remaining rollout step is deploying the code.

## Context

The store officer dashboard shows pending store stops for the officer's store. Each stop has a Confirm Supply action. There is no negative action, so a wrong delivery has no clean path. The stop stays pending, the trip cannot be recorded, and the store stock does not move.

The Stops table already has `disputed`, `dispute_reason`, and `disputed_by`. Brokers already use those fields to dispute customer stops, and Monitor Trips already has a Disputed filter, a disputed badge, and a Resolve Dispute modal. The modal can change a stop to a store or a customer and can split one stop into several destinations.

The existing resolve path is not safe enough for store supplies. It updates the original stop and inserts the extra stops as separate browser calls, so a failure halfway leaves a partly changed trip. It also trusts browser validation for quantities, destination fields, and trip state. The confirmation work in spec 0001 established the project pattern of one server action plus one Postgres function for a multi row write. This work follows that pattern.

There are no disputed store stops in production today, so the feature starts from a clean state. The three stores without an active officer are Calabar Mini Depot, Reserve Store, and Ogoja Outlet. The four pending stops at those stores are still unconfirmed and undisputed.

## Requirements

**User stories**:
- As a store officer, I want to dispute a pending store supply with a reason so that a wrong delivery is not confirmed into my store.
- As a store officer, I want to see my disputed supplies and their status so that I know ATC is handling them.
- As an ATC officer, I want a disputed supply to appear clearly in Monitor Trips with the officer's name and reason so that I can correct the destination.
- As an ATC officer, I want to reassign the full delivery to the correct store or customer in one save so that the trip is not left half changed.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A user with the `StoreOfficer` role who has an `Active` row in `store_officers` sees a Dispute Supply action on every pending store stop whose resolved store matches that row's `store_name`. The action is not shown for any other store.
- **AC-2**: Submitting a dispute with a reason between 5 and 500 characters marks the stop `disputed = true`, stores the trimmed reason in `dispute_reason`, the actor in `disputed_by`, and the actor's name in `disputed_by_name`. The stop leaves the pending supply list and appears in the officer's disputed list.
- **AC-3**: A dispute is rejected with no write when the stop is not a store stop, is already confirmed, is already disputed, belongs to another store, the officer has no `Active` store officer row for that store, the reason is invalid, or the trip is recorded or posted.
- **AC-4**: Monitor Trips shows the trip under the Disputed filter, shows the disputed badge, the reason, and the name of the officer who disputed it. Record Trip stays blocked while any stop is disputed.
- **AC-5**: An `ATCOfficer`, `Admin`, or `SuperAdmin` can resolve a disputed stop by assigning the full original quantity across one or more destinations. Each destination is either a store, or a customer with a broker, an optional customer, and a stop location.
- **AC-6**: Resolution is atomic. The original stop update, any additional stop inserts, the clearing of the active dispute, and the removal of stale customer confirmations all commit together or not at all.
- **AC-7**: Resolution is rejected with no write unless the destination quantities add up to the original stop quantity, every destination is complete and valid, the stop is currently disputed, and the trip is not recorded or posted.
- **AC-8**: A store officer sees their disputed supplies with the reason and an awaiting ATC label, and the list refreshes after ATC resolves the stop.
- **AC-9**: A store supply dispute sends a push notification to `ATCOfficer`, `Admin`, and `SuperAdmin` users that names the store, the officer, and the truck. No push is sent to the store officer.

## Options considered

### Option 1: Add the button and reuse the current resolve writes

Add a Dispute Supply button that writes the three dispute fields from the browser, and keep the existing Monitor Trips resolve modal and its series of update and insert calls.

**Pros**:
- Smallest code change.
- Reuses the current modal without touching its structure.

**Cons**:
- Resolution can fail halfway and leave the trip partly changed.
- Quantity, destination, and trip state checks stay on the browser.
- Stale customer confirmations can survive a reassignment.
- Inconsistent with the atomic pattern already used for store supply confirmation.

### Option 2: Shared dispute model with atomic server actions

Keep the dispute data on `Stops`, add a name snapshot, and add one Postgres function for dispute and one for resolution. Both are reached through the existing trips mutation route, with role and ownership checks on the server. Rework the existing resolve modal to call the new resolution action.

**Pros**:
- Reuses the existing fields, filter, badge, and modal.
- One transaction per action, so no partial resolution.
- Server side checks cannot be bypassed by a direct browser call.
- Fits the project pattern from spec 0001.

**Cons**:
- More database work and a migration.
- Replaces an existing client handler and needs careful regression testing of broker disputes.

### Option 3: Separate store dispute table and a dedicated resolution screen

Create a `store_supply_disputes` table with its own lifecycle and a new resolution screen outside Monitor Trips.

**Pros**:
- Strongest separation and the most room for a full event history.
- Keeps store disputes independent from broker disputes.

**Cons**:
- Duplicates the existing `Stops` dispute fields and the Monitor Trips filter.
- Adds a second place to resolve disputes.
- More schema, more UI, and more code for a low volume problem.

## Decision

**Chosen option**: Option 2: Shared dispute model with atomic server actions

Store officers dispute through one server action that calls a Postgres function, and ATC resolves through a second server action that calls a second Postgres function. The existing `Stops` dispute fields stay the source of truth, with one new nullable name column. The existing Monitor Trips modal is kept and rewired to the atomic resolution action.

## Rationale

The current data model already expresses a dispute, and Monitor Trips already reacts to it. Replacing that with a separate table would duplicate state and force a second resolution screen for the same job. Reusing the model keeps one disputed filter, one badge, and one place for ATC to work.

The decisive force is failure behavior. Resolution touches one existing stop and zero or more new stops, and it may need to clear a stale customer price. A series of browser writes cannot guarantee that set. A single function can lock the stop and trip, validate every destination, and roll back the whole change on any error. This matches the standard set by the store supply confirmation work in spec 0001.

The engineer chose to require the full original quantity in a resolution. That keeps trip accounting unchanged and leaves short deliveries to the existing confirmation discrepancy note, which already records what the store actually received. The engineer also chose to keep only the identity of the officer who disputed. A nullable `disputed_by_name` snapshot meets that need without a history table.

## Feature design

**Data model sketch**:

`Stops` (existing table, relevant columns):
- `stop_id uuid` primary key
- `trip_id uuid` not null, references a trip
- `stop_type text` not null, `store` or `customer`
- `store_name varchar` nullable
- `stop_location text` nullable
- `quantity_offloaded integer` not null
- `confirmed boolean` default false
- `disputed boolean` default false
- `dispute_reason text` nullable
- `disputed_by uuid` nullable
- `disputed_by_name text` nullable, new column
- `updated_by uuid` nullable
- `order_of_stops smallint` not null, generated by identity

New column:
- `disputed_by_name` is nullable, so the migration is safe on live rows.
- Backfill from `Profiles.full_name` where `Profiles.user_id = Stops.disputed_by`.
- Existing broker disputes keep their current rows. A row with no profile match stays null and the screen shows a neutral fallback.

New functions:
- `dispute_store_supply(p_stop_id uuid, p_disputed_by uuid, p_disputed_by_name text, p_reason text) returns jsonb`
- `resolve_stop_dispute(p_stop_id uuid, p_resolved_by uuid, p_stops jsonb) returns jsonb`

Both functions are `SECURITY DEFINER`, set a fixed `search_path`, revoke execute from `PUBLIC`, `anon`, and `authenticated`, and grant execute to `service_role`. The migration ends with `NOTIFY pgrst, 'reload schema'`.

**State transitions**:
- `pending`: `confirmed = false`, `disputed = false`. The store officer or ATC may confirm, or the store officer may dispute.
- `disputed`: `confirmed = false`, `disputed = true`. The trip cannot be recorded. ATC may resolve.
- `pending` after resolution: the original stop is reassigned and cleared of dispute, and extra stops are open. A store destination waits for a store officer or ATC confirmation. A customer destination waits for pricing if it has no valid confirmation, then the normal customer confirmation flow.
- `confirmed`: the destination flow has confirmed the stop.
- `recorded`: the trip is recorded after every stop is confirmed, no stop is disputed, and every loaded bag is accounted for.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/mutations/trips` action `dispute_store_supply` | POST | `stop_id: uuid`, `reason: string` | updated stop summary | `StoreOfficer` with an `Active` store officer row for the stop's store | 400 invalid reason, 403 not assigned or inactive, 404 stop not found, 409 confirmed, disputed, or trip locked |
| `/api/mutations/trips` action `resolve_stop_dispute` | POST | `stop_id: uuid`, `stops: array` where item 0 replaces the original and the rest are new | `{ success, resolved_stops, total_quantity }` | `ATCOfficer`, `Admin`, `SuperAdmin` | 400 invalid payload or quantity mismatch, 404 stop not found, 409 not disputed or trip locked |

Each resolution item has:
- `stop_type`: `store` or `customer`
- `quantity_offloaded`: positive integer
- `store_name`: required for a store
- `broker_id`: required for a customer
- `customer_id`: optional for a customer
- `stop_location`: required for a customer, derived from `store_name` for a store

The route validates the request shape and integer range. The function is the final authority on ownership, state, totals, and destinations.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Dispute | actor id | session user id on the server |
| Dispute | actor name | `store_officers.full_name` for the actor, then `Profiles.full_name`; reject when neither exists |
| Dispute | store ownership | stop resolved store compared to the officer's `store_officers.store_name`, trimmed and case insensitive |
| Dispute | reason | request input, trimmed, 5 to 500 characters |
| Dispute | stop and trip state | `Stops.confirmed`, `Stops.disputed`, `Stops.stop_type`, `Trips.recorded`, `Trips.posted`, `dd_trips.recorded`, `dd_trips.posted` |
| Resolve | original quantity | `Stops.quantity_offloaded` read under lock |
| Resolve | destination list | request input, validated against the original quantity and destination rules |
| Resolve | stop time for new stops | original stop `stop_time`, so split stops keep the delivery time |
| Resolve | actor id | session user id on the server, written to `updated_by` |
| Resolve | stale customer confirmation removal | `Stop_Confirmations` rows for the original stop |
| Display | disputed officer name | `Stops.disputed_by_name` |
| Display | dispute reason | `Stops.dispute_reason` |
| Display | store list in the resolve modal | `stores` table through `fetchStores`, with the existing local fallback |
| Display | broker list in the resolve modal | `Brokers` table |
| Display | customer in the resolve modal | `CustomerSelector` and the `Customers` table |

**Key invariants**:
- A stop can be disputed only when it is a store stop, unconfirmed, not already disputed, and its trip is not recorded or posted.
- The officer must have an `Active` `store_officers` row whose `store_name` matches the stop's resolved store.
- A dispute never changes `quantity_offloaded`, `confirmed`, stock, or any confirmation row.
- Resolution is allowed only from the disputed state, and the destination total must equal the original stop quantity.
- Resolution clears `disputed` and `dispute_reason` but keeps `disputed_by` and `disputed_by_name` as the last dispute record.
- Resolution sets `confirmed = false` on the original stop and on every new stop.
- Resolution deletes the original stop's `Stop_Confirmations` row when the stop type, broker, customer, quantity, or store changes. A store destination cannot keep a customer price row.
- Resolution never touches `store_supply_confirmations` or store stock. A disputed stop cannot also have a supply confirmation; if one exists, the function raises an error and rolls back.
- Every write is inside one transaction. Any validation error leaves every row unchanged.
- The trip cannot be recorded while any stop is disputed.

**Security model**:
- Dispute is limited to `StoreOfficer` on the route, then to an `Active` row for the stop's store inside the function.
- Resolution is limited to `ATCOfficer`, `Admin`, and `SuperAdmin` on the route. The function also requires the stop to be disputed and the trip to be open.
- The browser never supplies `disputed_by`, `disputed_by_name`, or the officer's store. The server derives all three.
- The new functions are executable only by `service_role`. Browser roles keep their existing read access through row level security.
- The name snapshot is audit data. It is written once by the server and is not editable from the browser.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Happy path: a store officer disputes a pending stop, the stop leaves pending, appears in disputed, and ATC sees the name and reason, verifies **AC-1**, **AC-2**, **AC-4**, **AC-8**, **AC-9**
- Happy path: ATC reassigns the full quantity to a different store, the original stop is updated, the dispute clears, and the destination waits for confirmation, verifies **AC-5**, **AC-6**
- Happy path: ATC converts the stop to a customer with a broker, customer, and location, and the customer stop needs pricing before recording, verifies **AC-5**, **AC-6**
- Happy path: ATC splits one stop into two destinations with quantities that add up to the original, and both new stops carry the original stop time, verifies **AC-5**, **AC-6**
- Failure case: resolution with a total below or above the original is rejected with no writes, verifies **AC-7**
- Failure case: a forced failure after the original update but before the extra inserts rolls the original back, verifies **AC-6**
- Auth case: a store officer disputes another store's stop and receives 403 with no write, verifies **AC-3**
- Auth case: a store officer without an `Active` row is rejected, verifies **AC-3**
- State case: a confirmed stop, an already disputed stop, and a recorded or posted trip are each rejected with no write, verifies **AC-3**
- Concurrency case: a confirm and a dispute race on the same stop, one wins, and the other receives a clear conflict error, verifies **AC-3**
- Regression case: an existing broker dispute still resolves through the same modal and action, verifies **AC-5**, **AC-6**, **AC-7**

## Build plan

Ordered as end to end slices. No project build approach is recorded in `AGENTS.md`, so this plan defaults to a thin vertical thread first, then the remaining surfaces, then verification.

1. Create migration `supabase/migrations/066_store_supply_dispute.sql`: add `Stops.disputed_by_name`, backfill it from `Profiles`, create `dispute_store_supply` and `resolve_stop_dispute`, set grants, and reload the PostgREST schema. Satisfies **AC-2**, **AC-3**, **AC-6**, **AC-7**.
2. Add `dispute_store_supply` and `resolve_stop_dispute` to the trips mutation route and to `MutationAction`. Validate request shape, resolve the store officer name on the server, call the functions, and map database errors to clear messages. Satisfies **AC-1**, **AC-3**, **AC-5**, **AC-7**.
3. Extend `useStops` with a disputed filter and the fields the officer list needs: `stop_type`, `store_name`, `dispute_reason`, and `disputed_by_name`. Satisfies **AC-8**.
4. Add the store officer Dispute Supply button, reason modal, and disputed supplies section. Refetch both lists after a dispute. Satisfies **AC-1**, **AC-2**, **AC-8**.
5. Add `disputed_by_name` to the Monitor Trips stop type and detail read, show the officer name with the reason, gate Resolve Dispute to the three ATC roles, and replace the multi call handler with the new action. Require the destination total to equal the original quantity and use the server supplied stop time. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**.
6. Add the store supply dispute notification helper and send it after a successful dispute. Update the existing generic stop dispute notification to prefer `disputed_by_name` so a store officer is never labeled as a broker. Satisfies **AC-9**.
7. Verify with a SQL harness that covers the happy paths, all rejection cases, split resolutions, stale confirmation removal, and a forced mid write rollback. Run a live preflight against production inside a transaction, then roll back. Run `npx tsc --noEmit`, ESLint on the changed files, and `npm run build`. Satisfies all criteria.

## Consequences

**Positive**:
- Store officers get a safe way to reject a wrong delivery instead of confirming it or leaving it pending.
- ATC gets the officer's name and reason in the same place where the correction happens.
- Resolution becomes atomic and server validated, so a partial reassignment cannot survive a failure.
- The trip can move again after a correction without manual database work.

**Negative / tradeoffs**:
- Resolution requires the full original quantity. A short delivery must be handled through the confirmation discrepancy note, which is a separate step.
- A customer destination created by resolution has no price, so ATC still needs to set the price before the trip can be recorded.
- The new name column is a snapshot. It shows the most recent officer who disputed, not a full history.
- The existing resolve handler is replaced, so broker disputes need regression testing.

**Neutral**:
- One new nullable column and two new functions. No new table and no new environment variable.
- The existing Disputed filter, badge, and modal remain the single ATC surface.
- The migration is additive and can be applied before the code ships.

## Migration plan

**Strategy**: additive migration, then code deploy. No data rewrite beyond the name backfill.

**Phases**:
1. Apply migration 066. The new column is nullable, the backfill only fills nulls, and the new functions are not called until the code ships.
2. Deploy the route, store officer UI, Monitor Trips changes, and notification helper.
3. Confirm one store dispute and one ATC resolution in production, then check that the trip can be recorded after the destination is confirmed.

**Rollback**: revert the code first. The functions and the nullable column can stay in place without affecting the old code. Drop them only after confirming no rows depend on the name snapshot.

**Risks**:
- Applying the migration with `supabase db push` would replay the full migration history because the remote history is empty. Apply the file with `supabase db query --linked -f` as done for migration 065.
- A resolution that changes a customer stop must remove the old price row, or the new destination can carry a stale price.
- The store officer name resolution can fail when neither `store_officers.full_name` nor `Profiles.full_name` exists. The route rejects the dispute with a clear message instead of writing a partial audit row.

## Follow-up

- [ ] Consider inline pricing for customer destinations created during resolution, so ATC does not need a second trip edit.
- [ ] Consider notifying the store officer when ATC resolves their dispute. This spec refreshes the list through polling only.
- [ ] Consider a full dispute history table if dispute volume grows or if audit asks for every event.
