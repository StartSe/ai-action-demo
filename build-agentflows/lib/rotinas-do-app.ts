import { registrarExecutor, type TipoRotina } from "./rotinas";
import { listRuns } from "./flow-store";
export const TIPOS_ROTINA: TipoRotina[] = [
  { tipo: "resumo-fluxos", rotulo: "Resumo das execuções" },
];
registrarExecutor("resumo-fluxos", async (rotina) => {
  const runs = listRuns().filter(
    (r) => r.createdAt > (rotina.ultimaExecucao || ""),
  );
  return {
    titulo: "Resumo do Build Agentflows",
    texto: runs.length
      ? runs.map((r) => r.name + ": " + ({running:'em execução',waiting:'aguardando aprovação',completed:'concluída',failed:'falhou',cancelled:'cancelada'}[r.status])).join("\n")
      : "Nenhuma execução nova no período.",
  };
});
