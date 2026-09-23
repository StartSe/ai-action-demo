// Qual modelo cada tarefa usa. Próprio deste app (lib/ai.ts e lib/modelos.ts são infraestrutura da
// suíte e não mudam). Server-only: lê a configuração por lib/store.ts.
//
// Duas ideias:
//
//  1. **Tarefa pesada e tarefa leve usam modelos diferentes.** A conversa de abertura precisa
//     entender um dono de padaria falando solto e devolver um rascunho estruturado sem errar um
//     campo; as leituras do dia a dia são dois parágrafos sobre números que já vieram prontos.
//     Pagar o modelo mais caro nas duas pontas é desperdício.
//  2. **O nível é escolha de quem paga.** Quem quer o melhor resultado deixa como está; quem quer
//     gastar pouco troca em Configurações, até o nível gratuito.
//
// Se o modelo escolhido falhar (sem crédito, fila cheia, fora do ar), o OpenRouter cai sozinho
// para a lista de reserva que `askText` já envia — que começa num modelo gratuito. O app nunca
// para por causa de modelo.
import { MODELO_AUTOMATICO, type Opcao } from "./modelos";
import { getConfig } from "./store";

export type TarefaDoApp = "conversa" | "leitura";
export type NivelIA = "melhor" | "equilibrado" | "economico" | "gratuito";

export const CHAVE_NIVEL = "OPENROUTER_NIVEL";
export const NIVEL_PADRAO: NivelIA = "melhor";

/**
 * O modelo gratuito de reserva é o `gemma-4-31b-it:free`, e não é chute: em 21/09/2026 medimos os
 * modelos gratuitos do catálogo com o prompt mais difícil do app (a conversa que vira rascunho) e
 * ele foi o único a acertar o formato em duas de duas tentativas, em 62 s em média. O padrão da
 * suíte (`nemotron-3-super`) devolvia o próprio gabarito e tirou 2 de 9 no mesmo teste.
 */
const GRATUITO = "google/gemma-4-31b-it:free";

const NIVEIS: Record<NivelIA, Record<TarefaDoApp, string>> = {
  melhor: { conversa: "anthropic/claude-opus-5", leitura: "anthropic/claude-sonnet-5" },
  equilibrado: { conversa: "anthropic/claude-sonnet-5", leitura: "anthropic/claude-haiku-4.5" },
  economico: { conversa: "anthropic/claude-haiku-4.5", leitura: "anthropic/claude-haiku-4.5" },
  gratuito: { conversa: GRATUITO, leitura: GRATUITO },
};

/** As opções do seletor de Configurações, com o custo dito em português e não em jargão. */
export const OPCOES_NIVEL: Opcao[] = [
  { valor: "melhor", rotulo: "Melhor resultado — usa os modelos mais capazes (precisa de crédito)" },
  { valor: "equilibrado", rotulo: "Equilibrado — bom resultado por cerca de um terço do custo" },
  { valor: "economico", rotulo: "Econômico — o mais barato que ainda responde bem" },
  { valor: "gratuito", rotulo: "Gratuito — sem custo, com limite diário e resultado mais simples" },
];

export function nivelAtual(): NivelIA {
  const salvo = getConfig(CHAVE_NIVEL);
  return salvo && salvo in NIVEIS ? (salvo as NivelIA) : NIVEL_PADRAO;
}

/**
 * O modelo desta tarefa.
 *
 * Um modelo escolhido à mão em Configurações vence o nível: quem foi lá e apontou um modelo quis
 * aquele modelo, para tudo. "Automático" é o que devolve a escolha ao nível.
 */
export function modeloPara(tarefa: TarefaDoApp): string {
  const escolhido = getConfig("OPENROUTER_MODEL");
  if (escolhido && escolhido !== MODELO_AUTOMATICO) return escolhido;
  return NIVEIS[nivelAtual()][tarefa];
}
