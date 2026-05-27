/**
 * CRM cluster — STORAGE-LAYER tenant-isolation + CRUD-lifecycle proof (real Postgres).
 *
 * Mirrors tenant-isolation.integration.test.ts: proves the storage layer itself
 * enforces the tenant boundary (Dealer A can never list, read, update, or delete
 * Dealer B's rows) AND that a basic create -> read -> update -> delete lifecycle
 * works within a single tenant. Covers CRM tags, CRM tasks, and CRM message
 * templates — all of which expose clean dealershipId-scoped storage methods.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`
 * and `npm run db:test:setup`). Skipped in the default unit run.
 */
import { storage } from "../storage";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

describeIf("CRM cluster (storage layer, real Postgres)", () => {
  let dealerA: any;
  let dealerB: any;

  beforeAll(async () => {
    const tag = uniq();
    dealerA = await storage.createDealership({ name: `Dealer A ${tag}`, slug: `dealer-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Dealer B ${tag}`, slug: `dealer-b-${tag}` } as any);
  });

  afterAll(async () => {
    // FK cascade on dealership delete cleans up all child rows for both tenants.
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
  });

  test("two distinct dealerships were created", () => {
    expect(dealerA.id).toBeGreaterThan(0);
    expect(dealerB.id).toBeGreaterThan(0);
    expect(dealerA.id).not.toBe(dealerB.id);
  });

  describe("CRM tags", () => {
    let tagA: any;
    let tagB: any;

    beforeAll(async () => {
      const t = uniq();
      tagA = await storage.createCrmTag({ dealershipId: dealerA.id, name: `Tag A ${t}` } as any);
      tagB = await storage.createCrmTag({ dealershipId: dealerB.id, name: `Tag B ${t}` } as any);
    });

    test("getCrmTags returns ONLY the requesting dealership's tags", async () => {
      const a = await storage.getCrmTags(dealerA.id);
      const aIds = a.map((x: any) => x.id);
      expect(aIds).toContain(tagA.id);
      expect(aIds).not.toContain(tagB.id);

      const b = await storage.getCrmTags(dealerB.id);
      const bIds = b.map((x: any) => x.id);
      expect(bIds).toContain(tagB.id);
      expect(bIds).not.toContain(tagA.id);
    });

    test("updateCrmTag cannot modify another dealership's tag", async () => {
      const res = await storage.updateCrmTag(tagB.id, dealerA.id, { name: "Hacked" } as any);
      expect(res).toBeUndefined();
      // Dealer B's row is intact.
      const stillB = (await storage.getCrmTags(dealerB.id)).find((x: any) => x.id === tagB.id);
      expect(stillB?.name).toBe(tagB.name);
    });

    test("deleteCrmTag cannot delete another dealership's tag", async () => {
      const ok = await storage.deleteCrmTag(tagB.id, dealerA.id);
      expect(ok).toBe(false);
      const stillB = (await storage.getCrmTags(dealerB.id)).find((x: any) => x.id === tagB.id);
      expect(stillB).toBeTruthy();
    });

    test("create -> read -> update -> delete lifecycle within one tenant", async () => {
      const t = uniq();
      const created = await storage.createCrmTag({ dealershipId: dealerA.id, name: `Lifecycle ${t}` } as any);
      expect(created.id).toBeGreaterThan(0);

      // read (scoped list)
      const listed = (await storage.getCrmTags(dealerA.id)).find((x: any) => x.id === created.id);
      expect(listed).toBeTruthy();

      // update
      const updated = await storage.updateCrmTag(created.id, dealerA.id, { name: `Lifecycle ${t} v2` } as any);
      expect(updated?.name).toBe(`Lifecycle ${t} v2`);

      // delete
      const deleted = await storage.deleteCrmTag(created.id, dealerA.id);
      expect(deleted).toBe(true);
      const gone = (await storage.getCrmTags(dealerA.id)).find((x: any) => x.id === created.id);
      expect(gone).toBeUndefined();
    });
  });

  describe("CRM tasks", () => {
    let taskA: any;
    let taskB: any;

    beforeAll(async () => {
      const t = uniq();
      taskA = await storage.createCrmTask({ dealershipId: dealerA.id, title: `Task A ${t}` } as any);
      taskB = await storage.createCrmTask({ dealershipId: dealerB.id, title: `Task B ${t}` } as any);
    });

    test("getCrmTasks returns ONLY the requesting dealership's tasks", async () => {
      const a = await storage.getCrmTasks(dealerA.id);
      const aIds = a.map((x: any) => x.id);
      expect(aIds).toContain(taskA.id);
      expect(aIds).not.toContain(taskB.id);

      const b = await storage.getCrmTasks(dealerB.id);
      const bIds = b.map((x: any) => x.id);
      expect(bIds).toContain(taskB.id);
      expect(bIds).not.toContain(taskA.id);
    });

    test("getCrmTaskById cannot read another dealership's task", async () => {
      expect(await storage.getCrmTaskById(taskB.id, dealerA.id)).toBeUndefined();
      expect(await storage.getCrmTaskById(taskA.id, dealerA.id)).toBeTruthy();
    });

    test("updateCrmTask cannot modify another dealership's task", async () => {
      const res = await storage.updateCrmTask(taskB.id, dealerA.id, { title: "Hacked" } as any);
      expect(res).toBeUndefined();
      const stillB = await storage.getCrmTaskById(taskB.id, dealerB.id);
      expect(stillB?.title).toBe(taskB.title);
    });

    test("deleteCrmTask cannot delete another dealership's task", async () => {
      const ok = await storage.deleteCrmTask(taskB.id, dealerA.id);
      expect(ok).toBe(false);
      const stillB = await storage.getCrmTaskById(taskB.id, dealerB.id);
      expect(stillB).toBeTruthy();
    });

    test("create -> read -> update -> delete lifecycle within one tenant", async () => {
      const t = uniq();
      const created = await storage.createCrmTask({ dealershipId: dealerA.id, title: `Lifecycle ${t}` } as any);
      expect(created.id).toBeGreaterThan(0);

      // read by id (scoped)
      const read = await storage.getCrmTaskById(created.id, dealerA.id);
      expect(read?.id).toBe(created.id);

      // update
      const updated = await storage.updateCrmTask(created.id, dealerA.id, { status: "completed" } as any);
      expect(updated?.status).toBe("completed");

      // delete
      const deleted = await storage.deleteCrmTask(created.id, dealerA.id);
      expect(deleted).toBe(true);
      expect(await storage.getCrmTaskById(created.id, dealerA.id)).toBeUndefined();
    });
  });

  describe("CRM message templates", () => {
    let tmplA: any;
    let tmplB: any;

    const buildTemplate = (dealershipId: number, name: string) => ({
      dealershipId,
      name,
      channel: "email",
      content: "Hello {{firstName}}",
    });

    beforeAll(async () => {
      const t = uniq();
      tmplA = await storage.createCrmMessageTemplate(buildTemplate(dealerA.id, `Template A ${t}`) as any);
      tmplB = await storage.createCrmMessageTemplate(buildTemplate(dealerB.id, `Template B ${t}`) as any);
    });

    test("getCrmMessageTemplates returns ONLY the requesting dealership's templates", async () => {
      const a = await storage.getCrmMessageTemplates(dealerA.id);
      const aIds = a.map((x: any) => x.id);
      expect(aIds).toContain(tmplA.id);
      expect(aIds).not.toContain(tmplB.id);

      const b = await storage.getCrmMessageTemplates(dealerB.id);
      const bIds = b.map((x: any) => x.id);
      expect(bIds).toContain(tmplB.id);
      expect(bIds).not.toContain(tmplA.id);
    });

    test("getCrmMessageTemplateById cannot read another dealership's template", async () => {
      expect(await storage.getCrmMessageTemplateById(tmplB.id, dealerA.id)).toBeUndefined();
      expect(await storage.getCrmMessageTemplateById(tmplA.id, dealerA.id)).toBeTruthy();
    });

    test("updateCrmMessageTemplate cannot modify another dealership's template", async () => {
      const res = await storage.updateCrmMessageTemplate(tmplB.id, dealerA.id, { name: "Hacked" } as any);
      expect(res).toBeUndefined();
      const stillB = await storage.getCrmMessageTemplateById(tmplB.id, dealerB.id);
      expect(stillB?.name).toBe(tmplB.name);
    });

    test("deleteCrmMessageTemplate cannot delete another dealership's template", async () => {
      const ok = await storage.deleteCrmMessageTemplate(tmplB.id, dealerA.id);
      expect(ok).toBe(false);
      // Soft delete: still active and readable for the owning tenant.
      const stillB = await storage.getCrmMessageTemplateById(tmplB.id, dealerB.id);
      expect(stillB).toBeTruthy();
      expect(stillB?.isActive).toBe(true);
    });

    test("create -> read -> update -> delete lifecycle within one tenant", async () => {
      const t = uniq();
      const created = await storage.createCrmMessageTemplate(
        buildTemplate(dealerA.id, `Lifecycle ${t}`) as any
      );
      expect(created.id).toBeGreaterThan(0);

      // read by id (scoped)
      const read = await storage.getCrmMessageTemplateById(created.id, dealerA.id);
      expect(read?.id).toBe(created.id);

      // update
      const updated = await storage.updateCrmMessageTemplate(created.id, dealerA.id, {
        name: `Lifecycle ${t} v2`,
      } as any);
      expect(updated?.name).toBe(`Lifecycle ${t} v2`);

      // delete (soft delete -> isActive=false, drops out of the active list)
      const deleted = await storage.deleteCrmMessageTemplate(created.id, dealerA.id);
      expect(deleted).toBe(true);
      const listed = (await storage.getCrmMessageTemplates(dealerA.id)).find((x: any) => x.id === created.id);
      expect(listed).toBeUndefined();
      const afterDelete = await storage.getCrmMessageTemplateById(created.id, dealerA.id);
      expect(afterDelete?.isActive).toBe(false);
    });
  });
});
