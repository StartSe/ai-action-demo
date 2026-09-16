// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
import { resumoDaColeta } from "./link-avaliacao";
import { registrarExecutor, type TipoRotina } from "./rotinas";

/** "Resumo da coleta": uma linha por avaliação aberta (N respostas, faltam X para o limite, prazo em Y dias).
 * Sem parâmetros — olha todas as avaliações abertas —, então pode nascer tanto pelo cartão "Rotinas" de /setup
 * quanto pelo botão "Receber o resumo da coleta" do painel (POST /api/bussola/resumo-coleta). */
export const TIPO_RESUMO_COLETA: TipoRotina = { tipo: "resumo-coleta", rotulo: "Resumo da coleta de respostas" };

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: TipoRotina[] = [TIPO_RESUMO_COLETA];

registrarExecutor(TIPO_RESUMO_COLETA.tipo, async () => {
  const titulo = "Resumo da coleta de respostas";
  const { abertas, linhas } = resumoDaColeta();
  // Nenhuma avaliação aberta: nada a avisar hoje (a rotina continua ativa para quando um link for criado).
  if (abertas.length === 0) return { titulo, texto: "Nenhuma avaliação aberta no momento.", enviar: false };
  const total = abertas.reduce((s, a) => s + a.totalRespostas, 0);
  const cabecalho = `${abertas.length} ${abertas.length === 1 ? "avaliação aberta" : "avaliações abertas"}, ${total} ${total === 1 ? "resposta recebida" : "respostas recebidas"} no total.`;
  return { titulo, texto: [cabecalho, ...linhas.map((l) => `- ${l}`), "", "Quando houver respostas suficientes, abra o app e clique em 'Analisar respostas'."].join("\n") };
});
