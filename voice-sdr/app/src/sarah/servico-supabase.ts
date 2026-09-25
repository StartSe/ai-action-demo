// O serviço da Sarah sobre o Supabase: lê e grava `agents`, e responde em que
// estado as quatro publicações estão (RF-311).
//
// A decisão que pesa aqui é **de onde vem o estado de publicação**. Ele não é
// coluna: é a comparação entre o hash do que está gravado e o hash do que está
// no ar, por propósito. Quem sabe fazer essa conta é
// `@compartilhado/agente/compilador.ts`, o mesmo módulo que `agent-publish`
// usa, e é ele que roda aqui. A alternativa seria a tela deduzir "salvei, logo
// está desatualizado", que erra nos dois sentidos: erra ao dizer que mudou
// quando alguém gravou o mesmo texto de novo, e erra ao calar quando a mudança
// veio de outra tela.
//
// O preço é ler quatro coisas em vez de uma: a identidade, as publicações, a
// política da conta e os roteiros publicados. É o mesmo conjunto que a borda
// lê para publicar, e por isso o hash bate.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import {
  compilarPublicacao,
  estadoDePublicacao,
  propositosNoAr,
  type EstadoDePublicacao,
  type HashPorProposito,
  type PublicacaoRegistrada,
} from '@compartilhado/agente/compilador.ts'
import { COLUNAS_DO_CRITERIO, lerLinhaDeCriterio } from '@compartilhado/qualificacao/avaliacao.ts'
import { PROPOSITOS, type Proposito } from '@compartilhado/playbook/camada-um.ts'
import {
  pendenciaDosWebhooks,
  type CorpoDaPublicacao,
  type CorpoDeRecusa,
} from '@publicacao/publicacao.ts'
import {
  ajustesParaGravar,
  lerAjustesGravados,
} from '@voz/formato-do-provedor.ts'

import { padraoDeBusca } from '@/leads/consulta'
import { aparar } from '@/sarah/identidade'
import {
  mudouDesdeAIndexacao,
  TETO_DA_LISTA as TETO_DO_CONHECIMENTO,
} from '@/sarah/conhecimento'
import type {
  AberturaDoEnsaio,
  CargaDaSarah,
  CargaDoConhecimento,
  CargaDaVozDaSarah,
  CargaDoCatalogo,
  CargaDoModelo,
  CatalogoDeVozes,
  EncerramentoDoEnsaio,
  EntradaDeConhecimento,
  EscolhaDeVoz,
  GravacaoDaEntrada,
  InicioDaConexao,
  ModeloDoCatalogo,
  RemocaoDaEntrada,
  ResultadoDaConexao,
  ResultadoDaEntradaNaTela,
  ResultadoDaPublicacao,
  SincronizacaoDoConhecimento,
  GravacaoDaIdentidade,
  GravacaoDaVoz,
  IdentidadeDaSarah,
  MotivoDeFalhaDaSarah,
  PendenciaDaAmostra,
  RespostaDaAmostra,
  ServicoDaSarah,
  AmostraDaPrimeiraFala,
  CargaDosPlaybooks,
  EstadoDaVersao,
  GravacaoDoRascunho,
  PlaybookDoProposito,
  PublicacaoDoPlaybook,
  RascunhoGerado,
  SugestaoDaEtapa,
  SugestoesGeradas,
  EntrevistaAberta,
  EntrevistaEncerrada,
  VersaoDoPlaybook,
} from '@/sarah/tipos'

/** A política de RLS recusou: `has_role(account_id, 'admin')` disse não. */
const PRIVILEGIO_INSUFICIENTE = '42501'

/** A borda que lista as vozes em português e sintetiza a amostra (US-062). */
const FUNCAO_DO_CATALOGO = 'voice-catalog'

/** A borda que publica os quatro propósitos no provedor (US-061). */
const FUNCAO_DE_PUBLICACAO = 'agent-publish'

/** A borda que compara o publicado com o que o provedor tem (R-06). */
const FUNCAO_DE_ESTADO = 'integrations-status'

/** A borda que escreve um rascunho de roteiro (US-063). */
const FUNCAO_DE_RASCUNHO = 'playbook-draft'

/** As primeiras sugestões do assistente de abertura. Não grava nada. */
const FUNCAO_DE_SUGESTOES = 'onboarding-suggest'

/** A entrevista de configuração por voz. Também não grava nada. */
const FUNCAO_DE_ENTREVISTA = 'onboarding-interview'

const COLUNAS_DA_VERSAO =
  'id, playbook_id, version, status, body_script, body_house, change_note, published_at, created_at'

const ESTADOS_DA_VERSAO = new Set<string>(['draft', 'published', 'archived'])

function paraVersao(linha: Record<string, unknown>): VersaoDoPlaybook {
  const estado = String(linha.status)
  return {
    id: String(linha.id),
    versao: Number(linha.version),
    // Estado que a tela não conhece vira arquivado: é o único dos três que
    // não oferece nada, nem editar nem dizer que está no ar.
    estado: (ESTADOS_DA_VERSAO.has(estado) ? estado : 'archived') as EstadoDaVersao,
    roteiro: String(linha.body_script ?? ''),
    jeitoDaCasa: String(linha.body_house ?? ''),
    nota: (linha.change_note as string | null) ?? null,
    publicadaEm: (linha.published_at as string | null) ?? null,
    criadaEm: String(linha.created_at ?? ''),
  }
}

/**
 * O corpo de uma função de borda que respondeu fora de 2xx. O cliente do
 * Supabase entrega esse caso como erro, com a resposta em `context`, e é ali
 * que `agent-publish` põe a frase da recusa (409 sem voz, 403 sem papel).
 */
