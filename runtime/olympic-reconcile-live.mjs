const SOURCE_URL = 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used';
const LOTVIEW_URL = 'https://olympichyundai.lotview.ai/api/vehicles?limit=48';

function normalizeUrl(input) {
  if (!input) return null;
  try {
    const url = new URL(input);
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(input).replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
  }
}

function extractField(text, label) {
  const regex = new RegExp(`${label}\\s*:?\\s*([^\\n]+?)\\s*(?=(VIN:|Kilometres:|Condition:|Body Style:|Engine:|Stock #|Exterior Colour:|Market Value|Sale Price|See payment options|View details|Compare|$))`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractSourceVehicles(html) {
  const anchors = [...html.matchAll(/<a[^>]+href="([^"]*\/vehicles\/\d{4}\/[^"#?]+(?:\?[^"#]*)?)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const vehicles = [];
  const seen = new Set();
  for (const [, hrefRaw, innerHtml] of anchors) {
    const href = new URL(hrefRaw, SOURCE_URL).href;
    const normalizedUrl = normalizeUrl(href);
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    const text = innerHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/sale price|view details/i.test(text)) continue;
    const salePriceMatch = text.match(/Sale Price\s*\$\s*([0-9,]+)/i) || text.match(/Our Price\s*\$\s*([0-9,]+)/i) || text.match(/\$\s*([0-9,]+)\s*\+ Tax/i);
    const vehicle = {
      normalizedUrl,
      sourceUrl: href,
      title: text.split('VIN:')[0].replace(/^Watch Video\s*/i, '').trim(),
      vin: extractField(text, 'VIN'),
      stockNumber: (extractField(text, 'Stock #') || '').replace(/^:\s*/, '').trim() || null,
      salePrice: salePriceMatch ? Number(salePriceMatch[1].replace(/,/g, '')) : null,
      rawText: text,
    };
    vehicles.push(vehicle);
  }
  return vehicles;
}

function summarize(sourceVehicles, lotviewPayload) {
  const lotviewVehicles = lotviewPayload.data.map((v) => ({
    id: v.id,
    normalizedUrl: normalizeUrl(v.dealerVdpUrl),
    dealerVdpUrl: v.dealerVdpUrl,
    vin: v.vin,
    stockNumber: v.stockNumber || null,
    price: typeof v.price === 'number' ? v.price : null,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
  }));

  const sourceByUrl = new Map(sourceVehicles.map((v) => [v.normalizedUrl, v]));
  const lotviewByUrl = new Map(lotviewVehicles.map((v) => [v.normalizedUrl, v]));

  const missingFromLotView = sourceVehicles.filter((v) => !lotviewByUrl.has(v.normalizedUrl));
  const extraInLotView = lotviewVehicles.filter((v) => !sourceByUrl.has(v.normalizedUrl));
  const priceMismatches = lotviewVehicles
    .map((v) => {
      const source = sourceByUrl.get(v.normalizedUrl);
      if (!source || source.salePrice == null || v.price == null) return null;
      if (source.salePrice === v.price) return null;
      return {
        id: v.id,
        normalizedUrl: v.normalizedUrl,
        vin: v.vin,
        stockNumber: v.stockNumber,
        lotviewPrice: v.price,
        sourceSalePrice: source.salePrice,
        delta: v.price - source.salePrice,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    checkedAt: new Date().toISOString(),
    sourceCount: sourceVehicles.length,
    lotviewCount: lotviewPayload.pagination.total,
    matchedCount: sourceVehicles.length - missingFromLotView.length,
    missingFromLotView,
    extraInLotView,
    priceMismatches,
  };
}

const sourceHtml = await fetch(SOURCE_URL, { headers: { 'user-agent': 'Mozilla/5.0 LotView truth checker' } }).then((r) => r.text());
const lotviewPayload = await fetch(LOTVIEW_URL, { headers: { 'user-agent': 'Mozilla/5.0 LotView truth checker' } }).then((r) => r.json());
const summary = summarize(extractSourceVehicles(sourceHtml), lotviewPayload);
console.log(JSON.stringify(summary, null, 2));
