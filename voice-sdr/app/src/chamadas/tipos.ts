/**
 * O que o discador, o freio e o acompanhamento conhecem (RF-011, RF-401,
 * RF-407, RF-416) e a ficha da chamada (RF-414). Quatro bordas da frente
 * `ralph/f2-borda` falam por aqui: `call-place` (US-066), `call-cancel` e
 * `call-audio` (US-072) e `emergency-stop` (US-073).
 * Os contratos delas moram lá; o que a tela lê de cada resposta está abaixo e
 * precisa ser honrado no merge.
 *
 * Quatro escolhas atravessam o arquivo:
 *
 * 1. **A recusa chega pronta.** `call-place` devolve `mensagem` e
 *    `alternativa` já em português, montadas por `_shared/discagem/guarda.ts`.
 *    A tela não traduz motivo da guarda: uma segunda tradução divergiria da
 *    primeira no dia em que uma frase mudasse.
 * 2. **A chave de idempotência nasce no cliente** (`referencia`, um uuid). É o
 *    que faz o segundo clique devolver `ja_existia` em vez de uma segunda
 *    ligação (T-07).
 * 3. **A assinatura em tempo real só traz as seis colunas de `call_live`**
 *    (R-08). `ChamadaAoVivo` não tem transcrição, e não é esquecimento: a
 *    transcrição cresce a dezenas de KB e iria para todo navegador aberto a
 *    cada atualização. A ficha da chamada a lê por consulta.
 * 4. **O número de origem é pedido, não garantido.** Hoje o passo 8 de
 *    `guard_dial` escolhe a linha pelo rodízio e `call-place` não lê
 *    `linhaId`; a tela manda o campo assim mesmo, declarado em `notes`, para a
 *    borda honrá-lo no merge. Sem escolha, vale o rodízio.
 */

import type { Proposito } from '@compartilhado/playbook/camada-um.ts'

import type { ContaNoPortao } from '@/chamadas/portao'

/** Um número da lista de teste da conta (`account_test_numbers`). */
export interface NumeroDeTeste {
  telefone: string
  rotulo: string
}

/** Um lead que o discador pode oferecer quando o portão está aberto. */
export interface LeadDoDiscador {
  id: string
  nome: string
  /** `leads.phone_e164`. Lead sem telefone não chega ao discador. */
  telefone: string
}

/** Uma linha telefônica que serve de origem (`outbound_enabled`, `enabled`). */
export interface LinhaDeOrigem {
  id: string
  e164: string
  rotulo: string
}

/** O freio puxado: quem, quando e por quê (RF-011, RF-008). */
export interface FreioPuxado {
  /** `accounts.dialing_paused_at`, em ISO-8601. */
  em: string
  /** O nome de quem puxou, ou nulo quando o perfil não tem nome. */
  por: string | null
  motivo: string | null
}

export type MotivoDeFalhaDeChamadas =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'

/** O estado da operação da conta, lido pela casca em toda tela. */
export type CargaDaOperacao =
  | { ok: true; contaId: string; freio: FreioPuxado | null }
  | { ok: false; motivo: MotivoDeFalhaDeChamadas }

/** Tudo o que o discador precisa para oferecer destino e origem. */
export interface Discador {
  /** O portão da fatia (US-074), com a lista de teste. */
  portao: ContaNoPortao
  numerosDeTeste: NumeroDeTeste[]
  leads: LeadDoDiscador[]
  linhas: LinhaDeOrigem[]
}

export type CargaDoDiscador =
  | { ok: true; discador: Discador }
  | { ok: false; motivo: MotivoDeFalhaDeChamadas }

/** O pedido de discagem, como o discador o monta. */
export interface PedidoDeLigacao {
  telefone: string
  leadId: string | null
  proposito: Proposito
  /** Nulo é o rodízio da conta. */
  linhaId: string | null
  /** O uuid de idempotência, gerado no cliente. */
  referencia: string
}

/**
 * O que `call-place` responde, lido pela tela. `ja_existia` é sucesso: quem
 * clicou duas vezes mandou a mesma chave, e nenhuma ligação nova saiu.
 */
export type ResultadoDaLigacao =
  | {
      ok: true
      estado: 'discando' | 'ja_existia'
      chamadaId: string
      mensagem: string
    }
  | {
      ok: false
      /** Código da borda. A tela não o mostra; a frase já vem pronta. */
      motivo: string
      mensagem: string
      /** O que fazer a respeito. Só a recusa da guarda a traz (RF-407). */
      alternativa: string | null
    }