async function corpoDoErro(erro: unknown): Promise<unknown> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return null
  try {
    return await contexto.json()
  } catch {
    return null
  }
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaSarah {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  return 'falha-de-comunicacao'
}

/** A linha de `agents`, no recorte que a tela e o compilador precisam. */
export interface LinhaDoAgente {
  id: string
  name: string
  company_name: string
  offer_line: string | null
  never_claim: string[]
  transfer_target: string | null
  voice_id: string | null
  voice_settings: Record<string, unknown>
  first_message: string | null
  whatsapp_first_message: string | null
  voice_channel_style: string | null
  whatsapp_channel_style: string | null
}

/** Texto opcional é vazio na tela e nulo no banco. A conversão mora aqui. */
function paraTexto(valor: string | null): string {
  return valor ?? ''
}

function paraColuna(valor: string): string | null {
  const aparado = valor.trim()
  return aparado === '' ? null : aparado
}

function paraIdentidade(linha: LinhaDoAgente): IdentidadeDaSarah {
  return {
    nome: linha.name,
    empresa: linha.company_name,
    oferta: paraTexto(linha.offer_line),
    nuncaAfirmar: [...linha.never_claim],
    destinoDeTransferencia: paraTexto(linha.transfer_target),
    primeiraFala: paraTexto(linha.first_message),
    aberturaDoWhatsapp: paraTexto(linha.whatsapp_first_message),
    jeitoNaVoz: paraTexto(linha.voice_channel_style),
    jeitoNoWhatsapp: paraTexto(linha.whatsapp_channel_style),
  }
}

/**
 * O que a borda do catálogo devolveu, no recorte que a tela usa. Corpo
 * truncado ou de uma versão mais velha da função não pode virar meia tela: sem
 * `estado` legível não há catálogo, e a tela diz falha de comunicação.
 */
interface RespostaDoCatalogo {
  catalogo: CatalogoDeVozes
  amostra: AmostraDaPrimeiraFala | null
  pendencia: PendenciaDaAmostra | null
}

const ESTADOS_DO_CATALOGO = new Set([
  'conectado',
  'nao_configurado',
  'erro',
  'indisponivel',
])

function lerCorpoDoCatalogo(bruto: unknown): RespostaDoCatalogo | null {
  const corpo = bruto as Record<string, unknown> | null
  if (corpo?.ok !== true) return null
  if (typeof corpo.estado !== 'string' || !ESTADOS_DO_CATALOGO.has(corpo.estado)) {
    return null
  }

  return {
    catalogo: {
      estado: corpo.estado as CatalogoDeVozes['estado'],
      vozes: Array.isArray(corpo.vozes)
        ? (corpo.vozes as CatalogoDeVozes['vozes'])
        : [],
      vozesIgnoradas:
        typeof corpo.vozesIgnoradas === 'number' ? corpo.vozesIgnoradas : 0,
      erro: (corpo.erro as CatalogoDeVozes['erro']) ?? null,
    },
    amostra: (corpo.amostra as AmostraDaPrimeiraFala | null) ?? null,
    pendencia: (corpo.pendenciaDaAmostra as PendenciaDaAmostra | null) ?? null,
  }
}

export async function lerAgenteDaConta(
  cliente: SupabaseClient,
  contaId: string,
): Promise<LinhaDoAgente | null | MotivoDeFalhaDaSarah> {
  const { data, error } = await cliente
    .from('agents')
    .select(
      'id, name, company_name, offer_line, never_claim, transfer_target, voice_id, voice_settings, first_message, whatsapp_first_message, voice_channel_style, whatsapp_channel_style',
    )
    .eq('account_id', contaId)
    .maybeSingle()

  if (error) return classificar(error)
  if (!data) return null

  const linha = data as Record<string, unknown>
  return {
    id: String(linha.id),
    name: String(linha.name ?? ''),
    company_name: String(linha.company_name ?? ''),
    offer_line: (linha.offer_line as string | null) ?? null,
    never_claim: Array.isArray(linha.never_claim)
      ? (linha.never_claim as string[])
      : [],
    transfer_target: (linha.transfer_target as string | null) ?? null,
    voice_id: (linha.voice_id as string | null) ?? null,
    voice_settings:
      typeof linha.voice_settings === 'object' && linha.voice_settings !== null
        ? (linha.voice_settings as Record<string, unknown>)
        : {},
    first_message: (linha.first_message as string | null) ?? null,
    whatsapp_first_message: (linha.whatsapp_first_message as string | null) ?? null,
    voice_channel_style: (linha.voice_channel_style as string | null) ?? null,
    whatsapp_channel_style: (linha.whatsapp_channel_style as string | null) ?? null,
  }
}

/** O que `medirPublicacaoDaConta` devolve. */
export interface MedicaoDaPublicacao {
  hashCompilado: HashPorProposito
  registradas: PublicacaoRegistrada[]
}

/**
 * O hash compilado de cada propósito e as publicações gravadas, calculados
 * como `agent-publish` os calcula. É a medição de "o que está no ar é o que
 * está gravado?", e quem a lê é o estado de RF-311 e a pendência de gravação
 * de L-18 (`/config/privacidade`).
 */
