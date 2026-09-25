/**
 * O que a tela `/fila` (Precisam de você) conhece. A tabela é
 * `exception_items` (US-097, US-131), a resolução é o RPC
 * `resolver_item_de_fila` (US-131) e o áudio sai de `call-audio`, pelo
 * serviço de chamadas.
 */

/**
 * Os sete tipos de RF-909, na ordem do requisito, e `classificacao_pendente`,
 * que `call-classify` abre quando o modelo não responde (US-139).
 */
export const TIPOS = [
  'pedido_humano',
  'pedido_bloqueio',
  'sentimento_negativo',
  'falha_repetida',
  'reuniao_sem_especialista',
  'avaliacao_reprovada',
  'credito_baixo',
  'classificacao_pendente',
] as const

export type TipoDoItem = (typeof TIPOS)[number]

/**
 * Os nomes da F3, que tool-transfer, tool-dnc e `abrir_item_de_falha_repetida`
 * ainda escrevem. A migração `20260929150000_fila_completa.sql` os declara
 * sinônimos, e a leitura os traduz: a tela só conhece os tipos de RF-909.
 */
export const SINONIMOS_DA_F3: Readonly<Record<string, TipoDoItem>> = {
  human_requested: 'pedido_humano',
  dnc_requested: 'pedido_bloqueio',
  repeated_failure: 'falha_repetida',
}

/**
 * Tipo cujo produtor chega numa fatia seguinte. Aparece no filtro como
 * indisponível, com a fatia, e não ganha ação: nenhum item dele existe ainda.
 */
export const TIPOS_DE_FATIA_SEGUINTE: Readonly<Partial<Record<TipoDoItem, string>>> = {
  reuniao_sem_especialista: 'F5',
}

/** O filtro por tipo: um deles ou todos. */
export type FiltroDeTipo = TipoDoItem | 'todos'

export const SEVERIDADES = ['alta', 'media', 'baixa'] as const

export type Severidade = (typeof SEVERIDADES)[number]

export const ESTADOS_DA_FILA = ['aberto', 'resolvido'] as const

export type EstadoDaFila = (typeof ESTADOS_DA_FILA)[number]

/** A mesma régua de `estadoDaGravacao`, da ficha da chamada. */
export type GravacaoDoItem = 'disponivel' | 'sem_gravacao' | 'expurgada'

/**
 * O que o `context` do item traz, lido com recusa para o que não casa: a
 * coluna é `jsonb`, e cada ferramenta escreve a sua parte (tool-transfer,
 * tool-dnc, call-finalize, call-classify e `abrir_item_de_falha_repetida`).
 */
export interface ContextoDoItem {
  /** O trecho da conversa: `recorte` nas ferramentas da F3, `trecho` nos gatilhos da F4. */
  recorte: string | null
  /** tool-transfer: a urgência dita na conversa. */
  urgencia: 'alta' | 'normal' | null
  /** tool-transfer: por que não houve para quem transferir. */
  pendencia: 'destino_ausente' | 'destino_invalido' | null
  /** tool-dnc: pedido do lead ou pessoa errada. */
  origem: 'lead_request' | 'wrong_number' | null
  /** Falha repetida: quantas tentativas seguidas contaram. */
  tentativas: number | null
  telefone: string | null
  /** Sentimento negativo: o valor da conversa, de -1 a 1. */
  sentimento: number | null
  /** Avaliação reprovada: as chaves dos critérios reprovados. */
  criterios: string[]
  /** Crédito baixo: o provedor e o saldo lido, em centavos. */
  provedor: string | null
  saldoCents: number | null
  /**
   * Classificação pendente: por que o modelo não classificou. Conversa de
   * WhatsApp (`pedido_humano` com `canal: 'whatsapp'`): por que a assistente
   * não respondeu.
   */
  motivo:
    | 'modelo_indisponivel'
    | 'resposta_ilegivel'
    | 'modelo_nao_conectado'
    | 'falha_da_assistente'
    | 'assistente_nao_publicada'
    | null
}

