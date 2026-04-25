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
