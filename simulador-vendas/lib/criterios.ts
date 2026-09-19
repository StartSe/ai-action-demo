// Lista padrão dos 7 critérios de venda consultiva avaliados em cada conversa **real** colada no painel
// (D11 do PRD: a análise de conversa de verdade continua existindo, com a régua consultiva). Arquivo
// puro (sem node:*): usado tanto pelo painel ("use client", como valor inicial dos campos editáveis)
// quanto por lib/analise.ts (server-only) ao montar o prompt e ao calcular a nota geral.
//
// Desde a US-010 os nomes vêm de `lib/metodologias.ts` (`consultiva`), para não existirem duas listas:
// mudar um critério consultivo lá muda a análise de conversa real aqui. A análise real só precisa dos
// nomes — quem avalia uma sessão de treino usa os critérios inteiros (com `id`, `descricao` e `grupo`).
import { METODOLOGIAS } from "./metodologias";

export const CRITERIOS_PADRAO: string[] = METODOLOGIAS.consultiva.criterios.map((c) => c.nome);
