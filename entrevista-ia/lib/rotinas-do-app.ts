// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { resumoSemanal, textoDoResumo } from "./resumo-semanal";
import { registrarExecutor, type Rotina } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "resumo-semanal", rotulo: "Resumo semanal do processo seletivo" },
];

/** Quanto o primeiro resumo cobre, quando a rotina nunca rodou. Uma rotina criada hoje não pode
 * avisar sobre os convites de um ano atrás como se fossem novidade. */
const JANELA_INICIAL_DIAS = 7;

const DIA_MS = 86_400_000;

/**
 * "Resumo semanal do processo seletivo" (US-027): o que andou desde a última execução.
 *
 * A janela vai da última execução até agora, e não de "sete dias atrás": uma rotina que ficou pausada
 * uma semana (ou que rodou atrasada porque o app hibernou) tem de contar o que aconteceu no buraco,
 * senão o movimento daqueles dias nunca aparece em aviso nenhum.
 *
 * O destino da notificação é o parecer do melhor avaliado da semana, quando existe: é a única coisa
 * deste resumo que já está gravada e tem tela própria. Os números em si são **leitura** e não viram
 * registro novo — um resumo salvo envelheceria no instante em que alguém registrasse uma decisão, e
 * viraria um item do Histórico contradizendo a tela.
 */
registrarExecutor("resumo-semanal", async (rotina: Rotina) => {
  const titulo = "Resumo semanal do processo seletivo";
  const desde = rotina.ultimaExecucao ?? new Date(Date.now() - JANELA_INICIAL_DIAS * DIA_MS).toISOString();
  const resumo = resumoSemanal(desde);

  // Nenhum convite, nenhuma conversa e nenhuma decisão esperando: não há notícia, e um e-mail
  // semanal dizendo "nada aconteceu" é o que faz as pessoas criarem uma regra para arquivá-lo.
  if (resumo.vazio) return { titulo, texto: "Nada se moveu no processo seletivo desde a última rotina.", enviar: false };

  return { titulo, texto: textoDoResumo(resumo), resultadoId: resumo.melhor?.resultadoId };
});
