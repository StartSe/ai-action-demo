// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
import { listar as listarHistorico } from "./historico";
import { TIPO_HISTORICO } from "./leads";
import { registrarExecutor, type Rotina } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-prospeccao-linkedin", rotulo: "Resumo das prospecções geradas" }];

registrarExecutor("resumo-prospeccao-linkedin", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === TIPO_HISTORICO && new Date(r.criadoEm) > desde);
  const titulo = "Resumo da Prospecção no LinkedIn";
  if (recentes.length === 0) return { titulo, texto: "Nenhuma prospecção nova foi gerada desde a última rotina.", enviar: false };
  const plural = recentes.length > 1;
  const texto = `${recentes.length} prospecç${plural ? "ões" : "ão"} gerada${plural ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join("; ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});
