import { cacheOutput } from "@/lib/flow/media";
import {
  project,
  assets,
  job,
  jobs,
  saveJob,
  addAsset,
  type Job,
} from "@/lib/flow/store";
import { generationSignature } from "@/lib/flow/model";
import { generationInput } from "@/lib/flow/experience";
import {
  MuapiRejected,
  mediaUrl,
  muapi,
  payload,
  outputUrl,
} from "@/lib/flow/provider";
export async function POST(req: Request) {
  let current: Job | undefined;
  try {
    const { projectId, nodeId, id } = await req.json();
    if (typeof id !== "string" || !/^[-\w]{1,80}$/.test(id))
      throw new Error("Identificador de geração inválido.");
    const existing = job(id);
    if (existing) return Response.json({ job: existing });
    const p = project(projectId);
    const node = p?.nodes.find((n) => n.id === nodeId);
    if (!p || !node) throw new Error("Salve o projeto antes de gerar.");
    const busy = jobs(projectId).find(
      (j) =>
        j.nodeId === nodeId &&
        ["pending", "submitting", "uncertain"].includes(j.status),
    );
    if (busy) return Response.json({ job: busy });
    if (!["image", "video", "transform"].includes(node.data.kind))
      throw new Error("Esta etapa não gera mídia.");
    const { prompt: effectivePrompt, images } = generationInput(p, node, assets());
    current = {
      id,
      projectId,
      nodeId,
      status: "submitting",
      signature: generationSignature(p, nodeId),
      prompt: effectivePrompt,
      kind: node.data.kind === "video" ? "video" : "image",
      title: node.data.title,
      createdAt: new Date().toISOString(),
    };
    saveJob(current);
    const urls = await Promise.all(images.map(mediaUrl));
    const input = payload(node, effectivePrompt, urls);
    // Persist before submission; ambiguous network failures must never be retried as a new paid request automatically.
    current = { ...current, status: "uncertain" };
    saveJob(current);
    const result = await muapi(input.endpoint, input.body);
    if (typeof result.request_id !== "string")
      throw new Error(
        "A MuAPI não retornou o ID. Confira o histórico do provedor antes de tentar novamente.",
      );
    current = { ...current, status: "pending", requestId: result.request_id };
    saveJob(current);
    return Response.json({ job: current });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Falha ao iniciar geração.";
    if (current)
      saveJob({
        ...current,
        status:
          current.status === "uncertain" && !(e instanceof MuapiRejected)
            ? "uncertain"
            : "failed",
        error,
      });
    return Response.json({ error }, { status: 400 });
  }
}
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const id = params.get("id");
    if (!id)
      return Response.json({ jobs: jobs(params.get("projectId") || "") });
    let j = job(id);
    if (!j)
      return Response.json(
        { error: "Geração não encontrada." },
        { status: 404 },
      );
    if (j.status !== "pending" || !j.requestId)
      return Response.json({ job: j });
    const result = await muapi(
      `predictions/${encodeURIComponent(j.requestId)}/result`,
    );
    const status = String(result.status).toLowerCase();
    if (["completed", "succeeded", "success"].includes(status)) {
      const url = outputUrl(result);
      if (!url)
        throw new Error(
          "A geração terminou, mas o provedor ainda não entregou o arquivo.",
        );
      const asset = addAsset(
        await cacheOutput({
          id: j.id,
          projectId: j.projectId,
          nodeId: j.nodeId,
          title: j.title,
          kind: j.kind,
          url,
          createdAt: new Date().toISOString(),
          prompt: j.prompt,
        }),
      );
      j = saveJob({ ...j, status: "completed", asset });
    } else if (["failed", "error", "cancelled"].includes(status))
      j = saveJob({
        ...j,
        status: "failed",
        error:
          "A MuAPI não concluiu esta geração. Confira o histórico do provedor.",
      });
    return Response.json({ job: j });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar geração." },
      { status: 502 },
    );
  }
}

/** Explicit reconciliation of a submit interrupted before its remote ID was saved. */
export async function PATCH(req: Request) {
  try {
    const { id, requestId, confirmedNotSubmitted } = await req.json();
    const current = typeof id === "string" ? job(id) : undefined;
    if (!current || !["submitting", "uncertain"].includes(current.status))
      throw new Error("Esta geração não precisa de reconciliação.");
    if (Date.now() - Date.parse(current.createdAt) < 120000)
      throw new Error(
        "O envio ainda pode estar em andamento. Aguarde dois minutos antes de reconciliar.",
      );
    if (typeof requestId === "string" && /^[\w-]{1,150}$/.test(requestId)) {
      await muapi(`predictions/${encodeURIComponent(requestId)}/result`);
      return Response.json({
        job: saveJob({
          ...current,
          requestId,
          status: "pending",
          error: undefined,
        }),
      });
    }
    if (confirmedNotSubmitted === true)
      return Response.json({
        job: saveJob({
          ...current,
          status: "failed",
          error:
            "Usuário confirmou no histórico do provedor que a solicitação não foi enviada.",
        }),
      });
    throw new Error("Informe um ID válido ou confira o histórico do provedor.");
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível reconciliar a geração.",
      },
      { status: 400 },
    );
  }
}
