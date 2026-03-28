import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { dealerships, tenantDomains } from "../shared/schema";

const OLYMPIC_SLUG = "olympic-hyundai";
const CANONICAL_SUBDOMAIN = "olympichyundai";
const CANONICAL_HOSTNAME = `${CANONICAL_SUBDOMAIN}.lotview.ai`;
const LEGACY_HOSTNAME = "olympic.lotview.ai";

async function main() {
  const [dealership] = await db.select().from(dealerships).where(eq(dealerships.slug, OLYMPIC_SLUG)).limit(1);

  if (!dealership) {
    throw new Error(`Dealership not found for slug ${OLYMPIC_SLUG}`);
  }

  if (dealership.subdomain !== CANONICAL_SUBDOMAIN) {
    await db.update(dealerships)
      .set({ subdomain: CANONICAL_SUBDOMAIN, updatedAt: new Date() })
      .where(eq(dealerships.id, dealership.id));
    console.log(`Updated dealership ${dealership.id} subdomain -> ${CANONICAL_SUBDOMAIN}`);
  } else {
    console.log(`Dealership ${dealership.id} already uses ${CANONICAL_SUBDOMAIN}`);
  }

  await db.delete(tenantDomains).where(
    and(
      eq(tenantDomains.dealershipId, dealership.id),
      eq(tenantDomains.kind, "system_subdomain")
    )
  );

  await db.insert(tenantDomains).values({
    tenantKey: dealership.tenantKey,
    dealershipId: dealership.id,
    hostname: CANONICAL_HOSTNAME,
    kind: "system_subdomain",
    isPrimary: true,
    status: "active",
  }).onConflictDoNothing();

  await db.insert(tenantDomains).values({
    tenantKey: dealership.tenantKey,
    dealershipId: dealership.id,
    hostname: LEGACY_HOSTNAME,
    kind: "redirect_alias",
    isPrimary: false,
    status: "active",
  }).onConflictDoNothing();

  const domains = await db.select().from(tenantDomains).where(eq(tenantDomains.dealershipId, dealership.id));
  console.log(JSON.stringify({ dealershipId: dealership.id, domains }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
