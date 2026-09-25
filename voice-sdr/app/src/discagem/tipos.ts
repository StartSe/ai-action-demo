/**
 * O que a tela de política de discagem conhece. As colunas moram em
 * `account_settings` (US-045) e a escrita passa por
 * `definir_politica_de_discagem`, que grava o motivo na trilha (RF-008).
 */

import type { JanelaDeDiscagem } from '@compartilhado/discagem/janela.ts'
import type { ServicoDeAutomacao } from '@/automacao/tipos'
import type { FaltaNoPortao } from '@compartilhado/discagem/portao.ts'

export type { FaltaNoPortao, JanelaDeDiscagem }

export interface PoliticaDeDiscagem {
  /** Dia da semana (`'0'` domingo a `'6'` sábado) para faixa. Dia ausente não disca. */
  janela: JanelaDeDiscagem
  intervaloMinimoMinutos: number
  tentativasPorNumero: number
  tetoDiarioDeLigacoes: number
  /** Nulo é sem teto de gasto, que é o padrão da coluna. */
  tetoDeGastoCentavos: number | null
  duracaoMaximaSegundos: number
  simultaneidade: number
}

export type CampoDaPolitica = keyof PoliticaDeDiscagem

export type MotivoDeFalhaDaDiscagem =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  /** O banco recusou um valor (check ou gatilho da janela). */
  | 'valor-recusado'

export type CargaDaPolitica =
  | { ok: true; politica: PoliticaDeDiscagem; fusoDaConta: string }
  /** A conta existe e a linha de configuração não: é o estado vazio da tela. */
  | { ok: true; politica: null; fusoDaConta: string }
  | { ok: false; motivo: MotivoDeFalhaDaDiscagem }

export type GravacaoDaPolitica =
  | { ok: true; politica: PoliticaDeDiscagem }
  | { ok: false; motivo: MotivoDeFalhaDaDiscagem }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
/**
 * Um número para o qual esta conta pode discar enquanto o portão da fatia
 * estiver fechado. Enquanto `real_dialing` não abre, a guarda só deixa passar
 * o que estiver aqui — é o que permite provar a ligação sem risco de alcançar
 * lead de verdade.
 */
export interface NumeroDeTeste {
  readonly id: string
  readonly e164: string
  /** De quem é o número. A lista sem dono não diz para quem se vai ligar. */
  readonly rotulo: string
}

export type MotivoDeFalhaDoNumeroDeTeste =
  | 'numero-invalido'
  | 'rotulo-obrigatorio'
  | 'ja-cadastrado'
  | 'teto-atingido'
  | 'sem-permissao'
  | 'falha-de-comunicacao'

export type GravacaoDoNumeroDeTeste =
  | { ok: true; numero: NumeroDeTeste }
  | { ok: false; motivo: MotivoDeFalhaDoNumeroDeTeste }

export type RemocaoDoNumeroDeTeste =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDoNumeroDeTeste }

/**
 * O portão de lead real como o servidor o vê (`estado_do_portao`, o passo 2 de
 * `guard_dial`). A tela desenha isto e não recalcula: `falta` vazia é portão
 * liberado, e cada item é uma condição separada, na ordem da guarda.
 */
export interface PortaoDaConta {
  readonly falta: readonly FaltaNoPortao[]
  /** Quando a primeira ligação de teste terminou com transcrição, ou nulo. */
  readonly primeiraChamadaDeTesteEm: string | null
}

export type CargaDoPortao =
  | { ok: true; portao: PortaoDaConta }
  | { ok: false; motivo: MotivoDeFalhaDaDiscagem }

/**
 * A ligação ao lead novo (RF-610): o lead que chega pelo formulário do site
 * vira ligação sozinho. Colunas `speed_to_lead_enabled` e
 * `speed_to_lead_minutes`; escrita por `definir_ligacao_ao_lead_novo`.
 */
export interface LigacaoAoLeadNovo {
  ligada: boolean
  /** Minutos desde a chegada do lead em que a ligação ainda sai. Entre 1 e 1440. */
  prazoMinutos: number
}

export type CargaDaLigacaoAoLeadNovo =
  | { ok: true; configuracao: LigacaoAoLeadNovo | null }
  | { ok: false; motivo: MotivoDeFalhaDaDiscagem }

export type GravacaoDaLigacaoAoLeadNovo =
  | { ok: true; configuracao: LigacaoAoLeadNovo }
  | { ok: false; motivo: MotivoDeFalhaDaDiscagem }

export interface ServicoDeDiscagem {
  /** A automação da conta (US-190), seção própria da mesma tela. Ausente, a seção não aparece. */
  readonly automacao?: ServicoDeAutomacao
  carregar(): Promise<CargaDaPolitica>
  /** Se a ligação ao lead novo está ligada, e o prazo. */
  ligacaoAoLeadNovo(): Promise<CargaDaLigacaoAoLeadNovo>
  /** Liga ou desliga, com o motivo que vai para a trilha. */
  salvarLigacaoAoLeadNovo(
    configuracao: LigacaoAoLeadNovo,
    motivo: string,
  ): Promise<GravacaoDaLigacaoAoLeadNovo>
  /** O estado do portão, lido do servidor. Leitura de qualquer membro. */
  portao(): Promise<CargaDoPortao>
  /** Grava só os campos informados, com o motivo que vai para a trilha. */
  salvar(
    mudancas: Partial<PoliticaDeDiscagem>,
    motivo: string,
  ): Promise<GravacaoDaPolitica>
  /** Os números de teste da conta, do mais antigo para o mais novo. */
  numerosDeTeste(): Promise<NumeroDeTeste[] | MotivoDeFalhaDoNumeroDeTeste>
  /** Acrescenta um número à lista. O telefone é normalizado antes de gravar. */
  cadastrarNumeroDeTeste(
    numero: string,
    rotulo: string,
  ): Promise<GravacaoDoNumeroDeTeste>
  /** Tira o número da lista. A guarda deixa de aceitá-lo na discagem seguinte. */
  removerNumeroDeTeste(id: string): Promise<RemocaoDoNumeroDeTeste>
}