/** As quatro colunas de `account_settings` que abrem item (US-126). */
export const CHAVES_DO_LIMIAR = [
  'sentiment_floor',
  'failed_criteria_cap',
  'consecutive_failures_cap',
  'credit_alert_cents',
] as const

export type ChaveDoLimiar = (typeof CHAVES_DO_LIMIAR)[number]

/** Um limiar como estava quando o item nasceu, lido de `threshold_snapshot`. */
export interface LimiarDoItem {
  chave: ChaveDoLimiar
  valor: number
}

export interface Resolucao {
  /** `resolved_by`, o usuário. A tela troca pelo nome do membro. */
  autor: string
  em: string
  texto: string
}

export interface ItemDaFila {
  id: string
  tipo: TipoDoItem
  severidade: Severidade
  criadoEm: string
  /** Nulo quando o lead foi apagado depois (a chave zera a coluna). */
  lead: { id: string; nome: string | null; telefone: string | null } | null
  chamadaId: string | null
  gravacao: GravacaoDoItem
  contexto: ContextoDoItem
  /**
   * O limiar que criou o item (RF-908). Vazio é item que não nasce de limiar:
   * a Sarah o abriu na conversa, ou ele é anterior aos limiares da conta.
   */
  limiares: LimiarDoItem[]
  resolucao: Resolucao | null
}

export type MotivoDeFalhaDaFila = 'sem-conta' | 'sem-permissao' | 'falha-de-comunicacao'

export type CargaDaFila =
  | {
      ok: true
      itens: ItemDaFila[]
      /**
       * A conta tem algum item, em qualquer estado. É o que separa os dois
       * vazios: fila nunca preenchida e recorte sem resultado.
       */
      haItens: boolean
    }
  | { ok: false; motivo: MotivoDeFalhaDaFila }

/**
 * Os códigos de `resolver_item_de_fila`, mais a falha de rede. O RPC diz
 * `item_de_outra_conta` para inexistente e alheio sem distinguir; o serviço o
 * entrega como `inexistente`, que é o que a tela consegue explicar.
 */
export type CodigoDaResolucao =
  | 'resolvido'
  | 'ja_resolvido'
  | 'sem_permissao'
  | 'inexistente'
  | 'resolucao_vazia'
  | 'falha-de-comunicacao'

export type ResultadoDaResolucao =
  | { codigo: 'resolvido' }
  /** A resolução que ficou, relida depois do código, quando a leitura voltou. */
  | { codigo: 'ja_resolvido'; resolucao: Resolucao | null }
  | { codigo: Exclude<CodigoDaResolucao, 'resolvido' | 'ja_resolvido'> }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
/** Se o tempo real está de pé. Indisponível liga a recarga por intervalo. */
export type EstadoDaAssinatura = 'conectando' | 'ativa' | 'indisponivel'

export interface ServicoDaFila {
  /** Os itens da conta no estado pedido. A ordem da tela é de `ordenarItens`. */
  carregar(estado: EstadoDaFila): Promise<CargaDaFila>
  /** Pelo RPC `resolver_item_de_fila`. O autor é quem está na sessão. */
  resolver(id: string, texto: string): Promise<ResultadoDaResolucao>
  /**
   * A ação do pedido de bloqueio: garante o número em `dnc_entries` (o
   * bloqueio ativo que já existe conta como feito) e só então resolve o item.
   * Inclusão que a RLS recusa devolve `sem_permissao` e não resolve nada.
   */
  confirmarBloqueio(id: string, telefone: string, texto: string): Promise<ResultadoDaResolucao>
  /**
   * Avisa quando algum item da conta mudou (tempo real). Não entrega a linha:
   * quem ouve refaz a carga. `aoTrocarEstado` diz se a assinatura subiu ou
   * caiu. Devolve quem cancela a assinatura.
   */
  assinar(aoMudar: () => void, aoTrocarEstado?: (estado: EstadoDaAssinatura) => void): () => void
}
