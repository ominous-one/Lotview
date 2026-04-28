/**
 * Stub: Carfax Badge Utils
 */
export function generateCarfaxBadges(report: any): string[] {
  const badges: string[] = [];
  if (!report.accidentCount) badges.push("No Accidents");
  if (!report.damageReported) badges.push("No Damage");
  if (report.ownerCount === 1) badges.push("1 Owner");
  if (report.serviceRecordCount > 5) badges.push("Well Maintained");
  return badges;
}

export function normalizeCarfaxBadgeList(badges: unknown): string[] {
  if (!Array.isArray(badges)) return [];

  const normalized = badges
    .filter((badge): badge is string => typeof badge === "string")
    .map((badge) => badge.trim())
    .filter(Boolean)
    .map((badge) => {
      const lower = badge.toLowerCase();
      if (lower === "no accidents") return "No Reported Accidents";
      if (lower === "no damage") return "No Damage Records";
      if (lower === "1 owner" || lower === "one owner") return "One Owner";
      return badge;
    });

  return Array.from(new Set(normalized));
}
