import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const hosts = [
  'https://olympichyundai.lotview.ai',
  'https://olympic.lotview.ai',
];

async function fetchText(url, redirect = 'follow') {
  const startedAt = Date.now();
  const response = await fetch(url, { redirect });
  const text = await response.text();
  return {
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    headers: Object.fromEntries(response.headers.entries()),
    text,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeInventoryPayload(payload) {
  const firstVehicle = Array.isArray(payload?.data) ? payload.data[0] : null;
  return {
    total: payload?.pagination?.total ?? null,
    firstVehicleId: firstVehicle?.id ?? null,
    firstVehicleTitle: firstVehicle ? [firstVehicle.year, firstVehicle.make, firstVehicle.model].filter(Boolean).join(' ') : null,
    firstVehiclePrice: firstVehicle?.price ?? null,
  };
}

function assessReadyPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      hasExpectedRuntimeShape: false,
      reason: 'Response body was not valid JSON object',
    };
  }

  const checks = payload.checks && typeof payload.checks === 'object' ? payload.checks : null;
  const hasRuntimeChecks = Boolean(
    checks && (
      Object.hasOwn(checks, 'env') ||
      Object.hasOwn(checks, 'database_config') ||
      Object.hasOwn(checks, 'scheduler_configuration') ||
      Object.hasOwn(checks, 'static_bundle')
    )
  );

  return {
    hasExpectedRuntimeShape: Boolean(payload.processType && checks && hasRuntimeChecks),
    processType: payload.processType ?? null,
    readyStatus: payload.status ?? null,
    checkKeys: checks ? Object.keys(checks) : [],
    reason: hasRuntimeChecks
      ? 'Runtime checks present'
      : 'Runtime checks missing from /ready payload; deploy appears older than current repo contract',
  };
}

const report = {
  capturedAt: new Date().toISOString(),
  repoExpectation: {
    readyMustExpose: ['processType', 'checks.env', 'checks.database_config', 'checks.scheduler_configuration'],
    legacyAliasExpectation: 'legacy redirect_alias host should redirect GET/HEAD HTML traffic to canonical host',
  },
  hosts: [],
};

for (const host of hosts) {
  const root = await fetchText(`${host}/`);
  const ready = await fetchText(`${host}/ready`, 'manual');
  const dealershipInfo = await fetchText(`${host}/api/public/dealership-info`);
  const inventory = await fetchText(`${host}/api/vehicles?limit=1`);
  const readyJson = safeJson(ready.text);
  const dealershipInfoJson = safeJson(dealershipInfo.text);
  const inventoryJson = safeJson(inventory.text);

  report.hosts.push({
    host,
    root: {
      status: root.status,
      finalUrl: root.finalUrl,
      durationMs: root.durationMs,
    },
    dealershipInfo: {
      status: dealershipInfo.status,
      finalUrl: dealershipInfo.finalUrl,
      durationMs: dealershipInfo.durationMs,
      json: dealershipInfoJson,
    },
    inventory: {
      status: inventory.status,
      finalUrl: inventory.finalUrl,
      durationMs: inventory.durationMs,
      proof: summarizeInventoryPayload(inventoryJson),
    },
    ready: {
      status: ready.status,
      finalUrl: ready.finalUrl,
      durationMs: ready.durationMs,
      locationHeader: ready.headers.location ?? null,
      json: readyJson,
      assessment: assessReadyPayload(readyJson),
    },
  });
}

mkdirSync(resolve('runtime'), { recursive: true });
const outputPath = resolve('runtime', 'live-runtime-audit-2026-03-30.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(JSON.stringify(report, null, 2));
