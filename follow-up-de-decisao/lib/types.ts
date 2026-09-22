export type StatusAcao = "pendente" | "concluida";

/** De onde a ação nasceu: preenchida à mão ou extraída (e revisada) de uma ata colada. */
export type OrigemAcao = "manual" | "ata";

export interface Acao {
  id: string;
  titulo: string;
  /** Nome de quem responde pela ação; string vazia quando ainda não foi definido. */
  dono: string;
  /** "AAAA-MM-DD"; string vazia quando ainda não há prazo definido. */
  prazo: string;
  status: StatusAcao;
  origem: OrigemAcao;
  /** Trecho exato do texto da ata de onde veio o dono (só quando origem "ata" e o texto deixava claro). */
  evidenciaDono: string;
  /** Trecho exato do texto da ata de onde veio o prazo (só quando origem "ata" e o texto deixava claro). */
  evidenciaPrazo: string;
  criadoEm: string;
  concluidaEm: string | null;
}

/** Uma ação proposta pela IA a partir de uma ata colada, ainda não salva: a pessoa revisa e confirma
 * (ou edita) antes de virar uma Acao de verdade. Nunca contém dono/prazo sem a evidência correspondente
 * ser um trecho literal do texto colado (ver lib/acoes.ts: extrairAcoesDaAta). */
export interface AcaoProposta {
  titulo: string;
  dono: string;
  prazo: string;
  evidenciaDono: string;
  evidenciaPrazo: string;
}

/** `saida` dos dois tipos de resultado salvos em lib/historico.ts (ver app/api/acoes/lote/route.ts e
 * lib/rotinas-do-app.ts): sempre a lista de ações envolvidas, para /r/[id] e /imprimir/[id] mostrarem. */
export interface ResultadoAcoesSalvas {
  acoes: Acao[];
}

/** `entrada` do resultado "extracao-ata" (confirmação de "Colar ata"). */
export interface EntradaExtracaoAta {
  acoesPropostas: AcaoProposta[];
}

/** `entrada` do resultado "cobranca-acoes" (cada execução da rotina). */
export interface EntradaCobranca {
  janelaDias: number;
}
