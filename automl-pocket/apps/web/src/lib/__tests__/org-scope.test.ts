import { describe, expect, it } from "vitest";

import type { AuditEntry } from "@/lib/audit";
import { scopedLookup, type Viewer } from "@/lib/org-scope";

const VIEWER: Viewer = {
  id: "6f1b2f37-14a4-4f8e-9a37-111111111111",
  orgId: "0b7e8f10-2222-4b6a-9c3d-222222222222",
};

const RESOURCE_ID = "9d8c7b6a-3333-4d5e-8f90-333333333333";

const META = { ip: "203.0.113.7", userAgent: "vitest/1.0" };

/** Simula a tabela: só devolve a linha quando a query chega com a org dona. */
function makeLookup(ownerOrgId: string, row: { id: string }) {
  const calls: string[] = [];
  return {
    calls,
    lookup: async (orgId: string) => {
      calls.push(orgId);
      return orgId === ownerOrgId ? row : undefined;
    },
  };
}

function makeAudit() {
  const entries: AuditEntry[] = [];
  return {
    entries,
    audit: async (entry: AuditEntry) => {
      entries.push(entry);
    },
  };
}

describe("scopedLookup", () => {
  it("injeta o orgId da sessão na busca e devolve o recurso da própria org", async () => {
    const row = { id: RESOURCE_ID };
    const { calls, lookup } = makeLookup(VIEWER.orgId, row);
    const { entries, audit } = makeAudit();

    const result = await scopedLookup({
      viewer: VIEWER,
      resourceType: "project",
      resourceId: RESOURCE_ID,
      lookup,
      audit,
      meta: META,
    });

    expect(result).toBe(row);
    // A busca recebeu exatamente o orgId da sessão (nunca um orgId externo)
    expect(calls).toEqual([VIEWER.orgId]);
    // Acesso legítimo não gera auditoria de negação
    expect(entries).toHaveLength(0);
  });

  it("recurso de outra org devolve null (rota responde 404) e audita a tentativa", async () => {
    const outraOrg = "aa11bb22-4444-4c5d-6e7f-444444444444";
    const { lookup } = makeLookup(outraOrg, { id: RESOURCE_ID });
    const { entries, audit } = makeAudit();

    const result = await scopedLookup({
      viewer: VIEWER,
      resourceType: "dataset",
      resourceId: RESOURCE_ID,
      lookup,
      audit,
      meta: META,
    });

    expect(result).toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "authz.denied",
      userId: VIEWER.id,
      orgId: VIEWER.orgId,
      resourceType: "dataset",
      resourceId: RESOURCE_ID,
      ip: META.ip,
      userAgent: META.userAgent,
    });
  });

  it("recurso inexistente também é negado e auditado", async () => {
    const { entries, audit } = makeAudit();

    const result = await scopedLookup({
      viewer: VIEWER,
      resourceType: "model",
      resourceId: RESOURCE_ID,
      lookup: async () => undefined,
      audit,
      meta: META,
    });

    expect(result).toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("authz.denied");
    expect(entries[0].resourceType).toBe("model");
  });

  it("id que não é uuid nunca chega ao banco e é auditado sem resourceId", async () => {
    const { calls, lookup } = makeLookup(VIEWER.orgId, { id: RESOURCE_ID });
    const { entries, audit } = makeAudit();

    const result = await scopedLookup({
      viewer: VIEWER,
      resourceType: "training_job",
      resourceId: "'; DROP TABLE projects; --",
      lookup,
      audit,
      meta: META,
    });

    expect(result).toBeNull();
    // A busca não foi executada (id malformado nunca chega ao banco)
    expect(calls).toHaveLength(0);
    expect(entries).toHaveLength(1);
    // resource_id é coluna uuid — id malformado vai para metadata
    expect(entries[0].resourceId).toBeNull();
    expect(entries[0].metadata).toMatchObject({
      invalidId: "'; DROP TABLE projects; --",
    });
  });

  it("auditDenied: false suprime a auditoria (layout pai já audita o recurso)", async () => {
    const { entries, audit } = makeAudit();

    const result = await scopedLookup({
      viewer: VIEWER,
      resourceType: "project",
      resourceId: RESOURCE_ID,
      lookup: async () => undefined,
      auditDenied: false,
      audit,
      meta: META,
    });

    expect(result).toBeNull();
    expect(entries).toHaveLength(0);
  });
});