export async function medirPublicacaoDaConta(
  cliente: SupabaseClient,
  contaId: string,
  agente: LinhaDoAgente,
): Promise<MedicaoDaPublicacao> {
  const [publicacoes, politica, roteiros, criterios] = await Promise.all([
    cliente
      .from('agent_publications')
      .select('purpose, status, published_hash')
      .eq('account_id', contaId)
      .eq('agent_id', agente.id),
    cliente
      .from('account_settings')
      .select(
        'max_duration_seconds, recording_enabled, recording_notice_text, retention_days',
      )
      .eq('account_id', contaId)
      .maybeSingle(),
    cliente
      .from('playbook_versions')
      .select('id, version, body_script, body_house, playbooks!playbook_versions_do_playbook_da_conta!inner(purpose)')
      .eq('account_id', contaId)
      .eq('status', 'published'),
    // Os critérios da conta entram no hash como entram na publicação (US-142).
    cliente
      .from('evaluation_criteria')
      .select(COLUNAS_DO_CRITERIO)
      .eq('account_id', contaId)
      .order('position'),
  ])
  const criteriosDaConta = (criterios.data ?? []).map(lerLinhaDeCriterio)

  const registradas = (publicacoes.data ?? []).map(
    (linha: Record<string, unknown>): PublicacaoRegistrada => ({
      purpose: String(linha.purpose),
      status: String(linha.status),
      published_hash: (linha.published_hash as string | null) ?? null,
    }),
  )

  const linhaDaPolitica = politica.data as Record<string, unknown> | null
  // Sem política da conta não há o que compilar, e por isso não há hash com
  // que comparar. O que estiver no ar fica dito como pendente, que é a
  // verdade: ninguém consegue afirmar que ele é o que está gravado.
  if (!linhaDaPolitica) {
    return { hashCompilado: {} as HashPorProposito, registradas }
  }

  const porProposito = new Map(
    (roteiros.data ?? []).map((linha: Record<string, unknown>) => [
      String((linha.playbooks as { purpose?: string } | null)?.purpose ?? ''),
      linha,
    ]),
  )

  const hashCompilado: Record<string, string> = {}
  for (const proposito of PROPOSITOS) {
    const roteiro = porProposito.get(proposito)
    // Sem roteiro publicado o propósito não tem o que dizer, e por isso não
    // tem hash: é o mesmo `''` que `agent-publish` grava, e ele nunca bate
    // com o que está no ar.
    if (!roteiro) {
      hashCompilado[proposito] = ''
      continue
    }

    const compilada = await compilarPublicacao({
      proposito,
      identidade: {
        nome: agente.name,
        empresa: agente.company_name,
        oferta: agente.offer_line,
        nuncaAfirmar: agente.never_claim,
        vozId: agente.voice_id ?? '',
        ajustesDeVoz: agente.voice_settings,
        primeiraFala: agente.first_message ?? '',
        jeitoDoCanal: agente.voice_channel_style,
      },
      // O que é só do WhatsApp entra no hash como entra na publicação: mudar
      // a abertura ou o jeito do canal também pede publicar.
      whatsapp: {
        abertura: agente.whatsapp_first_message,
        jeito: agente.whatsapp_channel_style,
      },
      playbookPublicado: {
        playbookVersionId: String(roteiro.id),
        versao: Number(roteiro.version),
        camadaDois: String(roteiro.body_script ?? ''),
        camadaTres: String(roteiro.body_house ?? ''),
      },
      politica: {
        duracaoMaximaSegundos: Number(linhaDaPolitica.max_duration_seconds),
        gravacaoLigada: linhaDaPolitica.recording_enabled !== false,
        avisoDeGravacao:
          (linhaDaPolitica.recording_notice_text as string | null) ?? null,
        retencaoDias: Number(linhaDaPolitica.retention_days),
      },
      criteriosDaConta,
    })
    hashCompilado[proposito] = compilada.publishedHash
  }

  return { hashCompilado: hashCompilado as HashPorProposito, registradas }
}


/**
 * A frase de quando não houve borda para escrever uma. As recusas do ciclo
 * chegam prontas de `model-connect/respostas.ts`; esta só cobre a falha sem
 * corpo nenhum, que é rede caída antes de a função responder.
 */
const MENSAGEM_GENERICA_DO_MODELO =
  'Não foi possível falar com o provedor de modelo agora. Tente de novo em alguns minutos.'

/** A mesma ideia, para o ensaio: só a falha sem corpo nenhum cai aqui. */
const MENSAGEM_GENERICA_DO_ENSAIO =
  'Não foi possível continuar o ensaio agora. Tente de novo em alguns minutos.'

/** O texto de um campo do corpo, ou nulo quando ele não é texto útil. */
function textoOuNulo(valor: unknown): string | null {
  const limpo = typeof valor === 'string' ? valor.trim() : ''
  return limpo === '' ? null : limpo
}

/**
 * As variáveis da sessão que a borda montou, só os pares de texto. Valor vazio
 * fica: é o valor inicial seguro de um campo que o lead não tem.
 */
function somenteTextos(valor: unknown): Record<string, string> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return {}
  return Object.fromEntries(
    Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === 'string'),
  )
}

/** A frase que a borda mandou, ou a genérica quando não veio corpo. */
function mensagemDaConexao(corpo: Record<string, unknown> | null): string {
  return typeof corpo?.mensagem === 'string' ? corpo.mensagem : MENSAGEM_GENERICA_DO_MODELO
}

/** Uma linha de `knowledge_entries`, como o PostgREST a devolve. */
interface LinhaDoConhecimento {
  id: string
  question: string
  answer: string
  tags: string[] | null
  source: string
  provider_doc_id: string | null
  indexed_at: string | null
  indexed_hash: string | null
  sync_error: string | null
  removed_at: string | null
  updated_at: string
}

/**
 * A linha do banco vira entrada da tela. O `alteradaDepoisDeIndexada` é
 * calculado aqui pelo hash do documento — e não por comparação de datas,
 * porque `updated_at` muda quando alguém troca uma etiqueta, que não vai ao
 * provedor e não desatualiza nada.
 */