/** O que `call-cancel` responde. Cancelar o que já acabou é sucesso. */
export type ResultadoDoEncerramento =
  | { ok: true; mensagem: string }
  | { ok: false; mensagem: string }

/** O que `emergency-stop` responde, nas duas ações. */
export type ResultadoDoFreio =
  | { ok: true; mensagem: string }
  | { ok: false; mensagem: string }

/**
 * Uma chamada em curso, com as seis colunas de `call_live` e nenhuma a mais.
 * O conjunto é cobrado em `chamadas/ao-vivo.test.ts`.
 */
export interface ChamadaAoVivo {
  chamadaId: string
  contaId: string
  /** `queued`, `ringing` ou `in_progress`. */
  status: string
  proposito: string
  leadId: string | null
  /** Em ISO-8601. A duração corre a partir daqui. */
  iniciadaEm: string
  duracaoSeg: number | null
}

/** O que a assinatura entrega a cada mudança. */
export type EventoAoVivo =
  | { tipo: 'chamadas'; chamadas: ChamadaAoVivo[] }
  | { tipo: 'erro' }

/** Os quatro componentes de custo de `call_costs` (T-20). */
export const COMPONENTES_DE_CUSTO = ['telephony', 'voice', 'model', 'infra'] as const
export type ComponenteDeCusto = (typeof COMPONENTES_DE_CUSTO)[number]

/** Uma linha de `call_costs`, no que a ficha lê dela. */
export interface ParcelaDeCusto {
  componente: string
  centavos: number
  /** ISO 4217. A voz e o modelo chegam em dólar; a telefonia, na moeda da conta. */
  moeda: string
}

/** Um turno de `calls.transcript.turns`, como `call-finalize` o grava. */
export interface TurnoGravado {
  /** `agent` ou `lead` (RF-412). Outro valor é lido como desconhecido. */
  quem: string
  texto: string
  /** Instante absoluto do turno, em ISO-8601. */
  em: string
}

/** Uma linha de `call_tool_invocations`. */
export interface FerramentaUsada {
  /** `system:end_call`, `tool-dnc`, ... */
  ferramenta: string
  /** Em ISO-8601. */
  em: string
  /** `error` da linha: nulo é o caso normal. */
  erro: string | null
}

/**
 * A ficha da chamada (RF-414), lida de `calls` e das duas filhas pela RLS de
 * membro. A transcrição vem aqui, por consulta, e nunca pela assinatura
 * (decisão 3 do cabeçalho).
 *
 * `classificacao` é o `jsonb` como está: em F2 quem o escreve é
 * `call-classify` (US-071), e a ficha só lê `stage_key` e `summary` quando são
 * texto. O resto do objeto é ignorado em vez de adivinhado.
 */
export interface FichaDaChamada {
  id: string
  proposito: string
  /** `outbound`, `inbound` ou `rehearsal`. */
  direcao: string
  status: string
  leadId: string | null
  leadNome: string | null
  numeroDeDestino: string | null
  numeroDeOrigem: string | null
  iniciadaEm: string
  atendidaEm: string | null
  encerradaEm: string | null
  duracaoSeg: number | null
  /** `calls.cost_cents`, a soma materializada de `call_costs`. */
  custoTotalCentavos: number
  parcelas: ParcelaDeCusto[]
  turnos: TurnoGravado[]
  ferramentas: FerramentaUsada[]
  motivoDoFim: string | null
  atendidaPor: string | null
  /** `calls.consent_notice_at` (RF-420). Nulo é aviso não localizado. */
  avisoDeGravacaoEm: string | null
  /** `calls.recording_path`. Nulo depois do expurgo ou sem gravação. */
  caminhoDaGravacao: string | null
  /** `calls.recording_expires_at`. Continua na linha depois do expurgo. */
  gravacaoExpiraEm: string | null
  sentimento: number | null
  classificacao: Readonly<Record<string, unknown>>
  /** `tool`, `backfill` ou `human`. Nulo é classificação ainda não feita. */
  origemDaClassificacao: string | null
  /** `calls.classification_confidence`, de 0 a 1. Só existe em `backfill`. */
  confiancaDaClassificacao: number | null
  /** O nome de quem corrigiu (`classification_corrected_by`), quando há nome. */
  corrigidaPor: string | null
  /** `calls.classification_corrected_at`. */
  corrigidaEm: string | null
  notaDaAvaliacao: number | null
  /** `calls.evaluation.itens`, como a finalização os grava. */
  itensDaAvaliacao: ItemAvaliado[]
  /** `evaluation_criteria` da conta, em `position`: dão o rótulo de cada item. */
  criteriosDaConta: CriterioDaConta[]
  /** As etapas do funil padrão da conta, em ordem: a correção oferece estas. */
  etapas: EtapaDaCorrecao[]
}

