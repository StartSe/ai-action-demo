import type { ModoDoWhatsapp } from '@compartilhado/whatsapp/modo.ts'

/**
 * O que a interface conhece do canal de WhatsApp (Z-API): a lista de
 * conversas (`/conversas`), a conversa aberta (`/conversas/$id`), a ação de
 * enviar mensagem ou mudar quem atende, a conexão do provedor
 * (`whatsapp-connect`) e o canal ligado/desligado da conta
 * (`account_settings`).
 *
 * As tabelas (`whatsapp_conversations`, `whatsapp_messages`) são de leitura
 * por membro via PostgREST; toda escrita passa pela borda `whatsapp-send`,
 * que é quem fala com a Z-API e quem decide o que o RLS não decide sozinho
 * (canal desligado, número bloqueado, conversa encerrada). A interface nunca
 * grava a tabela direto.
 */

export type StatusDaConversa = 'assistente' | 'humano' | 'encerrada'

export type DirecaoDaMensagem = 'in' | 'out'

export type AutorDaMensagem = 'lead' | 'assistente' | 'humano' | 'sistema'

export type StatusDaMensagem = 'recebida' | 'enviada' | 'entregue' | 'lida' | 'falhou'

/**
 * `whatsapp_messages.media_kind`. `null` é mensagem de texto comum; os demais
 * chegam com `body` às vezes vazio, e a tela mostra um rótulo genérico no
 * lugar do texto que não veio.
 */
export type TipoDeMidia =
  | 'audio'
  | 'imagem'
  | 'video'
  | 'documento'
  | 'figurinha'
  | 'localizacao'
  | 'contato'
  | 'outro'

export type EstadoDaLeitura = 'pendente' | 'lida' | 'falhou'

export interface MensagemDaConversa {
  id: string
  direcao: DirecaoDaMensagem
  autor: AutorDaMensagem
  corpo: string
  midia: TipoDeMidia | null
  /**
   * A transcrição do áudio ou a descrição da imagem, escrita pelo modelo da
   * conta (`whatsapp_messages.media_text`). `corpo` continua sendo só o que o
   * lead escreveu, como a legenda.
   */
  leituraDaMidia: string | null
  /** `media_status`: nulo para texto e para a mídia que o modelo não lê. */
  estadoDaLeitura: EstadoDaLeitura | null
  status: StatusDaMensagem
  erro: string | null
  criadaEm: string
}

/** Uma linha de `/conversas`: o lead ou o telefone, a prévia e o estado. */
export interface ConversaDaLista {
  id: string
  leadId: string | null
  leadNome: string | null
  telefone: string
  status: StatusDaConversa
  proposito: string | null
  ultimaMensagem: { corpo: string; midia: TipoDeMidia | null; em: string } | null
  atualizadaEm: string
}

/** A conversa aberta em `/conversas/$id`, com o histórico inteiro. */
export interface ConversaDetalhe {
  id: string
  leadId: string | null
  leadNome: string | null
  telefone: string
  status: StatusDaConversa
  proposito: string | null
  /** Quem começou a conversa: o lead escrevendo primeiro, ou a assistente. */
  iniciadaPor: 'lead' | 'assistente' | 'humano' | null
  criadaEm: string
  mensagens: MensagemDaConversa[]
}

export type FiltroDeStatus = StatusDaConversa | 'todas'

export type MotivoDeFalhaDoWhatsapp = 'sem-permissao' | 'sem-conta' | 'falha-de-comunicacao'

export type CargaDeConversas =
  | { ok: true; conversas: ConversaDaLista[] }
  | { ok: false; motivo: MotivoDeFalhaDoWhatsapp }

export type MotivoDaConversa = 'nao-encontrada' | MotivoDeFalhaDoWhatsapp

export type CargaDaConversa =
  | { ok: true; conversa: ConversaDetalhe }
  | { ok: false; motivo: MotivoDaConversa }