async function paraEntrada(linha: LinhaDoConhecimento): Promise<EntradaDeConhecimento> {
  return {
    id: linha.id,
    pergunta: linha.question,
    resposta: linha.answer,
    etiquetas: linha.tags ?? [],
    origem: linha.source,
    documento: linha.provider_doc_id,
    indexadaEm: linha.indexed_at,
    erro: linha.sync_error,
    removidaEm: linha.removed_at,
    alteradaDepoisDeIndexada: await mudouDesdeAIndexacao(
      { pergunta: linha.question, resposta: linha.answer },
      linha.indexed_hash,
    ),
    atualizadaEm: linha.updated_at,
  }
}

/** A frase de quando não houve borda para escrever uma. */
const MENSAGEM_GENERICA_DO_CONHECIMENTO =
  'Não foi possível falar com o provedor de voz agora. Tente de novo em alguns minutos.'

export function criarServicoDaSarah(cliente: SupabaseClient): ServicoDaSarah {
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDaSarah> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return classificar(error)
    if (!data) return 'sem-conta'
    return { id: data.account_id as string }
  }

  const lerAgente = (contaId: string) => lerAgenteDaConta(cliente, contaId)

  /**
   * Os três estados de RF-311. Qualquer leitura que falhe devolve `rascunho`:
   * a tela já mostra a falha do que importa, e um selo inventado seria pior do
   * que o estado mais modesto.
   */
  async function estadoDaPublicacao(
    contaId: string,
    agente: LinhaDoAgente,
  ): Promise<EstadoDePublicacao> {
    const medicao = await medirPublicacaoDaConta(cliente, contaId, agente)
    return estadoDePublicacao(medicao.hashCompilado, medicao.registradas)
  }

  /** O id de cada playbook por propósito, preenchido por `lerPlaybooks`. */
  const playbookIds = new Map<Proposito, string>()

  /** Os quatro playbooks com as versões, da mais nova para a mais velha. */
  async function lerPlaybooks(
    contaId: string,
  ): Promise<PlaybookDoProposito[] | MotivoDeFalhaDaSarah> {
    const [playbooks, versoes] = await Promise.all([
      cliente.from('playbooks').select('id, purpose').eq('account_id', contaId),
      cliente
        .from('playbook_versions')
        .select(COLUNAS_DA_VERSAO)
        .eq('account_id', contaId)
        .order('version', { ascending: false }),
    ])

    if (playbooks.error) return classificar(playbooks.error)
    if (versoes.error) return classificar(versoes.error)

    const porPlaybook = new Map<string, VersaoDoPlaybook[]>()
    for (const linha of (versoes.data ?? []) as Record<string, unknown>[]) {
      const chave = String(linha.playbook_id)
      porPlaybook.set(chave, [...(porPlaybook.get(chave) ?? []), paraVersao(linha)])
    }

    const idPorProposito = new Map(
      ((playbooks.data ?? []) as Record<string, unknown>[]).map((linha) => [
        String(linha.purpose),
        String(linha.id),
      ]),
    )

    // Os quatro nascem com a conta, por gatilho. Propósito sem linha aparece
    // sem versões, e a tela o desenha como vazio em vez de sumir com ele.
    return PROPOSITOS.map((proposito) => {
      const id = idPorProposito.get(proposito)
      if (id) playbookIds.set(proposito, id)
      return { proposito, versoes: id ? (porPlaybook.get(id) ?? []) : [] }
    })
  }

  /**
   * Os propósitos em que o provedor tem outra configuração (R-06). Quem
   * compara é `integrations-status`, que lê o agente publicado lá e calcula o
   * hash dos campos que controlamos; a resposta traz a lista em
   * `foraDaPlataforma`. Enquanto a borda não a mandar, ou se ela não
   * responder, a lista é vazia: o indicador continua dizendo o que o nosso
   * banco sabe, que é o que ele sempre disse.
   */
  async function lerDivergencias(contaId: string): Promise<Proposito[]> {
    const { data, error } = await cliente.functions.invoke(FUNCAO_DE_ESTADO, {
      body: { contaId, provedores: ['voz'] },
    })
    if (error) return []

    const lista = (data as { foraDaPlataforma?: unknown } | null)?.foraDaPlataforma
    if (!Array.isArray(lista)) return []
    return PROPOSITOS.filter((proposito) => lista.includes(proposito))
  }

  /** Chama `agent-publish` e devolve o relatório dos quatro propósitos. */
  async function chamarPublicacao(
    contaId: string,
    versaoPublicada: number | null,
  ): Promise<PublicacaoDoPlaybook> {
    const { data, error } = await cliente.functions.invoke(FUNCAO_DE_PUBLICACAO, {
      body: { contaId },
    })
    const corpo = (error ? await corpoDoErro(error) : data) as
      | CorpoDaPublicacao
      | CorpoDeRecusa
      | null

    if (corpo?.ok === true && Array.isArray(corpo.propositos)) {
      return {
        ok: true,
        relatorio: {
          versaoPublicada,
          propositos: corpo.propositos,
          recusa: null,
          publicacao: corpo.estado,
          pendenciaDosWebhooks: pendenciaDosWebhooks(corpo),
        },
      }
    }

    // Recusa do pedido inteiro, com frase: a versão pode já estar no ar no
    // banco, e o provedor não recebeu nada. A tela diz as duas coisas.
    if (corpo?.ok === false && typeof corpo.mensagem === 'string') {
      const carga = await carregar(contaId)
      return {
        ok: true,
        relatorio: {
          versaoPublicada,
          propositos: [],
          recusa: corpo.mensagem,
          publicacao: carga.ok ? carga.sarah.publicacao : 'rascunho',
          pendenciaDosWebhooks: null,
        },
      }
    }

    return { ok: false, motivo: 'falha-de-comunicacao' }
  }

  async function carregar(contaId: string): Promise<CargaDaSarah> {
    const agente = await lerAgente(contaId)
    if (typeof agente === 'string') return { ok: false, motivo: agente }
    if (agente === null) {
      return { ok: true, sarah: { identidade: null, publicacao: 'rascunho' } }
    }

    return {
      ok: true,
      sarah: {
        identidade: paraIdentidade(agente),
        publicacao: await estadoDaPublicacao(contaId, agente),
      },
    }
  }

  /**
   * Pergunta o catálogo à borda. Sem `pedido` a resposta vem sem amostra: abrir
   * a tela não é pedir para ouvir, e sintetizar por conta própria gastaria uma
   * síntese do provedor a cada abertura.
   */
  async function consultarCatalogo(
    contaId: string,
    pedido?: EscolhaDeVoz,
  ): Promise<RespostaDoCatalogo | MotivoDeFalhaDaSarah> {
    const { data, error } = await cliente.functions.invoke(FUNCAO_DO_CATALOGO, {
      body: {
        contaId,
        ...(pedido ? { vozId: pedido.vozId, ajustes: pedido.ajustes } : {}),
      },
    })

    if (error) return 'falha-de-comunicacao'
    return lerCorpoDoCatalogo(data) ?? 'falha-de-comunicacao'
  }

  /** Um passo da borda `model-connect`, com o corpo venha ele em 2xx ou não. */
  async function naConexao(corpo: Record<string, unknown>) {
    const conta = await contaAtual()
    if (typeof conta === 'string') return null
    const { data, error } = await cliente.functions.invoke('model-connect', {
      body: { account_id: conta.id, ...corpo },
    })
    return (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null
  }

  return {
    // De qual modelo a Sarah fala (US-246). O que acontece dentro da chamada
    // continua sendo do agente publicado na ElevenLabs; o que passa por aqui é
    // a retaguarda — ler a conversa, sugerir melhoria, redigir roteiro.
    async carregarModelo(): Promise<CargaDoModelo> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('model_settings')
        .select('provider, connection, connected_at, model_for_draft, model_for_classify, model_for_review, model_for_image, model_for_audio')
        .eq('account_id', conta.id)
        .maybeSingle()
      if (error) return { ok: false, motivo: classificar(error) }

      // Conta sem linha nenhuma é o estado de toda conta antes de conectar:
      // `platform`, que quer dizer sem modelo conectado. Não é erro, e a tela precisa saber
      // disso para oferecer o botão de conectar em vez de uma falha.
      if (!data) {
        return {
          ok: true,
          estado: {
            porta: 'platform',
            conectadoEm: null,
            finalDaChave: null,
            escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
          },
        }
      }

      const conexao = (data.connection ?? {}) as Record<string, unknown>
      return {
        ok: true,
        estado: {
          porta: data.provider === 'openrouter' ? 'openrouter' : 'platform',
          conectadoEm: data.connected_at ?? null,
          finalDaChave: typeof conexao.final === 'string' ? conexao.final : null,
          escolhas: {
            draft: data.model_for_draft ?? null,
            classify: data.model_for_classify ?? null,
            review: data.model_for_review ?? null,
            imagem: data.model_for_image ?? null,
            audio: data.model_for_audio ?? null,
          },
        },
      }
    },

    async iniciarConexaoDoModelo(retorno): Promise<InicioDaConexao> {
      const corpo = await naConexao({ action: 'iniciar', return_url: retorno })
      if (corpo?.ok === true && typeof corpo.url === 'string') {
        return { ok: true, url: corpo.url }
      }
      return { ok: false, mensagem: mensagemDaConexao(corpo) }
    },

    async concluirConexaoDoModelo(codigo, estado): Promise<ResultadoDaConexao> {
      // O estado vai pelos dois campos porque a borda o aceita dos dois
      // lugares: o provedor pode devolvê-lo como `state` ou preservá-lo na
      // query do retorno, e a tela não tem como saber qual dos dois foi.
      const corpo = await naConexao({
        action: 'concluir',
        code: codigo,
        state: estado,
        callback_state: estado,
      })
      return corpo?.ok === true ? { ok: true } : { ok: false, mensagem: mensagemDaConexao(corpo) }
    },

    async desconectarModelo(): Promise<ResultadoDaConexao> {
      const corpo = await naConexao({ action: 'desconectar' })
      return corpo?.ok === true ? { ok: true } : { ok: false, mensagem: mensagemDaConexao(corpo) }
    },

    async carregarCatalogoDeModelos(): Promise<CargaDoCatalogo> {
      const corpo = await naConexao({ action: 'catalogo' })
      if (corpo?.ok === true && Array.isArray(corpo.modelos)) {
        return { ok: true, modelos: corpo.modelos as ModeloDoCatalogo[] }
      }
      return { ok: false, mensagem: mensagemDaConexao(corpo) }
    },

    async escolherModelo(tarefa, modelo): Promise<ResultadoDaConexao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: MENSAGEM_GENERICA_DO_MODELO }

      // RPC, e não update: a tabela guarda a conexão na mesma linha, e o RPC
      // alcança só a coluna do modelo. Ver o comentário da migração.
      const { error } = await cliente.rpc('escolher_modelo_da_conta', {
        p_account_id: conta.id,
        p_tarefa: tarefa,
        p_modelo: modelo,
      })
      return error ? { ok: false, mensagem: MENSAGEM_GENERICA_DO_MODELO } : { ok: true }
    },
    // O ensaio (US-247). A conversa em si não passa por aqui: quem a conduz é
    // o condutor no navegador, com a URL assinada que `abrir` devolve.
    async abrirEnsaio(pedido): Promise<AberturaDoEnsaio> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: MENSAGEM_GENERICA_DO_ENSAIO }

      const { data, error } = await cliente.functions.invoke('rehearsal-session', {
        body: {
          account_id: conta.id,
          action: 'abrir',
          purpose: pedido.proposito,
          mode: pedido.modo,
          persona_profile: pedido.perfil,
        },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null

      if (corpo?.ok === true && typeof corpo.urlAssinada === 'string') {
        return {
          ok: true,
          ensaioId: String(corpo.ensaioId),
          chamadaId: String(corpo.chamadaId),
          urlAssinada: corpo.urlAssinada,
          modo: corpo.modo === 'text' ? 'text' : 'voice',
          variaveis: somenteTextos(corpo.variaveis),
          primeiraFala: textoOuNulo(corpo.primeiraFala),
        }
      }
      const caminho = textoOuNulo(corpo?.caminho)
      return {
        ok: false,
        mensagem: textoOuNulo(corpo?.mensagem) ?? MENSAGEM_GENERICA_DO_ENSAIO,
        ...(caminho ? { caminho } : {}),
      }
    },

    async encerrarEnsaio(ensaioId, conversaId): Promise<EncerramentoDoEnsaio> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: MENSAGEM_GENERICA_DO_ENSAIO }

      const { data, error } = await cliente.functions.invoke('rehearsal-session', {
        body: {
          account_id: conta.id,
          action: 'encerrar',
          rehearsal_id: ensaioId,
          conversation_id: conversaId,
        },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null

      if (corpo?.ok === true) {
        return {
          ok: true,
          chamadaId: String(corpo.chamadaId),
          turnos: typeof corpo.turnos === 'number' ? corpo.turnos : 0,
        }
      }
      return { ok: false, mensagem: textoOuNulo(corpo?.mensagem) ?? MENSAGEM_GENERICA_DO_ENSAIO }
    },
    // A base de conhecimento (US-085, RF-310). A leitura é pela RLS de membro;
    // a escrita é de administrador, pela política da tabela. O envio ao
    // provedor é passo separado, em `sincronizarConhecimento`.
    async carregarConhecimento(recorte): Promise<CargaDoConhecimento> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      let consulta = cliente
        .from('knowledge_entries')
        .select(
          'id, question, answer, tags, source, provider_doc_id, indexed_at, indexed_hash, sync_error, removed_at, updated_at',
        )
        .eq('account_id', conta.id)
        .order('updated_at', { ascending: false })
        // Uma a mais que o teto: é assim que se sabe que truncou sem contar a
        // tabela inteira.
        .limit(TETO_DO_CONHECIMENTO + 1)

      const termo = recorte.termo?.trim()
      if (termo) {
        const padrao = `%${padraoDeBusca(termo)}%`
        consulta = consulta.or(`question.ilike.${padrao},answer.ilike.${padrao}`)
      }
      if (recorte.etiqueta) consulta = consulta.contains('tags', [recorte.etiqueta])

      const { data, error } = await consulta
      if (error) return { ok: false, motivo: classificar(error) }

      const linhas = (data ?? []) as LinhaDoConhecimento[]
      const truncada = linhas.length > TETO_DO_CONHECIMENTO
      const visiveis = truncada ? linhas.slice(0, TETO_DO_CONHECIMENTO) : linhas

      const entradas = await Promise.all(visiveis.map(paraEntrada))

      // O total e as etiquetas são da conta inteira, e não do recorte: quem
      // filtrou precisa saber quantas existem fora do filtro, e o filtro
      // precisa oferecer as etiquetas que o recorte atual escondeu.
      const { count } = await cliente
        .from('knowledge_entries')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', conta.id)

      const { data: todas } = await cliente
        .from('knowledge_entries')
        .select('tags')
        .eq('account_id', conta.id)
        .limit(1_000)

      const etiquetas = new Set<string>()
      for (const linha of (todas ?? []) as { tags: string[] | null }[]) {
        for (const etiqueta of linha.tags ?? []) etiquetas.add(etiqueta)
      }

      return {
        ok: true,
        conhecimento: {
          entradas,
          totalDaConta: count ?? entradas.length,
          truncada,
          etiquetas: [...etiquetas].sort(),
        },
      }
    },

    async salvarEntrada(pedido): Promise<GravacaoDaEntrada> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const linha = {
        question: pedido.pergunta.trim(),
        answer: pedido.resposta.trim(),
        tags: [...pedido.etiquetas],
      }

      // As colunas de sincronização não entram: o gatilho da tabela as
      // descarta de escrita de cliente, e mandá-las seria escrever no vazio.
      const { error } = pedido.id
        ? await cliente
            .from('knowledge_entries')
            .update(linha)
            .eq('id', pedido.id)
            .eq('account_id', conta.id)
        : await cliente
            .from('knowledge_entries')
            .insert({ ...linha, account_id: conta.id, source: 'manual' })

      return error ? { ok: false, motivo: classificar(error) } : { ok: true }
    },

    async removerEntrada(id): Promise<RemocaoDaEntrada> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // A que nunca chegou ao provedor some de vez; a indexada é marcada, e
      // quem a apaga é o servidor depois de o provedor confirmar. A política
      // de delete do cliente só alcança a primeira, então a segunda passa por
      // update — e é a tabela, não esta função, que decide qual é qual.
      const { data, error } = await cliente
        .from('knowledge_entries')
        .delete()
        .eq('id', id)
        .eq('account_id', conta.id)
        .is('provider_doc_id', null)
        .select('id')
      if (error) return { ok: false, motivo: classificar(error) }
      if ((data ?? []).length > 0) return { ok: true, desfecho: 'apagada' }

      const { error: erroDaMarca } = await cliente
        .from('knowledge_entries')
        .update({ removed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('account_id', conta.id)
      return erroDaMarca
        ? { ok: false, motivo: classificar(erroDaMarca) }
        : { ok: true, desfecho: 'marcada' }
    },

    async sincronizarConhecimento(): Promise<SincronizacaoDoConhecimento> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente.functions.invoke('knowledge-sync', {
        body: { account_id: conta.id },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null
      if (!corpo) return { ok: false, motivo: 'falha-de-comunicacao' }

      // A recusa do pedido inteiro vem com `ok: false` e a frase pronta de
      // `knowledge-sync/respostas.ts`; aí nenhuma entrada foi tocada.
      if (corpo.ok !== true) {
        return {
          ok: true,
          relatorio: {
            entradas: [],
            publicacoes: [],
            recusa: textoOuNulo(corpo.mensagem) ?? MENSAGEM_GENERICA_DO_CONHECIMENTO,
          },
        }
      }

      return {
        ok: true,
        relatorio: {
          entradas: (Array.isArray(corpo.entradas) ? corpo.entradas : []) as ResultadoDaEntradaNaTela[],
          publicacoes: (Array.isArray(corpo.publicacoes) ? corpo.publicacoes : []) as ResultadoDaPublicacao[],
          recusa: null,
        },
      }
    },

    async carregarIdentidade(): Promise<CargaDaSarah> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }
      return carregar(conta.id)
    },

    async salvarIdentidade(identidade): Promise<GravacaoDaIdentidade> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const aparada = aparar(identidade)
      // `on conflict (account_id)` é o único por conta da migração: esta tela
      // é por onde a Sarah nasce e é por onde ela muda, e as duas coisas são a
      // mesma escrita.
      const { error } = await cliente.from('agents').upsert(
        {
          account_id: conta.id,
          name: aparada.nome,
          // Nula enquanto o tutorial não chegou ao negócio; quem cobra a
          // empresa é a publicação.
          company_name: paraColuna(aparada.empresa),
          offer_line: paraColuna(aparada.oferta),
          never_claim: aparada.nuncaAfirmar,
          transfer_target: paraColuna(aparada.destinoDeTransferencia),
          first_message: paraColuna(aparada.primeiraFala),
          whatsapp_first_message: paraColuna(aparada.aberturaDoWhatsapp),
          voice_channel_style: paraColuna(aparada.jeitoNaVoz),
          whatsapp_channel_style: paraColuna(aparada.jeitoNoWhatsapp),
        },
        { onConflict: 'account_id' },
      )

      if (error) return { ok: false, motivo: classificar(error) }

      const carga = await carregar(conta.id)
      if (!carga.ok) return { ok: false, motivo: carga.motivo }
      return { ok: true, publicacao: carga.sarah.publicacao }
    },

    async salvarNome(nome): Promise<GravacaoDaIdentidade> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // Só o nome vai no corpo: o `upsert` do PostgREST atualiza as colunas
      // que recebe, e a linha que já tinha empresa, voz e primeira fala fica
      // com elas. Na conta nova, a linha nasce só com o nome.
      const { data, error } = await cliente
        .from('agents')
        .upsert({ account_id: conta.id, name: nome.trim() }, { onConflict: 'account_id' })
        .select('id')

      if (error) return { ok: false, motivo: classificar(error) }
      // A RLS recusa em silêncio: um `using` que não casa só não afeta linha.
      if (!data || data.length === 0) return { ok: false, motivo: 'sem-permissao' }

      const carga = await carregar(conta.id)
      if (!carga.ok) return { ok: false, motivo: carga.motivo }
      return { ok: true, publicacao: carga.sarah.publicacao }
    },

    async carregarVoz(): Promise<CargaDaVozDaSarah> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const agente = await lerAgente(conta.id)
      if (typeof agente === 'string') return { ok: false, motivo: agente }

      const catalogo = await consultarCatalogo(conta.id)
      if (typeof catalogo === 'string') {
        return { ok: false, motivo: catalogo }
      }

      return {
        ok: true,
        voz: {
          temIdentidade: agente !== null,
          vozEscolhida: agente?.voice_id ?? null,
          // A coluna guarda a forma do provedor, e é `formato-do-provedor.ts`
          // quem a lê — a mesma leitura que a borda faz para montar a amostra.
          ajustes: agente ? lerAjustesGravados(agente.voice_settings) : {},
          catalogo: catalogo.catalogo,
          publicacao: agente ? await estadoDaPublicacao(conta.id, agente) : 'rascunho',
        },
      }
    },

    async ouvirAmostra(pedido): Promise<RespostaDaAmostra> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const resposta = await consultarCatalogo(conta.id, pedido)
      if (typeof resposta === 'string') return { ok: false, motivo: resposta }

      return { ok: true, amostra: resposta.amostra, pendencia: resposta.pendencia }
    },

    async salvarVoz(escolha): Promise<GravacaoDaVoz> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // `update` e não `upsert`: a voz se escolhe para uma assistente que já
      // existe, e a tela só a oferece quando existe. Criar a linha aqui faria
      // nascer uma assistente sem nome, que o check da tabela recusa.
      const { data, error } = await cliente
        .from('agents')
        .update({
          voice_id: escolha.vozId,
          voice_settings: ajustesParaGravar(escolha.ajustes),
        })
        .eq('account_id', conta.id)
        .select('id')

      if (error) return { ok: false, motivo: classificar(error) }
      // A RLS recusa em silêncio: um `using` que não casa só não afeta linha.
      if (!data || data.length === 0) return { ok: false, motivo: 'sem-permissao' }

      const carga = await carregar(conta.id)
      if (!carga.ok) return { ok: false, motivo: carga.motivo }
      return { ok: true, publicacao: carga.sarah.publicacao }
    },

    async carregarPlaybooks(): Promise<CargaDosPlaybooks> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const [agente, playbooks, foraDaPlataforma] = await Promise.all([
        lerAgente(conta.id),
        lerPlaybooks(conta.id),
        lerDivergencias(conta.id),
      ])
      if (typeof agente === 'string') return { ok: false, motivo: agente }
      if (typeof playbooks === 'string') return { ok: false, motivo: playbooks }

      const medicao = agente ? await medirPublicacaoDaConta(cliente, conta.id, agente) : null
      return {
        ok: true,
        playbooks: {
          playbooks,
          publicacao: medicao
            ? estadoDePublicacao(medicao.hashCompilado, medicao.registradas)
            : 'rascunho',
          foraDaPlataforma,
          noAr: medicao ? propositosNoAr(medicao.hashCompilado, medicao.registradas) : [],
        },
      }
    },

    async salvarRascunho(pedido): Promise<GravacaoDoRascunho> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const playbooks = await lerPlaybooks(conta.id)
      if (typeof playbooks === 'string') return { ok: false, motivo: playbooks }
      const playbook = playbooks.find((item) => item.proposito === pedido.proposito)
      const playbookId = playbookIds.get(pedido.proposito)
      if (!playbook || !playbookId) return { ok: false, motivo: 'falha-de-comunicacao' }

      const maisNova = playbook.versoes[0]
      const corpo = { body_script: pedido.roteiro, body_house: pedido.jeitoDaCasa }

      // O rascunho em edição se atualiza; versão que já foi ao ar nunca se
      // reescreve, e mudar o que ela diz é criar a seguinte. O número vem do
      // gatilho do banco, e por isso não vai no insert.
      const { data, error } =
        maisNova?.estado === 'draft'
          ? await cliente
              .from('playbook_versions')
              .update(corpo)
              .eq('id', maisNova.id)
              .eq('status', 'draft')
              .select(COLUNAS_DA_VERSAO)
          : await cliente
              .from('playbook_versions')
              .insert({ account_id: conta.id, playbook_id: playbookId, ...corpo })
              .select(COLUNAS_DA_VERSAO)

      if (error) return { ok: false, motivo: classificar(error) }
      const linha = data?.[0] as Record<string, unknown> | undefined
      // A RLS recusa update em silêncio: um `using` que não casa só não afeta linha.
      if (!linha) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true, versao: paraVersao(linha) }
    },

    async publicarPlaybook(pedido): Promise<PublicacaoDoPlaybook> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // Publicar é mudar o estado do rascunho salvo, com a nota. Arquivar a
      // anterior, carimbar a data e mover o ponteiro do playbook são do
      // gatilho, na mesma transação.
      const { data, error } = await cliente
        .from('playbook_versions')
        .update({ status: 'published', change_note: pedido.nota.trim() })
        .eq('id', pedido.versaoId)
        .eq('status', 'draft')
        .select('version')

      if (error) return { ok: false, motivo: classificar(error) }
      const linha = data?.[0] as { version?: number } | undefined
      if (!linha) return { ok: false, motivo: 'sem-permissao' }

      return chamarPublicacao(conta.id, Number(linha.version))
    },

    async republicar(): Promise<PublicacaoDoPlaybook> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }
      return chamarPublicacao(conta.id, null)
    },

    async gerarRascunho(proposito, descricao): Promise<RascunhoGerado> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: null }

      // Descrição em branco não vai no corpo: a borda completa com o que a
      // conta já escreveu em Identidade (US-063), em vez de recusar por falta
      // de um campo que a tela nem sempre precisa pedir de novo.
      const descricaoAparada = descricao.trim()
      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_RASCUNHO, {
        body: {
          account_id: conta.id,
          purpose: proposito,
          ...(descricaoAparada ? { description: descricaoAparada } : {}),
        },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null

      if (corpo?.ok === true && typeof corpo.roteiro === 'string') {
        return { ok: true, roteiro: corpo.roteiro }
      }
      return {
        ok: false,
        mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : null,
      }
    },

    async sugerirConfiguracao(contexto): Promise<SugestoesGeradas> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: null }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_SUGESTOES, {
        body: { account_id: conta.id, contexto },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null

      if (corpo?.ok === true && Array.isArray(corpo.etapas)) {
        return { ok: true, etapas: corpo.etapas as SugestaoDaEtapa[] }
      }
      return {
        ok: false,
        mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : null,
      }
    },

    async abrirEntrevista(voz): Promise<EntrevistaAberta> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: null }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_ENTREVISTA, {
        body: { account_id: conta.id, action: 'abrir', voice_id: voz?.id ?? null, voice_name: voz?.nome ?? null },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null
      if (
        corpo?.ok === true &&
        typeof corpo.agenteId === 'string' &&
        typeof corpo.urlAssinada === 'string'
      ) {
        return { ok: true, agenteId: corpo.agenteId, urlAssinada: corpo.urlAssinada }
      }
      return { ok: false, mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : null }
    },

    async encerrarEntrevista(agenteId, conversaId): Promise<EntrevistaEncerrada> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, mensagem: null, pendente: false }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_ENTREVISTA, {
        body: {
          account_id: conta.id,
          action: 'encerrar',
          agent_id: agenteId,
          conversation_id: conversaId,
        },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null
      if (corpo?.ok === true && Array.isArray(corpo.etapas)) {
        return { ok: true, etapas: corpo.etapas as SugestaoDaEtapa[] }
      }
      return {
        ok: false,
        mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : null,
        pendente: corpo?.motivo === 'transcricao_pendente',
      }
    },
  }
}
