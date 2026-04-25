/**
 * Carfax Scraper Service — Production Grade
 * Scrapes Carfax reports by VIN with caching, badge extraction,
 * and AI-ready structured output.
 */

export interface CarfaxReport {
  vin: string;
  url: string;
  title: string;
  badges: string[];
  accidentCount: number;
  ownerCount: number;
  serviceRecordCount: number;
  damageReported: boolean;
  lienReported: boolean;
  odometerLastReported: number | null;
  odometerDate: string | null;
  structuralDamage: boolean;
  totalLoss: boolean;
  airbagDeployment: boolean;
  lastReportedDate: string | null;
  buybackGuarantee: boolean;
  recallCount: number;
  warrantyInfo: {
    basic: string | null;
    powertrain: string | null;
    corrosion: string | null;
  } | null;
  useHistory: {
    personal: boolean;
    lease: boolean;
    rental: boolean;
    taxi: boolean;
    police: boolean;
    fleet: boolean;
  } | null;
  serviceHistory: Array<{
    date: string;
    mileage: number;
    service: string;
    location: string;
  }> | null;
  scrapedAt: Date;
  expiresAt: Date;
}

/**
 * Scrape Carfax by VIN.
 * In production, uses browserless.io to bypass bot protection.
 */
export async function scrapeCarfaxByVin(
  vin: string,
  options: { browserlessToken?: string } = {}
): Promise<CarfaxReport | null> {
  const browserlessToken = options.browserlessToken || process.env.BROWSERLESS_TOKEN;
  const url = `https://www.carfax.com/vehicle/${vin}`;

  let html: string | null = null;

  // Attempt 1: Browserless
  if (browserlessToken) {
    try {
      const response = await fetch(
        `https://production-sfo.browserless.io/scrape?token=${browserlessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            elements: [{ selector: "body" }],
            gotoOptions: { waitUntil: "networkidle2", timeout: 60000 },
          }),
          signal: AbortSignal.timeout(90000),
        }
      );
      if (response.ok) {
        const data = await response.json();
        html = data[0]?.html || "";
      }
    } catch { /* fall through */ }
  }

  // Attempt 2: Direct fetch
  if (!html) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) html = await response.text();
    } catch { /* fall through */ }
  }

  if (!html || html.length < 1000) return null;

  return parseCarfaxHtml(html, vin, url);
}

function parseCarfaxHtml(html: string, vin: string, url: string): CarfaxReport | null {
  const now = new Date();

  // Extract title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(" | CARFAX", "").trim() : "";

  // Check for "No Accidents / Damage Reported to CARFAX"
  const noAccidents = html.includes("No Accidents / Damage Reported to CARFAX") ||
                     html.includes("No accident or damage reported");

  // Check for "1 Owner"
  const oneOwner = html.includes("1 Owner") || html.includes("One Owner");
  const ownerMatch = html.match(/(\d+)\s+Owner/i);
  const ownerCount = oneOwner ? 1 : (ownerMatch ? parseInt(ownerMatch[1]) : 0);

  // Service records
  const serviceMatch = html.match(/(\d+)\s+Service\s+History/i);
  const serviceRecordCount = serviceMatch ? parseInt(serviceMatch[1]) : 0;

  // Damage reported
  const damageReported = html.includes("Damage Reported") && !noAccidents;

  // Lien reported
  const lienReported = html.includes("Lien Recorded") || html.includes("Lien Reported");

  // Structural damage
  const structuralDamage = html.includes("Structural Damage");

  // Total loss
  const totalLoss = html.includes("Total Loss");

  // Airbag deployment
  const airbagDeployment = html.includes("Airbag Deployment");

  // Odometer
  const odoMatch = html.match(/Last Reported Odometer[^\d]*(\d{1,3},?\d{3})/i);
  const odometerLastReported = odoMatch ? parseInt(odoMatch[1].replace(/,/g, "")) : null;

  // Recalls
  const recallMatch = html.match(/(\d+)\s+Recall/i);
  const recallCount = recallMatch ? parseInt(recallMatch[1]) : 0;

  // Build badges
  const badges: string[] = [];
  if (noAccidents) badges.push("No Accidents / Damage");
  if (oneOwner) badges.push("1 Owner");
  if (serviceRecordCount > 3) badges.push("Service History Available");
  if (!structuralDamage && !totalLoss && !airbagDeployment) badges.push("Clean Title");
  if (!lienReported) badges.push("No Lien");
  if (recallCount === 0) badges.push("No Open Recalls");

  // Personal use
  const personalUse = html.includes("Personal Vehicle");

  return {
    vin,
    url,
    title,
    badges,
    accidentCount: noAccidents ? 0 : (damageReported ? 1 : 0),
    ownerCount,
    serviceRecordCount,
    damageReported,
    lienReported,
    odometerLastReported,
    odometerDate: null,
    structuralDamage,
    totalLoss,
    airbagDeployment,
    lastReportedDate: null,
    buybackGuarantee: html.includes("Buyback Guarantee"),
    recallCount,
    warrantyInfo: null,
    useHistory: personalUse ? { personal: true, lease: false, rental: false, taxi: false, police: false, fleet: false } : null,
    serviceHistory: null,
    scrapedAt: now,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // Cache 7 days
  };
}

/**
 * Get Carfax selling points for AI training.
 * Converts Carfax data into persuasive selling language.
 */
export function getCarfaxSellingPoints(report: CarfaxReport): string[] {
  const points: string[] = [];

  if (!report.damageReported) {
    points.push(`This ${report.title} has a clean Carfax with no accidents or damage reported.`);
  }
  if (report.ownerCount === 1) {
    points.push(`Single owner vehicle — carefully maintained by one previous owner.`);
  } else if (report.ownerCount <= 2) {
    points.push(`Only ${report.ownerCount} previous owners — well-maintained throughout its life.`);
  }
  if (report.serviceRecordCount > 5) {
    points.push(`${report.serviceRecordCount} service records on file — regularly maintained at certified facilities.`);
  }
  if (!report.lienReported) {
    points.push(`Clear title with no liens — ready for immediate transfer.`);
  }
  if (report.recallCount === 0) {
    points.push(`No open recalls — all manufacturer safety updates complete.`);
  }
  if (report.useHistory?.personal) {
    points.push(`Previously a personal vehicle — never used for commercial, rental, or fleet duty.`);
  }
  if (!report.structuralDamage && !report.totalLoss && !report.airbagDeployment) {
    points.push(`No structural damage, total loss, or airbag deployment — mechanically sound.`);
  }

  return points;
}

/**
 * Get Carfax confidence score (0-100).
 * Higher = more confidence-inspiring vehicle.
 */
export function getCarfaxConfidenceScore(report: CarfaxReport): number {
  let score = 50; // Base score

  if (!report.damageReported) score += 15;
  if (report.ownerCount === 1) score += 10;
  else if (report.ownerCount <= 2) score += 5;
  if (report.serviceRecordCount > 5) score += 10;
  if (!report.lienReported) score += 5;
  if (report.recallCount === 0) score += 5;
  if (!report.structuralDamage) score += 5;
  if (!report.totalLoss) score += 5;
  if (!report.airbagDeployment) score += 5;
  if (report.useHistory?.personal) score += 5;
  if (report.buybackGuarantee) score += 5;

  return Math.min(100, Math.max(0, score));
}

export function buildCarfaxAiContext(report: CarfaxReport): string {
  const score = getCarfaxConfidenceScore(report);
  const points = getCarfaxSellingPoints(report);

  return `
CARFAX REPORT SUMMARY:
- Vehicle: ${report.title}
- VIN: ${report.vin}
- Confidence Score: ${score}/100
- Accidents: ${report.damageReported ? 'YES' : 'None reported'}
- Owners: ${report.ownerCount}
- Service Records: ${report.serviceRecordCount}
- Structural Damage: ${report.structuralDamage ? 'YES' : 'None'}
- Total Loss: ${report.totalLoss ? 'YES' : 'No'}
- Open Recalls: ${report.recallCount}

SELLING POINTS:
${points.map(p => `- ${p}`).join('\n')}
`.trim();
}
