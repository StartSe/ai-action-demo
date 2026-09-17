import { findLatestModelScoped, findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { getModelDeployFields } from "./fields";

/**
 * Carrega e valida o contexto comum das server actions de deployment
 * (US-043/046/047): projeto da org, modelo publicável e as features válidas.
 */
export async function loadDeployContext(projectId: string) {
  const fail = (error: string) => ({ ok: false as const, error });
  const { user } = await requireSession();

  // projectId vem do client — escopo org + auditoria de negação
  const project = await findProjectScoped(user, projectId);
  if (!project) return fail("Projeto não encontrado.");

  // Id vem do próprio projeto — sem auditoria extra
  const model = await findLatestModelScoped(user, projectId, {
    auditDenied: false,
  });
  if (!model) return fail("Treine um modelo antes de publicar.");
  if (model.problemType === "forecasting") {
    return fail("Implantação disponível para classificação e regressão.");
  }

  const modelFields = await getModelDeployFields(model);
  if (modelFields.length === 0) {
    return fail("Não foi possível carregar os campos do modelo.");
  }

  return { ok: true as const, user, project, model, modelFields };
}
