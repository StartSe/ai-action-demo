// O ensaio, na parte que a tela decide sem renderizar nada (US-247).
//
// **O CONDUTOR ENTRA POR CONTRATO.** Quem conduz a conversa é o SDK do
// provedor, que só roda no navegador: ele pede microfone, abre WebSocket e
// toca áudio. Nada disso a escada local alcança (CLAUDE.md: sem navegador no
// laço). Então a tela não fala com o SDK — fala com `CondutorDeConversa`, que
// o adaptador implementa e o teste dubla. É o mesmo desenho das bordas:
// contrato, implementação, dublê.
//
// O que sobra para o degrau 3 é uma coisa só: que o adaptador de verdade
// cumpra este contrato. Tudo o mais — os estados da tela, a ordem dos passos,
// o que acontece quando a conversa cai — se prova em jsdom.

import type { Proposito } from '@compartilhado/playbook/camada-um.ts'

export type { ModoDoEnsaio } from '@ensaio/sessao.ts'
import type { ModoDoEnsaio } from '@ensaio/sessao.ts'

/** Um turno como a tela o mostra enquanto a conversa acontece. */
export interface TurnoAoVivo {
  readonly quem: 'agent' | 'lead'
  readonly texto: string
}

/**
 * Onde a conversa está. `conectando` é o aperto de mão com o provedor;
 * `ouvindo` e `falando` são quem tem a palavra, e a tela os mostra porque numa
 * conversa por voz não há outro jeito de saber se o microfone está aberto.
 */
export type EstadoDaConversa =
  | 'parada'
  | 'conectando'
  | 'ouvindo'
  | 'falando'
  | 'encerrando'

/** O que a tela observa da conversa em curso. */
export interface OuvintesDaConversa {
  aoTurno(turno: TurnoAoVivo): void
  aoEstado(estado: EstadoDaConversa): void
  /** A conversa caiu sozinha. A tela encerra o ensaio assim mesmo. */
  aoCair(mensagem: string): void
}

export interface AberturaDaConversa {
  readonly urlAssinada: string
  readonly modo: ModoDoEnsaio
  /** As variáveis dinâmicas da sessão (ver `variaveisDaSessao`). */
  readonly variaveis: Readonly<Record<string, string>>
  /** A primeira fala com o lead de ensaio, que sobrepõe a publicada. */
  readonly primeiraFala?: string | null
}

/** Uma conversa em curso, do ponto de vista da tela. */
export interface ConversaEmCurso {
  /** O identificador do provedor, quando ele já o informou. */
  identificador(): string | null
  /** Manda uma fala escrita. No modo voz também: a pessoa pode digitar. */
  dizer(texto: string): Promise<void>
  /**
   * Avisa o provedor de que a pessoa está ativa (digitando), para o agente
   * segurar a fala por alguns segundos em vez de cobrar resposta. Opcional:
   * condutor que não sabe fazer isso simplesmente não faz.
   */
  sinalizarAtividade?(): void
  encerrar(): Promise<void>
}

/** Quem conduz a conversa no navegador. `condutor-elevenlabs.ts` a implementa. */
export interface CondutorDeConversa {
  abrir(abertura: AberturaDaConversa, ouvintes: OuvintesDaConversa): Promise<ConversaEmCurso>
}

/** Os quatro propósitos, na ordem em que a tela os oferece. */
export const PROPOSITOS_DO_ENSAIO: readonly Proposito[] = [
  'discovery',
  'reminder',
  'rescue',
  'followup',
]

/**
 * As variáveis que a sessão do ensaio leva: as que `rehearsal-session` montou
 * com o lead de ensaio e o perfil (a mesma regra da ligação de verdade,
 * `_shared/agente/abertura-da-chamada.ts`), mais `call_id`. A sessão do
 * navegador não passa pelo webhook de início, então é daqui que o prompt
 * publicado recebe o nome do lead. A tela não inventa valor nenhum: só repassa
 * o que a borda devolveu.
 */
export function variaveisDaSessao(
  chamadaId: string,
  daBorda: Readonly<Record<string, string>> = {},
): Record<string, string> {
  // `VARIAVEL_DA_CHAMADA` de `call-init/formato-do-provedor.ts`, que a tela
  // não alcança por alias: o nome é contrato com o provedor e não muda.
  return { ...daBorda, call_id: chamadaId }
}
