import { readFileSync } from "fs";
import { resolve } from "path";

describe("Facebook page tenant boundary", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");

  it("requires dealership scope when looking up stored Facebook pages by provider page id", () => {
    expect(storageSource).toContain("getFacebookPageByPageId(pageId: string, dealershipId: number)");
    expect(storageSource).toContain("and(eq(facebookPages.pageId, pageId), eq(facebookPages.dealershipId, dealershipId))");
    expect(routesSource).toContain("const existingPage = await storage.getFacebookPageByPageId(pageId, dealershipId)");
    expect(routesSource).not.toContain("getFacebookPageByPageId(pageId);");
  });

  it("requires dealership scope for Facebook page token updates", () => {
    expect(storageSource).toContain("updateFacebookPage(id: number, page: Partial<InsertFacebookPage>, dealershipId: number)");
    expect(storageSource).toContain("and(eq(facebookPages.id, id), eq(facebookPages.dealershipId, dealershipId))");
    expect(routesSource).toMatch(/await storage\.updateFacebookPage\(existingPage\.id,[\s\S]*?\}, dealershipId\);/);
    expect(routesSource).not.toContain("await storage.updateFacebookPage(existingPage.id, {\n          accessToken: page.access_token,\n          isActive: true,\n          pageName: page.name\n        });");
  });

  it("does not report success when disconnect misses the authenticated dealership", () => {
    expect(routesSource).toContain("const page = await storage.updateFacebookPage(pageId, { isActive: false, accessToken: null }, dealershipId)");
    expect(routesSource).toContain('return res.status(404).json({ error: "Page not found" });');
    expect(routesSource).not.toContain("await storage.updateFacebookPage(pageId, { isActive: false, accessToken: null });");
  });
});
