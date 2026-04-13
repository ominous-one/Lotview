export interface DealershipReferenceIdentity {
  id: number;
  name?: string | null;
  slug?: string | null;
  subdomain?: string | null;
  tenantKey?: string | null;
}

export interface DealershipReferenceLookup<TDealership extends DealershipReferenceIdentity = DealershipReferenceIdentity> {
  getDealership(id: number): Promise<TDealership | undefined>;
  getDealershipBySlug(slug: string): Promise<TDealership | undefined>;
  getDealershipBySubdomain(subdomain: string): Promise<TDealership | undefined>;
}

export function normalizeDealershipReferenceValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || null;
}

export function deriveDealershipOperatorLabel(dealership: DealershipReferenceIdentity): string {
  return (
    normalizeDealershipReferenceValue(dealership.subdomain) ??
    normalizeDealershipReferenceValue(dealership.slug) ??
    normalizeDealershipReferenceValue(dealership.name) ??
    normalizeDealershipReferenceValue(dealership.tenantKey) ??
    `dealership-${dealership.id}`
  );
}

export function buildDealershipArtifactFileName(
  prefix: string,
  dealership: DealershipReferenceIdentity,
  extension = 'json',
): string {
  const normalizedPrefix = normalizeDealershipReferenceValue(prefix) ?? 'artifact';
  const normalizedExtension = extension.replace(/^\./, '') || 'json';
  return `${normalizedPrefix}-${deriveDealershipOperatorLabel(dealership)}.${normalizedExtension}`;
}

export async function resolveDealershipReference<TDealership extends DealershipReferenceIdentity>(
  lookup: DealershipReferenceLookup<TDealership>,
  reference: string,
): Promise<TDealership | undefined> {
  const trimmed = reference.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d+$/.test(trimmed)) {
    const byId = await lookup.getDealership(Number(trimmed));
    if (byId) {
      return byId;
    }
  }

  const normalized = normalizeDealershipReferenceValue(trimmed);
  if (!normalized) {
    return undefined;
  }

  const bySubdomain = await lookup.getDealershipBySubdomain(normalized);
  if (bySubdomain) {
    return bySubdomain;
  }

  const bySlug = await lookup.getDealershipBySlug(normalized);
  if (bySlug) {
    return bySlug;
  }

  return undefined;
}