/** Um item de `calls.evaluation.itens`. `aprovado` nulo é critério sem decisão. */
export interface ItemAvaliado {
  criterio: string
  aprovado: boolean | null
  evidencia: string | null
}

/** Uma linha de `evaluation_criteria`, no que a ficha lê dela. */
export interface CriterioDaConta {
  chave: string
  rotulo: string
}

/** Uma etapa de `pipeline_stages`: a tela mostra o rótulo e envia a chave. */
export interface EtapaDaCorrecao {
  chave: string
  rotulo: string
}

/**
 * O pedido de correção, como a tela o monta. A etapa viaja pela chave, nunca
 * pelo rótulo: renomear a etapa não pode mudar o que foi gravado.
 */
export interface PedidoDeCorrecao {
  chamadaId: string
  /** A classificação inteira que vai para `corrigir_classificacao`. */
  classificacao: Record<string, unknown>
  motivo: string
}

export type MotivoDeFalhaDaCorrecao =
  | 'sem-permissao'
  | 'nao-encontrada'
  | 'classificacao-invalida'
  | 'falha-de-comunicacao'

export type ResultadoDaCorrecao = { ok: true } | { ok: false; motivo: MotivoDeFalhaDaCorrecao }

export type MotivoDeFalhaDaFicha = MotivoDeFalhaDeChamadas | 'nao-encontrada'

export type CargaDaFicha =
  | { ok: true; ficha: FichaDaChamada }
  | { ok: false; motivo: MotivoDeFalhaDaFicha }

/**
 * O que `call-audio` (US-072) responde. `gravacao_expurgada` é o 410, e a
 * frase dele já traz o prazo de retenção da conta.
 */
export type ResultadoDoAudio =
  | { ok: true; url: string; expiraEm: string }
  | { ok: false; motivo: string; mensagem: string }

/** Como a lista se ordena (RF-413). As três são do maior para o menor. */
export type OrdenacaoDeChamadas = 'instante' | 'duracao' | 'custo'

/**
 * O recorte que `listarChamadas` recebe, montado por `recorteDaBusca` em
 * `chamadas/consulta.ts`. `desde` é instante em ISO, e não período: é o que
 * a consulta precisa, e o período fica na barra de endereço.
 */
export interface RecorteDeChamadas {
  desde?: string
  proposito?: Proposito
  /** Um valor de `calls.end_reason`. */
  resultado?: string
  /** E.164 quando o número é válido, senão só os dígitos digitados. */
  numero?: string
  ordenacao: OrdenacaoDeChamadas
  /**
   * As direções que a lista mostra. Viaja no recorte, e não fica escrita na
   * consulta, para a F3 não ter de caçar onde o ensaio foi excluído (T-16).
   */
  direcoes: readonly string[]
}

/** Uma linha de `/chamadas`, com o que a lista desenha e nada mais. */
export interface ChamadaDaLista {
  id: string
  proposito: string
  /** `outbound` ou `inbound`. O ensaio não chega aqui. */
  direcao: string
  status: string
  leadId: string | null
  leadNome: string | null
  /** O número do outro lado: o destino na ligação feita, a origem na recebida. */
  numero: string | null
  iniciadaEm: string
  duracaoSeg: number | null
  /** As parcelas de `call_costs`, para o total sair por moeda como na ficha. */
  parcelas: ParcelaDeCusto[]
  motivoDoFim: string | null
  nota: number | null
}

export interface PaginaDeChamadas {
  chamadas: ChamadaDaLista[]
  /** A lista bateu no teto: há chamadas mais antigas fora dela. */
  truncada: boolean
}

export type MotivoDeFalhaDaLista = MotivoDeFalhaDeChamadas | 'filtro-invalido'

export type CargaDeChamadas =
  | { ok: true; pagina: PaginaDeChamadas }
  | { ok: false; motivo: MotivoDeFalhaDaLista }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
// O ciclo de evolução (US-245) -------------------------------------------------

/**
 * O que a tela do ciclo recebe de `call-review`. Os tipos vêm da borda pelo
 * alias `@revisao`, e não de uma segunda declaração aqui: o corpo que a função
 * devolve e o que a tela lê são o mesmo contrato, e manter duas versões dele
 * seria manter duas que divergem na primeira mudança.
 */
import type { CorpoDaRevisao } from '@revisao/revisao.ts'

export type { CorpoDaRevisao, MudancaNaTela, PerguntaNaTela } from '@revisao/revisao.ts'

