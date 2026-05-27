/**
 * Static guard: every storage write method that accepts a `dealershipId` MUST use
 * it inside the method body (i.e. scope the WHERE clause by tenant). This prevents
 * an unscoped cross-tenant update/delete from ever being introduced. Pure source
 * analysis — no database required (runs in the default unit suite).
 */
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Storage tenant-write scoping (static guard)", () => {
  const src = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const lines = src.split("\n");
  const sigRe = /async (update|delete)[A-Za-z0-9_]+\s*\(/;

  type M = { name: string; line: number; bodyAfterSig: string };

  const methods: M[] = (() => {
    const out: M[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!sigRe.test(l) || !l.includes("dealershipId")) continue;
      // Capture the full method body via brace matching.
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
      // Everything after the opening brace (excludes the signature's param list).
      const bodyAfterSig = body.slice(body.indexOf("{"));
      out.push({ name, line: i + 1, bodyAfterSig });
    }
    return out;
  })();

  it("discovers the tenant-scoped write methods", () => {
    expect(methods.length).toBeGreaterThan(50);
  });

  it("every update/delete method taking a dealershipId references it in its body (no unscoped cross-tenant writes)", () => {
    const unscoped = methods
      .filter((m) => !m.bodyAfterSig.includes("dealershipId"))
      .map((m) => `${m.name}@${m.line}`);
    expect(unscoped).toEqual([]);
  });
});
