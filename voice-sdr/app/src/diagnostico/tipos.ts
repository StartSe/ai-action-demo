import type { DiagnosticoNaTela } from '@diagnostico/diagnostico.ts'

/**
 * O contrato do diagnóstico da chamada, sobre a borda `call-diagnose` e os
 * dois RPCs de decisão. A tela fala com ele, nunca com o cliente do Supabase.
 *
 * A forma do diagnóstico é a da borda (`DiagnosticoNaTela`, pelo alias
 * `@diagnostico/`): a mesma linha lida do banco e devolvida pela análise.
 */
export type CargaDoDiagnostico =
  | { readonly ok: true; readonly diagnostico: DiagnosticoNaTela | null }
  | { readonly ok: false; readonly mensagem: string }

export type ResultadoDaAnalise =
  | { readonly ok: true; readonly diagnostico: DiagnosticoNaTela }
  | { readonly ok: false; readonly mensagem: string; readonly caminho?: string }

export type ResultadoDaDecisao =
  | {
      readonly ok: true
      /** A versão em rascunho que a aplicação criou, quando o alvo é roteiro ou jeito da casa. */
      readonly versaoId: string | null
      readonly versao: number | null
    }
  | { readonly ok: false; readonly mensagem: string }

export interface ServicoDeDiagnostico {
  /** O diagnóstico mais novo da chamada, ou nulo quando ninguém pediu. */
  carregar(chamadaId: string): Promise<CargaDoDiagnostico>
  /** Pede a análise à borda. Grava um diagnóstico novo; nunca muda configuração. */
  analisar(chamadaId: string): Promise<ResultadoDaAnalise>
  /** Aplica a proposta pelo RPC, com a sessão de quem aprovou. Nunca publica. */
  aplicar(diagnosticoId: string, propostaId: string): Promise<ResultadoDaDecisao>
  descartar(diagnosticoId: string, propostaId: string): Promise<ResultadoDaDecisao>
}