/** A conversa mais recente de um lead, para o botão e o link na ficha dele. */
export type CargaDaConversaDoLead =
  | { ok: true; conversa: ConversaDaLista | null }
  | { ok: false; motivo: MotivoDeFalhaDoWhatsapp }

/** As quatro ações de `whatsapp-send`, mais o padrão (`mensagem`) implícito. */
export type AcaoDaConversa = 'mensagem' | 'assumir' | 'devolver' | 'encerrar' | 'iniciar'

export interface PedidoDaAcao {
  conversaId?: string
  leadId?: string
  texto?: string
  acao: AcaoDaConversa
}

/**
 * O resultado de `whatsapp-send`. `motivo` é o código que a borda levanta
 * (`supabase/functions/whatsapp-send/respostas.ts`) e `mensagem` já vem em
 * português, pronta para a tela — nunca reescrita aqui.
 */
export type ResultadoDaAcao =
  | { ok: true; conversaId: string; status: StatusDaConversa }
  | { ok: false; motivo: string; mensagem: string }

/** Os quatro estados que `whatsapp-connect` observa (RF, o mesmo de `integrations-status`). */
export type EstadoDaConexao = 'conectado' | 'nao_configurado' | 'erro' | 'indisponivel'

export type ResultadoDaConexao =
  | { ok: true; estado: EstadoDaConexao; mensagem: string }
  | { ok: false; motivo: string; mensagem: string }

/**
 * Quem a assistente atende: `account_settings.whatsapp_mode`. O vocabulário e
 * a regra moram em `_shared/whatsapp/modo.ts`, lidos pela borda também.
 */
export type { ModoDoWhatsapp } from '@compartilhado/whatsapp/modo.ts'

/** O canal na conta: `account_settings.whatsapp_*`. */
export interface CanalDoWhatsapp {
  habilitado: boolean
  /** `teste`: só os números de teste da conta. `todos`: quem escrever. */
  modo: ModoDoWhatsapp
  preContato: boolean
  /** `null` é "usar o texto padrão do servidor". */
  textoDoPreContato: string | null
}

export type CargaDoCanal =
  | { ok: true; canal: CanalDoWhatsapp | null }
  | { ok: false; motivo: MotivoDeFalhaDoWhatsapp }

export type GravacaoDoCanal =
  | { ok: true; canal: CanalDoWhatsapp }
  | { ok: false; motivo: MotivoDeFalhaDoWhatsapp }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
export interface ServicoDeWhatsapp {
  /** As conversas da conta, no filtro pedido. */
  listarConversas(filtro?: FiltroDeStatus): Promise<CargaDeConversas>
  /** Uma conversa com o histórico inteiro de mensagens. */
  carregarConversa(id: string): Promise<CargaDaConversa>
  /** A conversa mais recente deste lead, ou `null` quando não há nenhuma. */
  carregarConversaDoLead(leadId: string): Promise<CargaDaConversaDoLead>
  /** Envia mensagem ou muda quem atende, pela borda `whatsapp-send`. */
  agir(pedido: PedidoDaAcao): Promise<ResultadoDaAcao>
  /** Registra o webhook da Z-API com as chaves recém-salvas (`whatsapp-connect`). */
  conectar(): Promise<ResultadoDaConexao>
  /** O canal ligado/desligado e o pré-contato, de `account_settings`. Leitura de membro. */
  carregarCanal(): Promise<CargaDoCanal>
  /** Grava os quatro campos juntos. Só admin, pela política de `account_settings`. */
  definirCanal(canal: CanalDoWhatsapp): Promise<GravacaoDoCanal>
  /**
   * Avisa quando uma mensagem desta conversa mudou (tempo real). Não entrega a
   * linha: quem ouve refaz a carga de sempre. Devolve quem cancela.
   */
  assinar(conversaId: string, aoMudar: () => void): () => void
}
