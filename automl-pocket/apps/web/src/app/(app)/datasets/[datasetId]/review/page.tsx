import { notFound, redirect } from "next/navigation";

import { isLayoutReviewable } from "@/lib/dataset-layout";
import { layoutReviewNavigation } from "@/lib/dataset-layout-form";
import { findDatasetScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { LayoutReviewForm } from "./layout-review-form";

export const metadata = { title: "Revisar planilha" };

/**
 * Tela "Revisar planilha" (US-026/US-027): mostra o que o worker entendeu da
 * planilha (`layout_diagnosis`) e deixa o usuário confirmar ou ajustar abas,
 * linha do cabeçalho e orientação antes do parse.
 *
 * Só faz sentido para dataset parado em needs_review, em error depois de um
 * parse com opções do usuário, ou ready com avisos de estrutura do profiling
 * (banner da US-028) — mesma regra da rota POST .../layout, para a tela e a
 * rota nunca discordarem. Fora disso segue para o destino final da
 * tela (Prepare do projeto de origem ou a lista): não existe página própria
 * de dataset. A flag LAYOUT_REVIEW_ENABLED não gateia a
 * página de propósito: um dataset já pausado precisa de saída mesmo com a
 * flag desligada depois.
 *
 * `?projectId=` (opcional, UUID) diz de qual projeto o usuário veio: ao
 * terminar, a tela devolve para o Prepare dele; sem isso, para a lista.
 */
export default async function DatasetReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const [{ datasetId }, query] = await Promise.all([params, searchParams]);
  const projectId =
    typeof query.projectId === "string" ? query.projectId : undefined;
  const { user } = await requireSession();

  // id vem da URL (input do usuário): outra org/inexistente → 404 auditado
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) notFound();
  const navigation = layoutReviewNavigation(projectId);
  // Já saiu de needs_review (processando, pronto ou erro do parse automático):
  // segue para onde a tela levaria ao terminar — Prepare do projeto ou lista
  if (!isLayoutReviewable(dataset)) redirect(navigation.doneHref);

  return (
    <LayoutReviewForm
      dataset={{
        id: dataset.id,
        fileName: dataset.fileName,
        status: dataset.status,
        errorMessage: dataset.errorMessage,
        diagnosis: dataset.layoutDiagnosis,
        savedOptions: dataset.parseOptions,
      }}
      navigation={navigation}
    />
  );
}
