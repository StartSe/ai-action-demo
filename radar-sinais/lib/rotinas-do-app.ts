// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
// A rotina "radar semanal com o que mudou" (comparando com a execução anterior) é uma história futura
// (US-007 do prd.json); por enquanto só um resumo simples dos radares gerados fica disponível.
import { listar as listarHistorico } from "./historico";
import { registrarExecutor, type Rotina } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-radar-sinais", rotulo: "Resumo dos radares gerados" }];

registrarExecutor("resumo-radar-sinais", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === "radar" && new Date(r.criadoEm) > desde);
  const titulo = "Resumo do Radar de Sinais";
  if (recentes.length === 0) return { titulo, texto: "Nenhum radar novo foi montado desde a última rotina.", enviar: false };
  const texto = `${recentes.length} radar${recentes.length > 1 ? "es" : ""} montado${recentes.length > 1 ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join(", ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});