/** Uma resposta do questionário, como a tela a devolve. */
export interface RespostaDaPergunta {
  id: string
  resposta: string
}

/** A decisão sobre uma proposta, como a tela a devolve. */
export interface DecisaoDaProposta {
  id: string
  aceita: boolean
}

/**
 * O que um passo do ciclo devolve. A recusa chega pronta em `mensagem`: as
 * frases são de `call-review/respostas.ts`, e traduzir de novo aqui faria a
 * tela e a borda discordarem no dia em que uma delas mudasse.
 */
export type ResultadoDoPasso =
  | { ok: true; corpo: CorpoDaRevisao }
  | {
      ok: false
      mensagem: string
      /**
       * Para onde a tela manda quem pode resolver a recusa. Vem da borda, que
       * é quem sabe o que falta — hoje só a conexão do provedor de modelo. A
       * tela oferece o botão em vez de deixar a pessoa procurar.
       */
      caminho?: string
    }

/** Um valor numa moeda, em centavos. */
export interface ValorEstimado {
  centavos: number
  moeda: string
}

/**
 * A estimativa de custo antes de ligar (D-14), lida de `estimativa_de_custo`:
 * a média das últimas ligações atendidas da conta com preço, por moeda. Sem
 * ligação medida, `ligacoesMedidas` é zero e as listas vêm vazias.
 */
export interface EstimativaDeCusto {
  ligacoesMedidas: number
  duracaoMediaSeg: number | null
  porLigacao: ValorEstimado[]
  porMinuto: ValorEstimado[]
}

export type CargaDaEstimativa =
  | { ok: true; estimativa: EstimativaDeCusto }
  | { ok: false; motivo: MotivoDeFalhaDeChamadas }

export interface ServicoDeChamadas {
  carregarOperacao(): Promise<CargaDaOperacao>
  carregarDiscador(): Promise<CargaDoDiscador>
  /** Chama `call-place` com `fonte: 'manual'`. */
  discar(pedido: PedidoDeLigacao): Promise<ResultadoDaLigacao>
  /** Chama `call-cancel` para a chamada. */
  encerrar(chamadaId: string): Promise<ResultadoDoEncerramento>
  /** Chama `emergency-stop` com `acao: 'parar'`. */
  pararDiscagem(motivo: string): Promise<ResultadoDoFreio>
  /** Chama `emergency-stop` com `acao: 'retomar'`. */
  retomarDiscagem(motivo: string): Promise<ResultadoDoFreio>
  /**
   * Assina `call_live` da conta. Entrega a lista inteira a cada mudança, a
   * primeira logo depois de assinar, e devolve quem cancela a assinatura.
   */
  assinarAoVivo(aoReceber: (evento: EventoAoVivo) => void): () => void
  /** Lê a ficha de uma chamada da conta. De outra conta é `nao-encontrada`. */
  carregarFicha(chamadaId: string): Promise<CargaDaFicha>
  /** Chama `corrigir_classificacao` com a classificação e o motivo (RF-415). */
  corrigirClassificacao(pedido: PedidoDeCorrecao): Promise<ResultadoDaCorrecao>
  /**
   * Chama `call-audio` pela URL assinada. Só no momento de tocar: a validade é
   * de cinco minutos, e pedida no carregamento venceria antes do play.
   */
  pedirAudio(chamadaId: string): Promise<ResultadoDoAudio>
  /** A lista de `/chamadas`, no recorte pedido e com o teto da lista. */
  listarChamadas(recorte: RecorteDeChamadas): Promise<CargaDeChamadas>
  /** Chama `estimativa_de_custo` da conta: o custo medido antes de ligar (D-14). */
  estimarCusto(): Promise<CargaDaEstimativa>
  /** Abre a revisão: `call-review` com `analisar`. Devolve o questionário. */
  analisarChamada(chamadaId: string): Promise<ResultadoDoPasso>
  /** Responde o questionário e recebe as propostas. */
  responderRevisao(revisaoId: string, respostas: readonly RespostaDaPergunta[]): Promise<ResultadoDoPasso>
  /** Pede uma proposta diferente, dizendo o que não serviu. */
  questionarProposta(revisaoId: string, mudancaId: string, questionamento: string): Promise<ResultadoDoPasso>
  /** Aplica o que foi aceito: grava o rascunho da versão e encerra a revisão. */
  aplicarRevisao(revisaoId: string, decisoes: readonly DecisaoDaProposta[]): Promise<ResultadoDoPasso>
  /** Encerra a revisão sem aplicar nada. */
  descartarRevisao(revisaoId: string): Promise<ResultadoDoPasso>
}
