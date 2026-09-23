import type { ConnectedTool } from "./workspace-types";
import { WorkspaceError } from "./workspace-schema";

/** Zapier advertises the resolvers needed to fill dynamic fields in each schema. */
export function toolDependencies(tool: ConnectedTool): string[] {
  const names = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const object = value as Record<string, unknown>;
    const meta = object._meta as
      | Record<string, { resolver?: unknown }>
      | undefined;
    for (const key of ["zapier/dynamic_enum", "zapier/dynamic_properties"]) {
      const name = meta?.[key]?.resolver;
      if (typeof name === "string" && name !== tool.name) names.add(name);
    }
    Object.values(object).forEach(visit);
  }
  visit(tool.schema);
  return [...names];
}

export function effectiveTools(saved: ConnectedTool[]): ConnectedTool[] {
  const tools = saved.map((tool) => ({
    ...tool,
    access:
      tool.requiredBy?.length ||
      (tool.access === "read" && tool.readOnly === false)
        ? ("disabled" as const)
        : tool.access,
    requiredBy: undefined as string[] | undefined,
  }));
  const queue = tools.filter((tool) => tool.access !== "disabled");
  const visited = new Set<string>();
  for (const parent of queue) {
    if (visited.has(parent.name)) continue;
    visited.add(parent.name);
    for (const name of toolDependencies(parent)) {
      const helper = tools.find((tool) => tool.name === name);
      // Only provider-declared read-only metadata queries inherit this permission.
      if (!helper || helper.readOnly !== true) continue;
      helper.access = "read";
      helper.requiredBy = [
        ...new Set([...(helper.requiredBy || []), parent.name]),
      ];
      queue.push(helper);
    }
  }
  return tools;
}

export function routineTools(
  names: string[],
  available: ConnectedTool[],
): ConnectedTool[] {
  const result: ConnectedTool[] = [];
  const queue = [...names];
  for (const name of queue) {
    if (result.some((tool) => tool.name === name)) continue;
    const tool = available.find(
      (tool) => tool.name === name && tool.access !== "disabled",
    );
    if (!tool)
      throw new WorkspaceError(
        `A ferramenta ${name} está indisponível. Revise as conexões da rotina.`,
      );
    result.push(tool);
    for (const dependency of toolDependencies(tool)) {
      const helper = available.find(
        (candidate) => candidate.name === dependency,
      );
      if (!helper || helper.access !== "read" || helper.readOnly !== true)
        throw new WorkspaceError(
          `A consulta ${tool.name} precisa do auxiliar de leitura ${dependency}. Atualize as ferramentas em Conexões.`,
        );
      queue.push(dependency);
    }
  }
  return result;
}

export function validateResolverCall(
  tool: ConnectedTool,
  args: Record<string, unknown>,
  allowed: ConnectedTool[],
) {
  if (
    !["list_dynamic_enum_values", "get_dynamic_properties_schema"].includes(
      tool.name,
    ) &&
    !tool.requiredBy?.length
  )
    return;
  const target = allowed.find((candidate) => candidate.name === args.tool_name);
  if (!target || !toolDependencies(target).includes(tool.name))
    throw new WorkspaceError(
      "O auxiliar só pode consultar campos das ferramentas autorizadas nesta rotina.",
    );
}
