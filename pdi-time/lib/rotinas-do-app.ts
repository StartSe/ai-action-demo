// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho (ver padrão em app/api/f/[token]/route.ts com lib/pdi.ts).
import { listar as listarHistorico } from "./historico";
import { registrarExecutor, type Rotina } from "./rotinas";
// Registra o executor "checkin-pdi" (lembretes de 30/60/90 dias); não entra em TIPOS_ROTINA porque
// é criado por um botão próprio do resultado (parametros vêm do PDI), não pelo formulário genérico.
import "./checkins";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-pdi-time", rotulo: "Resumo dos PDIs gerados" }];

registrarExecutor("resumo-pdi-time", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === "pdi" && new Date(r.criadoEm) > desde);
  const titulo = "Resumo do PDI do Time";
  if (recentes.length === 0) return { titulo, texto: "Nenhum PDI novo foi gerado desde a última rotina." };
  const texto = `${recentes.length} PDI${recentes.length > 1 ? "s" : ""} gerado${recentes.length > 1 ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join(", ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});
