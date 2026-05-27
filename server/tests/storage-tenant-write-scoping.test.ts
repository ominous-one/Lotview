/**
 * Static guard: every storage method that accepts a `dealershipId` MUST reference
 * it inside the method body (scoping the query by tenant). Covers BOTH reads
 * (get/list/find/search/fetch) and writes (update/delete), so neither an unscoped
 * cross-tenant read nor write can ever be introduced. Pure source analysis — no DB
 * (runs in the default unit suite).
 */
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Storage tenant scoping (static guard)", () => {
  const src = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const lines = src.split("\n");

  type M = { name: string; line: number; bodyAfterSig: string };

  function scopedMethods(prefixRe: RegExp): M[] {
    const out: M[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!prefixRe.test(l) || !l.includes("dealershipId")) continue;
      let depth = 0;
      let started = false;
      let body = "";
      for (let j = i; j < lines.length; j++) {
        body += lines[j] + "\n";
        for (const ch of lines[j]) {
          if (ch === "{") {
            depth++;
            started = true;
          } else if (ch === "}") {
            depth--;
          }
        }
        if (started && depth <= 0) break;
      }
      const name = (l.match(/async ([A-Za-z0-9_]+)/) || [])[1] || "?";
      out.push({ name, line: i + 1, bodyAfterSig: body.slice(body.indexOf("{")) });
    }
    return out;
  }

  const writes = scopedMethods(/async (update|delete)[A-Za-z0-9_]+\s*\(/);
  const reads = scopedMethods(/async (get|list|find|search|fetch)[A-Za-z0-9_]+\s*\(/);

  const unscoped = (ms: M[]) =>
    ms.filter((m) => !m.bodyAfterSig.includes("dealershipId")).map((m) => `${m.name}@${m.line}`);

  it("discovers the tenant-scoped read and write methods", () => {
    expect(writes.length).toBeGreaterThan(50);
    expect(reads.length).toBeGreaterThan(100);
  });

  it("every WRITE method taking a dealershipId references it (no unscoped cross-tenant writes)", () => {
    expect(unscoped(writes)).toEqual([]);
  });

  it("every READ method taking a dealershipId references it (no unscoped cross-tenant reads)", () => {
    expect(unscoped(reads)).toEqual([]);
  });
});
