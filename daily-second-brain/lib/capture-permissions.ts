import { createHash } from "node:crypto";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getConfig, setConfig } from "./store";
import { listTools } from "./zapier";
import { BrainError } from "./api";
import type { CaptureTool } from "./capture-types";

// Official Zapier agentic-mode read surface. Never expose its write executor,
// configuration/enable tools or arbitrary code executor to the collection agent.
export const DISCOVERY_TOOLS = new Set([
  "inspect_zapier_actions",
  "discover_zapier_actions",
  "list_zapier_connections",
]);
const READ_META = new Set([...DISCOVERY_TOOLS, "execute_zapier_read_action"]);
const WRITE_META = new Set([
  "execute_zapier_write_action",
  "write_code_action",
  "enable_zapier_action",
  "disable_zapier_action",
  "auto_provision_mcp",
  "manage_zapier_connections",
  "create_zapier_skill",
  "update_zapier_skill",
  "delete_zapier_skill",
  "send_feedback",
]);
type Grant = { name: string; fingerprint: string };
type Policy = { server: string; tools: Grant[] };
export type CaptureAccess = { server: string; tools: Grant[] };
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function serverFingerprint() {
  return hash([
    getConfig("ZAPIER_MCP_URL") || "",
    getConfig("ZAPIER_MCP_TOKEN") || "",
  ]);
}
function fingerprint(t: Tool) {
  return hash([t.name, t.description, t.inputSchema, t.annotations]);
}
function policy(): Policy | null {
  try {
    const p = JSON.parse(getConfig("CAPTURE_READ_TOOLS") || "null");
    return p?.server === serverFingerprint() && Array.isArray(p.tools)
      ? p
      : null;
  } catch {
    return null;
  }
}
function blocked(t: Tool) {
  return (
    WRITE_META.has(t.name) ||
    (!READ_META.has(t.name) && t.annotations?.readOnlyHint === false)
  );
}
function allowed(t: Tool, p = policy()) {
  if (blocked(t)) return false;
  if (p)
    return p.tools.some(
      (g) => g.name === t.name && g.fingerprint === fingerprint(t),
    );
  return READ_META.has(t.name) || t.annotations?.readOnlyHint === true;
}
export function describeCaptureTools(tools: Tool[]): CaptureTool[] {
  const p = policy();
  return tools.map((t) => ({
    name: t.name,
    title: t.title || t.annotations?.title || t.name.replaceAll("_", " "),
    description: (t.description || "").slice(0, 1200),
    allowed: allowed(t, p),
    blocked: blocked(t),
    declaredReadOnly:
      READ_META.has(t.name) || t.annotations?.readOnlyHint === true,
  }));
}
export async function captureToolCatalog() {
  const tools = await listTools();
  const result = describeCaptureTools(tools);
  setConfig(
    "CAPTURE_TOOL_CHECK",
    JSON.stringify({
      server: serverFingerprint(),
      count: result.filter((t) => t.allowed && !DISCOVERY_TOOLS.has(t.name))
        .length,
    }),
  );
  return result;
}
export function verifiedReadToolCount() {
  try {
    const p = JSON.parse(getConfig("CAPTURE_TOOL_CHECK") || "null");
    return p?.server === serverFingerprint() ? Number(p.count) || 0 : 0;
  } catch {
    return 0;
  }
}
export async function saveCaptureTools(names: unknown) {
  if (
    !Array.isArray(names) ||
    names.length > 50 ||
    names.some((n) => typeof n !== "string")
  )
    throw new BrainError("Selecione as ferramentas de leitura.");
  const tools = await listTools();
  const selected = tools.filter((t) => names.includes(t.name));
  if (selected.length !== new Set(names).size || selected.some(blocked))
    throw new BrainError(
      "Uma ferramenta não está disponível para coleta. Atualize a lista.",
    );
  setConfig(
    "CAPTURE_READ_TOOLS",
    JSON.stringify({
      server: serverFingerprint(),
      tools: selected.map((t) => ({
        name: t.name,
        fingerprint: fingerprint(t),
      })),
    }),
  );
  const result = describeCaptureTools(tools);
  setConfig(
    "CAPTURE_TOOL_CHECK",
    JSON.stringify({
      server: serverFingerprint(),
      count: result.filter((t) => t.allowed && !DISCOVERY_TOOLS.has(t.name))
        .length,
    }),
  );
  return result;
}
export async function captureAccess(): Promise<CaptureAccess> {
  if (!getConfig("ZAPIER_MCP_URL"))
    throw new BrainError(
      "Conecte o Zapier em Conexões para iniciar uma coleta.",
    );
  const tools = (await listTools()).filter((t) => allowed(t));
  if (!tools.some((t) => !DISCOVERY_TOOLS.has(t.name)))
    throw new BrainError(
      "Autorize ao menos uma ferramenta de leitura em Conexões → Zapier → Ferramentas de coleta.",
    );
  return {
    server: serverFingerprint(),
    tools: tools.map((t) => ({ name: t.name, fingerprint: fingerprint(t) })),
  };
}
export function checkCaptureTool(t: Tool, access: CaptureAccess) {
  if (
    access.server !== serverFingerprint() ||
    !allowed(t) ||
    !access.tools.some(
      (g) => g.name === t.name && g.fingerprint === fingerprint(t),
    )
  )
    throw new BrainError(
      "A conexão ou a permissão dessa ferramenta mudou. Confira Conexões e repita a instrução.",
    );
}
