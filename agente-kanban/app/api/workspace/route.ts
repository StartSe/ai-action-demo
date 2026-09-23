import { z } from "zod";
import { getConfig, setConfig } from "@/lib/store";
import {
  aiProvider,
  chatgptConfigured,
  workspaceAIEnabled,
  workspaceModel,
} from "@/lib/workspace-ai";
import {
  designProcess,
  executeRoutine,
  runCommand,
} from "@/lib/workspace-agent";
import { configuredTools, discoverTools } from "@/lib/workspace-mcp";
import { blueprintInput, WorkspaceError } from "@/lib/workspace-schema";
import {
  docs,
  getDoc,
  getSkill,
  incorporateFeedback,
  initializeWorkspace,
  listRuns,
  putDoc,
  removeDoc,
  saveBlueprint,
  saveRoutine,
  saveSkill,
  saveTask,
} from "@/lib/workspace-store";
import type { Feedback, Routine, Task, Workspace } from "@/lib/workspace-types";
import { routineTools } from "@/lib/workspace-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function snapshot(): Workspace {
  initializeWorkspace();
  return {
    tasks: docs<Task>("task"),
    routines: docs<Routine>("routine"),
    skill: getSkill(),
    feedback: docs<Feedback>("feedback"),
    runs: listRuns(),
    example: Boolean(getDoc("settings", "example")),
    connections: {
      zapier: Boolean(getConfig("ZAPIER_MCP_URL")),
      tools: configuredTools(),
      provider: aiProvider(),
      ai: workspaceAIEnabled(),
      model: workspaceModel(),
      chatgptConfigured: chatgptConfigured(),
    },
  };
}
export async function GET() {
  return Response.json(snapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}

const base = z.object({
  action: z.string(),
  id: z.string().optional(),
  revision: z.number().int().optional(),
  data: z.unknown().optional(),
});
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 200000)
      throw new WorkspaceError("O conteúdo excede o tamanho permitido.", 413);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new WorkspaceError("Envie um JSON válido.");
    }
    const { action, id, revision, data } = base.parse(json);
    initializeWorkspace();
    let result: unknown;
    if (action === "task") {
      const input = z
        .object({ task: z.unknown(), reason: z.string().max(2000).optional() })
        .parse(data);
      result = saveTask(input.task, id, revision, "human", input.reason);
    } else if (action === "routine") {
      const tools = configuredTools();
      const allowed = new Set(
        tools.filter((t) => t.access !== "disabled").map((t) => t.name),
      );
      const { routineInput } = await import("@/lib/workspace-schema");
      const routine = routineInput.parse(data);
      if (routine.tools.some((t) => !allowed.has(t)))
        throw new WorkspaceError(
          "Selecione apenas ferramentas habilitadas em Conexões.",
        );
      if (routine.enabled && !workspaceAIEnabled())
        throw new WorkspaceError(
          "Conecte a IA antes de ativar a rotina. Você pode salvá-la pausada.",
        );
      routine.tools = routineTools(routine.tools, tools).map(
        (tool) => tool.name,
      );
      result = saveRoutine(routine, id, revision);
    } else if (action === "delete-routine") {
      if (!id || !getDoc("routine", id))
        throw new WorkspaceError("Rotina não encontrada.", 404);
      if (listRuns().some((r) => r.routineId === id && r.status === "running"))
        throw new WorkspaceError(
          "Aguarde a execução terminar antes de excluir a rotina.",
          409,
        );
      removeDoc("routine", id);
    } else if (action === "run") {
      const routine = id ? getDoc<Routine>("routine", id) : null;
      if (!routine) throw new WorkspaceError("Rotina não encontrada.", 404);
      result = await executeRoutine(routine);
      if (!result)
        throw new WorkspaceError("Esta rotina já está em execução.", 409);
    } else if (action === "command") {
      result = await runCommand(
        z.string().trim().min(3).max(10000).parse(data),
      );
      if (!result)
        throw new WorkspaceError(
          "O agente já está processando outro pedido.",
          409,
        );
    } else if (action === "skill") {
      result = saveSkill(data, z.number().int().parse(revision));
    } else if (action === "design") {
      result = await designProcess(z.string().parse(data));
    } else if (action === "publish") {
      const blueprint = blueprintInput.parse(data);
      const allowed = new Set(
        configuredTools()
          .filter((t) => t.access !== "disabled")
          .map((t) => t.name),
      );
      if (blueprint.routines.some((r) => r.tools.some((t) => !allowed.has(t))))
        throw new WorkspaceError(
          "O processo usa uma ferramenta não habilitada.",
        );
      saveBlueprint(blueprint, z.number().int().parse(revision));
    } else if (action === "learn") {
      incorporateFeedback(z.string().parse(id), z.string().parse(data));
    } else if (action === "connect-zapier") {
      const url = z.string().trim().max(2000).parse(data);
      result = await discoverTools(url || undefined);
    } else if (action === "disconnect-zapier") {
      if (process.env.ZAPIER_MCP_URL)
        throw new WorkspaceError(
          "A conexão está definida no ambiente do servidor. Remova ZAPIER_MCP_URL para desconectar.",
        );
      setConfig("ZAPIER_MCP_URL", null);
      putDoc("settings", "tools", []);
    } else if (action === "tool-access") {
      const access = z.enum(["disabled", "read", "deadline"]).parse(data);
      const tools = configuredTools();
      if (!tools.some((t) => t.name === id))
        throw new WorkspaceError("Ferramenta não encontrada.", 404);
      const tool = tools.find((t) => t.name === id)!;
      if (access === "read" && tool.readOnly === false)
        throw new WorkspaceError(
          "Esta ferramenta altera dados na origem e não pode ser habilitada como leitura.",
        );
      if (tool.requiredBy?.length && access !== "read")
        throw new WorkspaceError(
          "Este auxiliar é necessário às consultas habilitadas. Desabilite primeiro as ferramentas que dependem dele.",
        );
      putDoc(
        "settings",
        "tools",
        tools.map((t) => (t.name === id ? { ...t, access } : t)),
      );
    } else if (action === "tool-fields") {
      const fields = z
        .object({
          messageField: z.string().min(1).max(100),
          recipientField: z.string().min(1).max(100),
        })
        .parse(data);
      const tools = configuredTools();
      const tool = tools.find((t) => t.name === id);
      if (!tool) throw new WorkspaceError("Ferramenta não encontrada.", 404);
      const properties = (tool.schema.properties || {}) as Record<
        string,
        unknown
      >;
      if (
        fields.messageField === fields.recipientField ||
        !properties[fields.messageField] ||
        !properties[fields.recipientField]
      )
        throw new WorkspaceError(
          "Escolha dois campos diferentes presentes na ferramenta: mensagem e destinatário.",
        );
      putDoc(
        "settings",
        "tools",
        tools.map((t) => (t.name === id ? { ...t, ...fields } : t)),
      );
    } else if (action === "provider") {
      if (
        process.env.KANBAN_AI_PROVIDER?.trim() &&
        data !== process.env.KANBAN_AI_PROVIDER.trim()
      )
        throw new WorkspaceError(
          "O modelo está definido no ambiente do servidor. Atualize KANBAN_AI_PROVIDER para trocar de provedor.",
        );
      setConfig(
        "KANBAN_AI_PROVIDER",
        z.enum(["openrouter", "chatgpt"]).parse(data),
      );
    } else if (action === "clear-examples") {
      // Only removes untouched illustrative cards. User work and its audit history survive.
      for (const task of docs<Task>("task"))
        if (task.actor === "example") removeDoc("task", task.id);
      putDoc("settings", "example", false);
    } else throw new WorkspaceError("Ação não reconhecida.");
    return Response.json({ workspace: snapshot(), result });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    if (error instanceof WorkspaceError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      {
        error:
          "Não foi possível concluir. Confira a conexão e tente novamente.",
      },
      { status: 502 },
    );
  }
}
