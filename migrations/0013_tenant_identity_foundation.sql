ALTER TABLE dealerships
  ADD COLUMN IF NOT EXISTS tenant_key uuid DEFAULT gen_random_uuid();

UPDATE dealerships
SET tenant_key = gen_random_uuid()
WHERE tenant_key IS NULL;

ALTER TABLE dealerships
  ALTER COLUMN tenant_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dealerships_tenant_key_unique'
  ) THEN
    ALTER TABLE dealerships
      ADD CONSTRAINT dealerships_tenant_key_unique UNIQUE (tenant_key);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key uuid NOT NULL REFERENCES dealerships(tenant_key) ON DELETE CASCADE,
  dealership_id integer NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'system_subdomain',
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_domains_tenant_key_idx
  ON tenant_domains (tenant_key);

CREATE INDEX IF NOT EXISTS tenant_domains_dealership_id_idx
  ON tenant_domains (dealership_id);

INSERT INTO tenant_domains (tenant_key, dealership_id, hostname, kind, is_primary, status)
SELECT d.tenant_key, d.id, LOWER(d.subdomain || '.lotview.ai'), 'system_subdomain', true, 'active'
FROM dealerships d
WHERE d.subdomain IS NOT NULL
  AND d.subdomain <> ''
ON CONFLICT (hostname) DO NOTHING;
