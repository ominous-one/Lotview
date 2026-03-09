# Inventory Deletion Spec (Soft Delete + RBAC + Audit) — LotView

**Project:** `C:\Users\omino\projects\lotview`

## 1) Scope
Add an explicit capability for authorized dealership users to **delete vehicles** from inventory.

**Hard requirements:**
- **Soft-delete preferred** (retain row for FK integrity + analytics)
- **RBAC enforced**
- **Audited** (who/when/why)
- Deleted vehicles excluded from:
  - inventory UI
  - VDP/consumer pages
  - exports (e.g., Facebook catalog)
  - sync/enrichment pipelines

---

## 2) Why soft-delete (vs hard delete)
Current codebase already has multiple places that attempt hard deletion (`storage.deleteVehicle`, direct `db.delete(vehicles)`), which risks:
- FK constraint errors (already visible in `run-zenrows-scrape.ts`)
- loss of appointment/chat/view history tied to vehicleId

Soft-delete gives operational control while keeping history.

---

## 3) DB changes
### 3.1 Vehicles table
Add columns (names can be adjusted to match code style):
- `deletedAt timestamp null`
- `deletedByUserId int null` (FK to `users.id`)
- `deletedReason text null`
- `deleteSource enum('user','sync_sold','sync_removed','import_cleanup') default 'user'` (optional)

**Derived state:**
- `isDeleted := deletedAt IS NOT NULL`

### 3.2 Audit table (if not already present)
If no generic audit log exists, create:
`inventory_audit_log`
- `id uuid`
- `dealershipId int`
- `actorUserId int null`
- `action enum('VEHICLE_SOFT_DELETE','VEHICLE_RESTORE')`
- `vehicleId int`
- `reason text null`
- `metadata jsonb` (ex: previous values)
- `createdAt timestamp`

### 3.3 Indexes
- `vehicles (dealershipId, deletedAt)`
- `inventory_audit_log (dealershipId, createdAt desc)`

---

## 4) RBAC policy
### 4.1 Roles allowed
- Allow: `master`, `sales_manager`
- Deny: `salesperson` and unauthenticated

### 4.2 Access rules
- Actor must belong to the same dealership as the vehicle.
- Actor must be active (`users.isActive=true`).

---

## 5) API contract
### 5.1 Soft delete
`DELETE /api/manager/inventory/vehicles/:vehicleId`
- Auth: `master` or `sales_manager`
- Body: `{ reason?: string }`
- Behavior:
  - set `deletedAt=now`, `deletedByUserId=actor.id`, `deletedReason`
  - write audit log row
  - create in-app notification event (optional; mostly for ops visibility)
- Response: `{ success: true }`

### 5.2 Restore
`POST /api/manager/inventory/vehicles/:vehicleId/restore`
- Auth: `master` or `sales_manager`
- Behavior:
  - set `deletedAt=null`, `deletedByUserId=null`, `deletedReason=null`
  - write audit log row
- Response: `{ success: true }`

### 5.3 List vehicles (exclude deleted)
All “active inventory” endpoints must default to `WHERE deletedAt IS NULL`.
Add optional query for admins:
- `includeDeleted=true` (only for `master`)

---

## 6) UI changes
### 6.1 Inventory list
- Add row action “Delete vehicle” (danger)
- Confirmation dialog requiring a reason (recommended)
- Visual indicator + filter for deleted items (for master)

### 6.2 Vehicle detail
If deleted:
- show a prominent banner: “Deleted by {user} on {date}. Reason: …”
- show “Restore” action (RBAC gated)

### 6.3 Audit view
- Add an “Inventory Audit” page/table
- Filters: action type, user, date range

---

## 7) Sync interaction rules
Inventory sync/enrichment must:
- exclude `deletedAt IS NOT NULL` vehicles from all candidate sets
- never restore a soft-deleted vehicle automatically
- treat soft-deleted vehicles as “out of scope” for stale/sold detection

---

## 8) Tests
### Unit tests
- RBAC guard for delete/restore
- Soft delete sets all required columns
- Restore clears all required columns

### Integration tests
- Deleted vehicle excluded from `/vehicles` list
- `includeDeleted=true` returns deleted rows only for master
- Sync/enrichment queries don’t touch deleted vehicles

---

## 9) Definition of Done (DoD) — contract
- Soft delete implemented; no hard delete required for normal operations.
- RBAC + audit required.
- UI supports delete + restore.
- Tests cover RBAC and visibility.

---

## 10) Gap Report (auto-fill)
- Existing code paths that hard-delete (e.g., stale cleanup in `server/scraper.ts` and `server/robust-scraper.ts`) should be migrated to **status changes** or soft-delete semantics. This is an implementation task; spec calls it out to prevent conflicting behavior.
