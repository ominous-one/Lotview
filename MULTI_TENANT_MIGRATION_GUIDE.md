# Multi-Tenant Migration Guide

## Overview

This guide explains how to migrate the existing single-tenant database to the new multi-tenant architecture using Drizzle's built-in migration system.

## ⚠️ IMPORTANT: Do NOT use SQL migration scripts

The old approach of running custom SQL migration scripts WILL conflict with Drizzle's schema management. Always use Drizzle's `db:push` command instead.

## Migration Strategy

### Option 1: Fresh Start (Recommended for Development)

If you're okay with recreating the database from scratch:

1. **Backup your data** (if needed)
2. **Drop all tables** or reset the database
3. **Run Drizzle push**:
   ```bash
   npm run db:push --force
   ```
4. **Seed the default dealership**:
   ```bash
   tsx scripts/seed-default-dealership.ts
   ```
5. **Re-import your vehicle data** with dealershipId set

### Option 2: Migrate Existing Data (Production)

If you need to preserve existing data:

1. **Temporarily make dealership_id nullable** in `shared/schema.ts`:
   ```typescript
   // Change this:
   dealershipId: integer("dealership_id").notNull().references(...)
   
   // To this (temporarily):
   dealershipId: integer("dealership_id").references(...)
   ```

2. **Push the schema** to create new tables and columns:
   ```bash
   npm run db:push --force
   ```

3. **Seed the default dealership**:
   ```bash
   tsx scripts/seed-default-dealership.ts
   ```

4. **Update existing records** to set dealership_id:
   ```bash
   tsx scripts/update-existing-records.ts
   ```

5. **Make dealership_id non-nullable** in `shared/schema.ts`:
   ```typescript
   // Change back to:
   dealershipId: integer("dealership_id").notNull().references(...)
   ```

6. **Push the schema again** to enforce constraints:
   ```bash
   npm run db:push --force
   ```

## Schema Changes Applied

### New Tables
- `dealerships` - Core tenant table
- `dealership_subscriptions` - Billing and plan management
- `dealership_api_keys` - Per-dealership API credentials

### Updated Tables
All existing tables now have `dealership_id` integer foreign key:
- vehicles
- vehicle_views
- users (nullable for master users)
- chat_conversations
- chat_prompts
- credit_score_tiers
- model_year_terms
- facebook_accounts
- ad_templates
- posting_queue
- posting_schedule
- remarketing_vehicles
- pbs_config
- pbs_webhook_events
- manager_settings
- market_listings
- And all other tables...

## Multi-Tenant Architecture

### Tenant Isolation Model
- **Pool Model**: All dealerships share tables with `dealership_id` column
- **Row-Level Security**: Application-level filtering by dealership_id
- **Master Users**: Have `dealership_id = NULL` and can access all dealerships
- **Regular Users**: Scoped to their dealership via foreign key

### Tenant Context Extraction
Dealership context is determined from (in order):
1. Authenticated user's `dealershipId`
2. Subdomain (e.g., `olympic.yourdomain.com`)
3. Custom header (`X-Dealership-Id`)
4. Default to dealership ID 1 (Olympic Auto Group)

### Storage Layer Security
All CRUD operations now **require** `dealershipId` parameter to enforce data isolation:

```typescript
// OLD (Broken - any tenant can access all data)
await storage.getVehicles();

// NEW (Secure - only gets vehicles for specific dealership)
await storage.getVehicles(req.dealershipId!);
```

## Testing Multi-Tenancy

### 1. Create Test Dealerships
```typescript
await storage.createDealership({
  name: "Test Dealership",
  slug: "test-dealer",
  subdomain: "test",
  status: "active"
});
```

### 2. Test Data Isolation
```typescript
// User from Dealership 1 should NOT see Dealership 2's vehicles
const vehicles1 = await storage.getVehicles(1);
const vehicles2 = await storage.getVehicles(2);

// These should be different!
console.assert(vehicles1.length !== vehicles2.length);
```

### 3. Test Master User Access
Master users should be able to access all dealerships by passing different dealership IDs.

## Common Issues

### Issue: "dealershipId is required"
**Solution**: Always pass `req.dealershipId` from tenant middleware to storage methods.

### Issue: "Cannot insert NULL into dealership_id"
**Solution**: Ensure all insert operations include `dealershipId` in the data being inserted.

### Issue: "Migration script conflicts with Drizzle"
**Solution**: Never run custom SQL migrations. Always use `npm run db:push --force`.

### Issue: "Foreign key violation"
**Solution**: Seed the default dealership before inserting other records.

## Next Steps

1. ✅ Schema is updated with multi-tenant support
2. ✅ Middleware extracts tenant context
3. ✅ Storage layer enforces data isolation
4. ⏳ Update all routes to pass `req.dealershipId` to storage methods
5. ⏳ Update all insert operations to include `dealershipId`
6. ⏳ Add comprehensive tests for multi-tenant isolation
7. ⏳ Build master user dashboard for managing dealerships
8. ⏳ Build dealership signup flow

## Security Checklist

- [ ] All storage methods require `dealershipId` parameter
- [ ] All queries filter by `dealership_id` column
- [ ] All inserts include `dealershipId` in values
- [ ] Master users can access all dealerships (via parameter passing)
- [ ] Non-master users are restricted to their dealership
- [ ] Tenant middleware sets `req.dealershipId` correctly
- [ ] Foreign key constraints prevent orphaned records
- [ ] CASCADE delete removes dealership data when dealership is deleted
