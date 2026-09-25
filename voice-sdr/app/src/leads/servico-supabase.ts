import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type { RecorteDeLeads } from '@compartilhado/recorte-de-leads.ts'
import type { CorpoDaImportacao } from '@importacao/confirmacao.ts'

import { ultimaMudancaPorLead, type MudancaDoLead } from '@/funil/cartao'
import { ehCanonica, paraCor } from '@/funil/etapas'
import { ORIGEM_DO_CADASTRO } from '@/leads/cadastro'
import { padraoDeBusca } from '@/leads/consulta'
import type { EventoDoLead, LigacaoDoLead } from '@/leads/linha-do-tempo'
import type {
  ArquivoDeLeads,
  BriefingDoLead,
  CargaDaConfiguracao,
  CargaDaFichaDoLead,
  CargaDeLeads,
  CargaDoFunil,
  EtapaConfigurada,
  EtapaDoFunil,
  LeadDaLista,
  LeadDoFunil,
  MotivoDaConfiguracao,
  MotivoDaExclusaoDeEtapa,
  MotivoDaExportacao,
  MotivoDaImportacao,
  MotivoDaMesclagem,
  MotivoDaMudancaDeEtapa,
  MotivoDaNota,
  MotivoDeFalhaDosLeads,
  MotivoDoCadastro,
  RespostaDaConfiguracao,
  RespostaDaExclusaoDeEtapa,
  RespostaDaExportacao,
  RespostaDaImportacao,
  RespostaDaMesclagem,
  RespostaDaMudancaDeEtapa,
  RespostaDaNota,
  RespostaDaPrevia,
  RespostaDaProcura,
  RespostaDoCadastro,
  RespostaDoFunil,
  RespostaDoLote,
  ServicoDeLeads,
  Temperatura,
} from '@/leads/tipos'

/**
 * Teto de linhas por consulta. A lista é para trabalhar, não para folhear: quem
 * precisa da base inteira exporta (`lead-export`, que tem teto próprio e muito
 * mais alto, porque o destino dela é planilha).
 */
const TETO = 500

/**
 * Quantos leads cada coluna do funil desenha. Baixo de propósito: a coluna é
 * um cartão de leitura rápida, e a lista inteira de uma etapa se vê em
 * `/leads` com o filtro. Colunas longas transformariam o funil numa tabela
 * vertical pior do que a que já existe.
 */
const TETO_DA_COLUNA = 8

/**
 * Quantos eventos a ficha do lead desenha. A linha do tempo é para decidir o
 * próximo passo, e duzentos eventos são meses de cadência; o que passar disso
 * a tela diz que ficou atrás do teto, em vez de cortar calada.
 */
const TETO_DA_LINHA_DO_TEMPO = 200

/** A política de RLS recusou a leitura. */
const PRIVILEGIO_INSUFICIENTE = '42501'

const COLUNAS =
  'id, name, phone_e164, company, city, state, temperature, score, last_activity_at, blocked_at'

interface LinhaDeEtapa {
  key: string
  label: string | null
  /** Só a consulta do funil a pede; o embutido da lista vem sem ela. */
  color?: string | null
}

/** Uma etapa como a configuração a lê. */
interface LinhaDeEtapaConfigurada {
  id: string
  key: string
  label: string | null
  position: number
  color: string | null
}

/** Os códigos que `configurar_etapas` devolve, fora o `ok`. */
const MOTIVOS_DA_CONFIGURACAO: Record<string, MotivoDaConfiguracao> = {
  sem_permissao: 'sem-permissao',
  etapa_de_outra_conta: 'etapa-de-outra-conta',
  chave_invalida: 'chave-invalida',
  posicao_duplicada: 'posicao-duplicada',
  etapa_canonica: 'etapa-canonica',
}

/**
 * Os dois códigos de `recusar_exclusao_de_etapa`. `etapa_canonica` sai com
 * 42501, o mesmo código da política: por isso a mensagem é lida antes do
 * código.
 */
const MOTIVOS_DA_EXCLUSAO_DE_ETAPA: Record<string, MotivoDaExclusaoDeEtapa> = {
  etapa_canonica: 'etapa-canonica',
  etapa_com_leads: 'etapa-com-leads',
}

/** O recorte que a procura por telefone pede: só o que o cartão do duplicado mostra. */
interface LinhaDeLeadExistente {
  id: string
  name: string | null
  phone_e164: string
  company: string | null
}

interface LinhaDeLead {
  id: string
  name: string | null
  phone_e164: string
  company: string | null
  city: string | null
  state: string | null
  temperature: string | null
  score: number | null
  last_activity_at: string | null
  blocked_at: string | null
  pipeline_stages: LinhaDeEtapa | null
}

/** A linha de `leads` que a ficha desenha (US-147). */
interface LinhaDaFicha {
  id: string
  account_id: string
  name: string | null
  phone_e164: string
  company: string | null
  city: string | null
  state: string | null
  timezone: string | null
  temperature: string | null
  score: number | null
  blocked_at: string | null
  blocked_reason: string | null
  briefing: Record<string, unknown> | null
  pipeline_stages: LinhaDeEtapa | null
}

interface LinhaDeEvento {
  id: string
  kind: string
  actor: string
  actor_id: string | null
  call_id: string | null
  payload: Record<string, unknown> | null
  occurred_at: string
}

interface LinhaDeLigacao {
  id: string
  direction: string
  purpose: string
  started_at: string
  duration_sec: number | null
  end_reason: string | null
  recording_path: string | null
  recording_expires_at: string | null
}

interface LinhaDeMembro {
  user_id: string
  profiles: { display_name: string | null; email: string | null } | null
}

function textoDoBriefing(briefing: Record<string, unknown> | null, chave: string): string | null {
  const valor = briefing?.[chave]
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** As chaves de `leads.briefing`, que são as de `CHAVES_DO_BRIEFING`, na língua da tela. */
function paraBriefing(briefing: Record<string, unknown> | null): BriefingDoLead {
  return {
    dor: textoDoBriefing(briefing, 'pain'),
    fit: textoDoBriefing(briefing, 'fit'),
    objecoes: textoDoBriefing(briefing, 'objections'),
    proximaAcao: textoDoBriefing(briefing, 'next_action'),
  }
}

/** Um `stage_change` como o sinal do cartão o lê (RF-205). */
interface LinhaDeMudanca {
  lead_id: string
  actor: string
  occurred_at: string
}

/**
 * Os códigos que `mover_lead_de_etapa` devolve em `resultado`. `movido` e
 * `mesma_etapa` são resultado e ficam fora daqui.
 */
const MOTIVOS_DA_MUDANCA: Record<string, MotivoDaMudancaDeEtapa> = {
  sem_permissao: 'sem-permissao',
  lead_inexistente: 'lead-inexistente',
  lead_de_outra_conta: 'lead-inexistente',
  etapa_inexistente: 'etapa-inexistente',
}

function paraAtor(valor: string): MudancaDoLead['ator'] | null {
  return valor === 'user' || valor === 'agent' || valor === 'system' ? valor : null
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDosLeads {
  return erro?.code === PRIVILEGIO_INSUFICIENTE
    ? 'sem-permissao'
    : 'falha-de-comunicacao'
}

/**
 * Quantos eventos de lead vão ao ar juntos.
 *
 * O `update` do lote é uma chamada só, mas a linha do tempo é um evento por
 * lead (RF-113) e `registrar_evento_de_lead` recebe um lead por vez. Sem lote,
 * um bloqueio de quinhentos leads abriria quinhentas conexões ao mesmo tempo e
 * o navegador enfileiraria as que não coubessem, com as primeiras já em tempo
 * de espera. Cem é o mesmo tamanho de onda da importação
 * (`leads-import/confirmacao.ts`).
 */
const TAMANHO_DA_ONDA = 100

/** Nomes dos códigos que `lead_merge` levanta, na forma que a tela usa. */
const MOTIVOS_DA_MESCLAGEM: Record<string, MotivoDaMesclagem> = {
  sem_permissao: 'sem-permissao',
  mesmo_lead: 'mesmo-lead',
  lead_inexistente: 'lead-inexistente',
  lead_de_outra_conta: 'lead-de-outra-conta',
  ja_mesclado: 'ja-mesclado',
}

/** Os que `registrar_evento_de_lead` levanta. */
const MOTIVOS_DA_NOTA: Record<string, MotivoDaNota> = {
  lead_inexistente: 'lead-inexistente',
  sem_permissao: 'sem-permissao',
}

/** Os que `registrar_lead` levanta, um por `raise exception` dele. */
const MOTIVOS_DO_CADASTRO: Record<string, MotivoDoCadastro> = {
  sem_permissao: 'sem-permissao',
  telefone_invalido: 'telefone-invalido',
  etapa_invalida: 'etapa-invalida',
  duplicado_por_telefone: 'duplicado',
  lead_invalido: 'falha-de-comunicacao',
  opcao_invalida: 'falha-de-comunicacao',
}

/**
 * O código que o RPC levantou, reconhecido pela `message` e por palavra
 * inteira — nunca pelo `detail`, que é prosa para quem depura. O que não casar
 * vira o motivo genérico, e nenhuma mensagem de Postgres chega à tela.
 */
function motivoDoRpc<T extends string>(
  erro: PostgrestError | null,
  mapa: Record<string, T>,
  padrao: T,
): T {
  const palavras = (erro?.message ?? '').toLowerCase().match(/[a-z_]+/g) ?? []
  for (const palavra of palavras) {
    const motivo = mapa[palavra]
    if (motivo) return motivo
  }
  return padrao
}

/**
 * Coluna de texto vazia é `null`, não cadeia vazia: o `coalesce` de
 * `registrar_lead` decide o que preencher olhando para `null`, e `''` passaria
 * por preenchido — um lead com nome em branco nunca mais receberia o nome que a
 * planilha trouxesse depois.
 */
function ouNulo(valor: string): string | null {
  return valor.trim() === '' ? null : valor.trim()
}

function paraTemperatura(valor: string | null): Temperatura | null {
  switch (valor) {
    case 'frio':
    case 'morno':
    case 'quente':
      return valor
    default:
      return null
  }
}

function paraEtapa(linha: LinhaDeEtapa | null): EtapaDoFunil | null {
  if (!linha) return null
  const etapa: EtapaDoFunil = { chave: linha.key, rotulo: linha.label?.trim() || linha.key }
  if (linha.color !== undefined) etapa.cor = paraCor(linha.color)
  return etapa
}

/**
 * O que uma escrita em lote precisa oferecer: pedir de volta o que gravou.
 *
 * O tipo é declarado aqui, e não importado do postgrest-js, porque o que
 * `escreverLote` usa é uma operação só — `update(...).in(...)` e
 * `delete().in(...)` devolvem construtores de tipos diferentes, e o que os dois
 * têm em comum é exatamente isto.
 */
interface EscritaEmLeads {
  select(colunas: string): PromiseLike<{
    data: unknown
    error: PostgrestError | null
  }>
}

/** Os códigos que `lead-export` devolve no corpo, na forma que a tela usa. */
const MOTIVOS_DA_EXPORTACAO: Record<string, MotivoDaExportacao> = {
  sem_permissao: 'sem-permissao',
  recorte_vazio: 'recorte-vazio',
  filtro_invalido: 'filtro-invalido',
}

/**
 * O motivo da recusa da borda vem no corpo da resposta, e o cliente do Supabase
 * o esconde dentro do erro. Sem isto, recorte que não alcança lead nenhum
 * viraria "erro ao chamar a função" — e a diferença entre as duas frases é o
 * que decide se alguém vai mexer nos filtros ou esperar o servidor voltar.
 */
async function motivoDaExportacao(erro: unknown): Promise<MotivoDaExportacao> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return 'falha-de-comunicacao'

  try {
    const corpo: unknown = await contexto.json()
    const motivo = (corpo as { motivo?: unknown } | null)?.motivo
    if (typeof motivo !== 'string') return 'falha-de-comunicacao'
    return MOTIVOS_DA_EXPORTACAO[motivo] ?? 'falha-de-comunicacao'
  } catch {
    return 'falha-de-comunicacao'
  }
}

/** Fallback do nome quando o cabeçalho não vem: a borda o monta com a data. */
const NOME_PADRAO_DO_ARQUIVO = 'leads.csv'

/**
 * O nome do arquivo sai do `content-disposition` que a borda mandou, e não de
 * um nome montado aqui: quem sabe a data do arquivo é quem o gerou, e duas
 * regras de nome se desencontram no primeiro fuso.
 */
function nomeDoArquivo(disposicao: string | null | undefined): string {
  const achado = /filename="([^"]+)"/.exec(disposicao ?? '')
  return achado?.[1] ?? NOME_PADRAO_DO_ARQUIVO
}

function numeroDoCabecalho(
  cabecalhos: Headers | undefined,
  nome: string,
): number {
  const valor = Number(cabecalhos?.get(nome) ?? '')
  return Number.isFinite(valor) ? valor : 0
}

/** Os códigos que `leads-import` devolve no corpo, na forma que a tela usa. */
const MOTIVOS_DA_IMPORTACAO: Record<string, MotivoDaImportacao> = {
  // O único que o operador resolve sozinho: a borda não entendeu o arquivo, e
  // reler a planilha é o caminho. Os demais são de ambiente, e mandar mexer no
  // arquivo por causa deles seria mandar consertar o que não está quebrado.
  planilha_invalida: 'planilha-recusada',
  arquivo_ausente: 'planilha-recusada',
}

/** O gateway recusa quem não entrou antes de a função rodar. */
const SEM_SESSAO = [401, 403]

/**
 * O motivo da recusa da borda, que o cliente do Supabase esconde dentro do
 * erro. O status vem antes do corpo: 401 e 403 são do gateway e nem chegam a
 * ter corpo de função, e chamá-los de falha de comunicação mandaria esperar o
 * servidor voltar quem precisa é de acesso.
 */
async function motivoDaImportacao(erro: unknown): Promise<MotivoDaImportacao> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return 'falha-de-comunicacao'
  if (SEM_SESSAO.includes(contexto.status)) return 'sem-permissao'

  try {
    const corpo: unknown = await contexto.json()
    const motivo = (corpo as { motivo?: unknown } | null)?.motivo
    if (typeof motivo !== 'string') return 'falha-de-comunicacao'
    return MOTIVOS_DA_IMPORTACAO[motivo] ?? 'falha-de-comunicacao'
  } catch {
    return 'falha-de-comunicacao'
  }
}

/**
 * O que a resolução da conta significa para a importação. `filtro-invalido` não
 * sai de `contaAtual`, mas está no tipo dela, e traduzi-lo aqui é o que impede
 * a tela de receber um motivo para o qual não tem frase.
 */
function contaRecusada(motivo: MotivoDeFalhaDosLeads): MotivoDaImportacao {
  return motivo === 'filtro-invalido' ? 'falha-de-comunicacao' : motivo
}

export function criarServicoDeLeads(cliente: SupabaseClient): ServicoDeLeads {
  /**
   * Conta em que o usuário da sessão trabalha. Devolve o objeto no caso bom e
   * o motivo no caso ruim: a distinção é por tipo, não por valor de string.
   */
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDosLeads> {
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

  /** Uma linha de `leads` como a lista e o funil a desenham. */
  function paraLeadDaLista(linha: LinhaDeLead): LeadDaLista {
    return {
      id: linha.id,
      nome: linha.name?.trim() ?? '',
      telefone: linha.phone_e164,
      empresa: linha.company?.trim() ?? '',
      cidade: linha.city?.trim() ?? '',
      estado: linha.state?.trim() ?? '',
      etapa: paraEtapa(linha.pipeline_stages),
      temperatura: paraTemperatura(linha.temperature),
      ultimaAtividade: linha.last_activity_at,
      bloqueado: linha.blocked_at !== null,
    }
  }

  function montarConsulta(contaId: string, recorte: RecorteDeLeads) {
    // A junção é `!inner` quando a etapa filtra. Sem o `!inner`, o PostgREST
    // aplica o filtro só ao embutido: a etapa vem nula e a linha continua na
    // lista, o que mostraria a conta inteira a quem pediu uma etapa só.
    const juncao =
      recorte.etapa === undefined
        ? 'pipeline_stages(key, label)'
        : 'pipeline_stages!inner(key, label)'

    let consulta = cliente
      .from('leads')
      .select(`${COLUNAS}, ${juncao}`)
      .eq('account_id', contaId)
      // Lead mesclado não é lead; quem responde pelo telefone dele é o outro.
      .is('merged_into_id', null)

    if (recorte.termo !== undefined) {
      const padrao = padraoDeBusca(recorte.termo)
      consulta = consulta.or(
        `name.ilike.${padrao},phone_e164.ilike.${padrao},email.ilike.${padrao}`,
      )
    }
    if (recorte.etapa !== undefined) {
      consulta = consulta.eq('pipeline_stages.key', recorte.etapa)
    }
    if (recorte.temperatura !== undefined) {
      consulta = consulta.eq('temperature', recorte.temperatura)
    }
    if (recorte.origem !== undefined) consulta = consulta.eq('source', recorte.origem)
    if (recorte.atividadeDesde !== undefined) {
      consulta = consulta.gte('last_activity_at', recorte.atividadeDesde)
    }
    if (recorte.bloqueado === true) consulta = consulta.not('blocked_at', 'is', null)
    if (recorte.bloqueado === false) consulta = consulta.is('blocked_at', null)

    if (recorte.ordenacao === 'nome') {
      return consulta.order('name', { ascending: true, nullsFirst: false })
    }
    if (recorte.ordenacao === 'criacao') {
      return consulta.order('created_at', { ascending: false })
    }
    return consulta.order('last_activity_at', {
      ascending: false,
      nullsFirst: false,
    })
  }

  /**
   * As etapas do funil padrão da conta, na ordem. A lista as usa como rótulo da
   * tabela e como opção do filtro; o cadastro, como opção do seletor. Uma
   * consulta só para os dois: duas se desencontrariam no primeiro ajuste do
   * `is_default`.
   */
  function consultarFunil(contaId: string) {
    return cliente
      .from('pipeline_stages')
      .select('key, label, position, color, pipelines!inner(is_default)')
      .eq('account_id', contaId)
      .eq('pipelines.is_default', true)
      .order('position', { ascending: true })
  }

  function paraEtapas(dados: unknown): EtapaDoFunil[] {
    return (dados as LinhaDeEtapa[])
      .map(paraEtapa)
      .filter((etapa): etapa is EtapaDoFunil => etapa !== null)
  }

  /** As etapas do funil padrão com o que a configuração precisa (US-146). */
  async function lerConfiguracao(): Promise<CargaDaConfiguracao> {
    const conta = await contaAtual()
    if (typeof conta === 'string') return { ok: false, motivo: conta }

    // O funil vem à parte das etapas: conta sem etapa nenhuma ainda tem um
    // funil padrão, e é nele que a primeira etapa nasce.
    const funil = await cliente
      .from('pipelines')
      .select('id')
      .eq('account_id', conta.id)
      .eq('is_default', true)
      .maybeSingle()
    if (funil.error) return { ok: false, motivo: classificar(funil.error) }
    if (!funil.data) return { ok: false, motivo: 'sem-conta' }
    const funilId = (funil.data as { id: string }).id

    const { data, error } = await cliente
      .from('pipeline_stages')
      .select('id, key, label, position, color')
      .eq('pipeline_id', funilId)
      .order('position', { ascending: true })
    if (error) return { ok: false, motivo: classificar(error) }
    const linhas = data as LinhaDeEtapaConfigurada[]

    // A contagem é a do gatilho que recusa a exclusão: todo lead com o
    // `stage_id`, sem recorte. Contar com filtro diria "vazia" de uma etapa
    // que o banco se recusa a apagar.
    const contagens = await Promise.all(
      linhas.map((linha) =>
        cliente
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', conta.id)
          .eq('stage_id', linha.id),
      ),
    )
    const falha = contagens.find((contagem) => contagem.error)?.error
    if (falha) return { ok: false, motivo: classificar(falha) }

    return {
      ok: true,
      configuracao: {
        funilId,
        etapas: linhas.map(
          (linha, indice): EtapaConfigurada => ({
            id: linha.id,
            chave: linha.key,
            rotulo: linha.label?.trim() || linha.key,
            posicao: linha.position,
            cor: paraCor(linha.color),
            canonica: ehCanonica(linha.key),
            leads: contagens[indice]?.count ?? 0,
          }),
        ),
      },
    }
  }

  return {
    async listar(recorte): Promise<CargaDeLeads> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const [lista, funil] = await Promise.all([
        montarConsulta(conta.id, recorte).limit(TETO),
        // As etapas vêm à parte porque o filtro precisa das seis, e não só das
        // que aparecem nas linhas que couberam no teto.
        consultarFunil(conta.id),
      ])

      if (lista.error) return { ok: false, motivo: classificar(lista.error) }
      if (funil.error) return { ok: false, motivo: classificar(funil.error) }

      const linhas = lista.data as unknown as LinhaDeLead[]

      const leads: LeadDaLista[] = linhas.map(paraLeadDaLista)

      const etapas = paraEtapas(funil.data)

      return {
        ok: true,
        pagina: { leads, etapas, truncada: leads.length === TETO },
      }
    },

    async carregarFichaDoLead(id): Promise<CargaDaFichaDoLead> {
      const lida = await cliente
        .from('leads')
        .select(
          'id, account_id, name, phone_e164, company, city, state, timezone, temperature, score, blocked_at, blocked_reason, briefing, pipeline_stages(key, label)',
        )
        .eq('id', id)
        .maybeSingle()
      if (lida.error) return { ok: false, motivo: classificar(lida.error) }
      // Lead de outra conta e lead que não existe são o mesmo silêncio da RLS.
      if (!lida.data) return { ok: false, motivo: 'nao-encontrado' }
      const lead = lida.data as unknown as LinhaDaFicha

      const [eventos, funil, membros] = await Promise.all([
        cliente
          .from('lead_events')
          .select('id, kind, actor, actor_id, call_id, payload, occurred_at')
          .eq('account_id', lead.account_id)
          .eq('lead_id', id)
          .order('occurred_at', { ascending: false })
          .limit(TETO_DA_LINHA_DO_TEMPO + 1),
        consultarFunil(lead.account_id),
        // `lead_events.actor_id` não tem chave para `profiles` (o evento
        // sobrevive a quem o gerou): o nome vem dos membros de agora, e quem
        // saiu fica sem nome, não sem item.
        cliente
          .from('account_members')
          .select('user_id, profiles(display_name, email)')
          .eq('account_id', lead.account_id),
      ])
      if (eventos.error) return { ok: false, motivo: classificar(eventos.error) }
      if (funil.error) return { ok: false, motivo: classificar(funil.error) }
      if (membros.error) return { ok: false, motivo: classificar(membros.error) }

      const linhas = (eventos.data as LinhaDeEvento[]).slice(0, TETO_DA_LINHA_DO_TEMPO)
      const lidos: EventoDoLead[] = []
      for (const linha of linhas) {
        const ator = paraAtor(linha.actor)
        if (!ator) continue
        lidos.push({
          id: linha.id,
          kind: linha.kind,
          ocorridoEm: linha.occurred_at,
          ator,
          autorId: linha.actor_id,
          chamadaId: linha.call_id,
          payload: linha.payload ?? {},
        })
      }

      // A chamada entra pelo evento que a aponta: só as dos eventos `call`.
      const idsDasChamadas = [
        ...new Set(
          lidos
            .filter((evento) => evento.kind === 'call' && evento.chamadaId !== null)
            .map((evento) => evento.chamadaId as string),
        ),
      ]
      let ligacoes: LigacaoDoLead[] = []
      if (idsDasChamadas.length > 0) {
        const chamadas = await cliente
          .from('calls')
          .select(
            'id, direction, purpose, started_at, duration_sec, end_reason, recording_path, recording_expires_at',
          )
          .in('id', idsDasChamadas)
        if (chamadas.error) return { ok: false, motivo: classificar(chamadas.error) }
        ligacoes = (chamadas.data as LinhaDeLigacao[]).map((linha) => ({
          id: linha.id,
          direcao: linha.direction,
          proposito: linha.purpose,
          iniciadaEm: linha.started_at,
          duracaoSeg: linha.duration_sec,
          motivoDoFim: linha.end_reason,
          caminhoDaGravacao: linha.recording_path,
          gravacaoExpiraEm: linha.recording_expires_at,
        }))
      }

      const nomes = new Map<string, string>()
      for (const membro of membros.data as unknown as LinhaDeMembro[]) {
        const nome = membro.profiles?.display_name?.trim() || membro.profiles?.email?.trim()
        if (nome) nomes.set(membro.user_id, nome)
      }

      return {
        ok: true,
        ficha: {
          id: lead.id,
          nome: lead.name?.trim() ?? '',
          telefone: lead.phone_e164,
          empresa: lead.company?.trim() ?? '',
          cidade: lead.city?.trim() ?? '',
          estado: lead.state?.trim() ?? '',
          fuso: lead.timezone?.trim() || null,
          etapa: paraEtapa(lead.pipeline_stages),
          temperatura: paraTemperatura(lead.temperature),
          pontuacao: lead.score,
          bloqueio:
            lead.blocked_at === null ? null : { em: lead.blocked_at, motivo: lead.blocked_reason },
          briefing: paraBriefing(lead.briefing),
          etapas: paraEtapas(funil.data),
          eventos: lidos,
          ligacoes,
          nomes,
          truncada: (eventos.data as LinhaDeEvento[]).length > TETO_DA_LINHA_DO_TEMPO,
        },
      }
    },

    async registrarNota(leadId, texto): Promise<RespostaDaNota> {
      // O ator do argumento é descartado com sessão: quem assina é `auth.uid()`.
      const { data, error } = await cliente.rpc('registrar_evento_de_lead', {
        p_lead_id: leadId,
        p_kind: 'note',
        p_payload: { texto: texto.trim() },
      })
      if (error) {
        return {
          ok: false,
          motivo: motivoDoRpc(
            error,
            MOTIVOS_DA_NOTA,
            error.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao',
          ),
        }
      }
      if (data === null) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },

    async carregarFunil(recorte = {}): Promise<CargaDoFunil> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // O quadro filtra por origem e período (RF-206), e as contagens precisam
      // do mesmo recorte das listas: coluna que diz 40 e mostra os 8 mais
      // recentes de outro recorte mente nas duas coisas.
      const contaId = conta.id

      // A origem e o período também valem para quem está sem etapa.
      function contarLeads(etapa: string | null) {
        let consulta = cliente
          .from('leads')
          .select(etapa === null ? 'id' : 'id, pipeline_stages!inner(key)', {
            count: 'exact',
            head: true,
          })
          .eq('account_id', contaId)
          .is('merged_into_id', null)
        consulta =
          etapa === null
            ? consulta.is('stage_id', null)
            : consulta.eq('pipeline_stages.key', etapa)
        if (recorte.origem !== undefined) consulta = consulta.eq('source', recorte.origem)
        if (recorte.atividadeDesde !== undefined) {
          consulta = consulta.gte('last_activity_at', recorte.atividadeDesde)
        }
        return consulta
      }

      const funil = await consultarFunil(conta.id)
      if (funil.error) return { ok: false, motivo: classificar(funil.error) }
      const etapas = paraEtapas(funil.data)

      // Uma consulta por coluna, e não uma agregação: o PostgREST não faz
      // `group by`, e contar no cliente exigiria trazer a tabela inteira. São
      // seis etapas por conta — seis contagens com `head: true`, que não
      // transferem linha nenhuma, mais seis listas curtas.
      const colunas = await Promise.all(
        etapas.map(async (etapa) => {
          const [contagem, recentes] = await Promise.all([
            // `!inner` na contagem pela mesma razão do comentário de
            // `montarConsulta`: sem ele o filtro só vale para o embutido, e a
            // contagem devolve a conta inteira em toda coluna.
            contarLeads(etapa.chave),
            montarConsulta(conta.id, {
              origem: recorte.origem,
              atividadeDesde: recorte.atividadeDesde,
              etapa: etapa.chave,
            }).limit(TETO_DA_COLUNA),
          ])

          const linhas = (recentes.data ?? []) as unknown as LinhaDeLead[]
          const total = contagem.count ?? linhas.length
          return {
            etapa,
            total,
            linhas,
            truncada: total > linhas.length,
            erro: recentes.error,
          }
        }),
      )
      const falha = colunas.find((coluna) => coluna.erro)?.erro
      if (falha) return { ok: false, motivo: classificar(falha) }

      // O sinal da Sarah (RF-205) vem da última mudança de etapa de cada cartão
      // à vista, e só deles: no máximo oito por coluna. Sem leitura dos
      // eventos, o cartão fica sem sinal, e não com um sinal inventado.
      const ids = colunas.flatMap((coluna) => coluna.linhas.map((linha) => linha.id))
      const mudancas = ids.length
        ? await cliente
            .from('lead_events')
            .select('lead_id, actor, occurred_at')
            .eq('account_id', conta.id)
            .eq('kind', 'stage_change')
            .in('lead_id', ids)
            .order('occurred_at', { ascending: false })
        : { data: [], error: null }
      if (mudancas.error) return { ok: false, motivo: classificar(mudancas.error) }

      const ultimas = ultimaMudancaPorLead(
        ((mudancas.data ?? []) as LinhaDeMudanca[]).flatMap((linha) => {
          const ator = paraAtor(linha.actor)
          return ator ? [{ leadId: linha.lead_id, ator, em: linha.occurred_at }] : []
        }),
      )

      const { count: semEtapa } = await contarLeads(null)

      return {
        ok: true,
        funil: {
          colunas: colunas.map(({ linhas, etapa, total, truncada }) => ({
            etapa,
            total,
            truncada,
            leads: linhas.map(
              (linha): LeadDoFunil => ({
                ...paraLeadDaLista(linha),
                pontuacao: linha.score,
                ultimaMudancaDeEtapa: ultimas.get(linha.id) ?? null,
              }),
            ),
          })),
          total: colunas.reduce((soma, coluna) => soma + coluna.total, 0),
          // Não entra na soma das colunas: quem não tem etapa não está no
          // funil, e somá-lo faria o total do funil contar quem está fora dele.
          semEtapa: semEtapa ?? 0,
        },
      }
    },

    async moverDeEtapa(leadId, chaveDaEtapa): Promise<RespostaDaMudancaDeEtapa> {
      const { data: autenticado } = await cliente.auth.getUser()
      const usuarioId = autenticado.user?.id
      if (!usuarioId) return { ok: false, motivo: 'sem-permissao' }

      // Com sessão, o RPC assina o evento com `auth.uid()` e descarta o ator
      // do argumento; `user` vai explícito para a chamada dizer o que é.
      const { data, error } = await cliente.rpc('mover_lead_de_etapa', {
        p_lead_id: leadId,
        p_stage_key: chaveDaEtapa,
        p_actor: 'user',
        p_actor_id: usuarioId,
      })
      if (error) {
        return {
          ok: false,
          motivo: error.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao',
        }
      }

      // A função devolve uma linha sempre. Nenhuma linha é a recusa silenciosa
      // de quem não alcança a função, e vira `sem-permissao`, como toda escrita
      // desta base que não volta.
      const linha = (data as { resultado: string }[] | null)?.[0]
      if (!linha) return { ok: false, motivo: 'sem-permissao' }
      if (linha.resultado === 'movido' || linha.resultado === 'mesma_etapa') {
        return { ok: true, resultado: linha.resultado }
      }
      return { ok: false, motivo: MOTIVOS_DA_MUDANCA[linha.resultado] ?? 'falha-de-comunicacao' }
    },

    carregarConfiguracaoDasEtapas: lerConfiguracao,

    async configurarEtapas(funilId, etapas): Promise<RespostaDaConfiguracao> {
      // A lista inteira numa chamada: o RPC confere as posições finais antes de
      // gravar, e trocar duas etapas em duas chamadas colidiria na primeira.
      const { data, error } = await cliente.rpc('configurar_etapas', {
        p_pipeline_id: funilId,
        p_etapas: etapas.map((etapa) =>
          etapa.id === undefined
            ? { key: etapa.chave, label: etapa.rotulo, position: etapa.posicao, color: etapa.cor }
            : { id: etapa.id, label: etapa.rotulo, position: etapa.posicao, color: etapa.cor },
        ),
      })
      if (error) {
        return {
          ok: false,
          motivo: error.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao',
        }
      }
      if (data !== 'ok') {
        return {
          ok: false,
          motivo: MOTIVOS_DA_CONFIGURACAO[String(data)] ?? 'falha-de-comunicacao',
        }
      }

      // O que a tela desenha é o que o banco guardou, relido agora.
      const relida = await lerConfiguracao()
      if (!relida.ok) return { ok: false, motivo: 'falha-de-comunicacao' }
      return { ok: true, configuracao: relida.configuracao }
    },

    async apagarEtapa(id): Promise<RespostaDaExclusaoDeEtapa> {
      const { data, error } = await cliente
        .from('pipeline_stages')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) {
        const doGatilho = motivoDoRpc(error, MOTIVOS_DA_EXCLUSAO_DE_ETAPA, 'falha-de-comunicacao')
        if (doGatilho !== 'falha-de-comunicacao') return { ok: false, motivo: doGatilho }
        return {
          ok: false,
          motivo: error.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao',
        }
      }
      // A política recusa em silêncio: nenhuma linha de volta é sem permissão.
      if (!(data as unknown[] | null)?.length) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },

    async carregarEtapas(): Promise<RespostaDoFunil> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await consultarFunil(conta.id)
      if (error) return { ok: false, motivo: classificar(error) }

      return { ok: true, etapas: paraEtapas(data) }
    },

    async procurarPorTelefone(e164): Promise<RespostaDaProcura> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // O mesmo recorte do índice único: conta, telefone e lead vivo. Procurar
      // sem o `merged_into_id` acharia quem já foi mesclado em outro e mandaria
      // o operador para uma ficha que não responde mais pelo número.
      const { data, error } = await cliente
        .from('leads')
        .select('id, name, phone_e164, company')
        .eq('account_id', conta.id)
        .eq('phone_e164', e164)
        .is('merged_into_id', null)
        .maybeSingle()

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data) return { ok: true, lead: null }

      const linha = data as unknown as LinhaDeLeadExistente
      return {
        ok: true,
        lead: {
          id: linha.id,
          nome: linha.name?.trim() ?? '',
          telefone: linha.phone_e164,
          empresa: linha.company?.trim() ?? '',
        },
      }
    },

    async cadastrar(novo): Promise<RespostaDoCadastro> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { ok: false, motivo: conta === 'filtro-invalido' ? 'falha-de-comunicacao' : conta }
      }

      // A etapa viaja por chave na interface e por id no banco. A tradução é
      // aqui e não no RPC porque `registrar_lead` já confere que o id é da
      // conta, e mandá-lo aceitar chave o faria adivinhar qual funil.
      let etapaId: string | null = null
      if (novo.etapa !== null) {
        const { data, error } = await cliente
          .from('pipeline_stages')
          .select('id, pipelines!inner(is_default)')
          .eq('account_id', conta.id)
          .eq('key', novo.etapa)
          .eq('pipelines.is_default', true)
          .maybeSingle()

        if (error) {
          return {
            ok: false,
            motivo:
              classificar(error) === 'sem-permissao'
                ? 'sem-permissao'
                : 'falha-de-comunicacao',
          }
        }
        if (!data) return { ok: false, motivo: 'etapa-invalida' }
        etapaId = (data as unknown as { id: string }).id
      }

      // `criar` e não `ignorar`: quem cadastra à mão está dizendo que este lead
      // é novo. Duplicata precisa voltar como recusa nomeada, para a tela
      // mostrar quem já existe — `ignorar` devolveria o id do outro lead como
      // se o cadastro tivesse dado certo.
      //
      // `actor` não vai no payload de propósito: com sessão,
      // `registrar_evento_de_lead` assina o `lead_created` com `auth.uid()` e
      // descarta o argumento. Mandá-lo sugeriria uma escolha que não existe.
      const { data, error } = await cliente.rpc('registrar_lead', {
        p_account_id: conta.id,
        p_lead: {
          phone_e164: novo.telefone,
          name: ouNulo(novo.nome),
          email: ouNulo(novo.email),
          company: ouNulo(novo.empresa),
          city: ouNulo(novo.cidade),
          state: ouNulo(novo.estado),
          timezone: ouNulo(novo.fuso),
          source: ORIGEM_DO_CADASTRO,
          source_ref: ouNulo(novo.origem),
          stage_id: etapaId,
        },
        p_ao_duplicar: 'criar',
      })

      if (error) {
        return {
          ok: false,
          motivo: motivoDoRpc(error, MOTIVOS_DO_CADASTRO, 'falha-de-comunicacao'),
        }
      }

      const linha = (data as { lead_id: string }[] | null)?.[0]
      if (!linha) return { ok: false, motivo: 'falha-de-comunicacao' }

      return { ok: true, leadId: linha.lead_id }
    },

    async bloquear(ids, motivo): Promise<RespostaDoLote> {
      // O instante sai do relógio de quem clicou, e não de `now()`: o `update`
      // do PostgREST manda valores, não expressões. A diferença é o desvio do
      // relógio da máquina, e `blocked_at` é marca de decisão humana, não
      // ordenação de evento — quem precisa de instante do servidor é o
      // `lead_event`, que o banco carimba.
      return escreverLote(ids, 'blocked', { motivo }, (lista) =>
        cliente
          .from('leads')
          .update({
            blocked_at: new Date().toISOString(),
            blocked_reason: motivo,
          })
          .in('id', lista),
      )
    },

    async desbloquear(ids): Promise<RespostaDoLote> {
      // Os dois campos juntos: o check da tabela amarra o par, e limpar só um
      // deles é erro de constraint, não meio desbloqueio.
      return escreverLote(ids, 'unblocked', {}, (lista) =>
        cliente
          .from('leads')
          .update({ blocked_at: null, blocked_reason: null })
          .in('id', lista),
      )
    },

    async excluir(ids): Promise<RespostaDoLote> {
      // Sem evento: a linha do tempo do lead vai junto com ele, por
      // `on delete cascade`. Quem guarda a exclusão é `audit_log`, pelo
      // gatilho `leads_auditoria` (RF-008).
      return escreverLote(ids, null, {}, (lista) =>
        cliente.from('leads').delete().in('id', lista),
      )
    },

    async mesclar(origemId, destinoId): Promise<RespostaDaMesclagem> {
      const { error } = await cliente.rpc('lead_merge', {
        p_origem: origemId,
        p_destino: destinoId,
      })

      if (error) {
        return {
          ok: false,
          motivo: motivoDoRpc(error, MOTIVOS_DA_MESCLAGEM, 'falha-de-comunicacao'),
        }
      }
      return { ok: true }
    },

    async exportar(recorte): Promise<RespostaDaExportacao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return {
          ok: false,
          motivo: conta === 'sem-conta' ? 'sem-permissao' : conta,
        }
      }

      const { data, error, response } = await cliente.functions.invoke<string>(
        'lead-export',
        { body: { contaId: conta.id, recorte } },
      )

      if (error) return { ok: false, motivo: await motivoDaExportacao(error) }

      // O relatório vem em cabeçalho porque o corpo é o arquivo. `x-exportacao-fora`
      // é quantos leads o recorte alcança e não couberam no teto da borda: é
      // esse número que a frase da tela precisa dizer.
      const cabecalhos = response?.headers
      const arquivo: ArquivoDeLeads = {
        nome: nomeDoArquivo(cabecalhos?.get('content-disposition')),
        conteudo: data ?? '',
        linhas: numeroDoCabecalho(cabecalhos, 'x-exportacao-linhas'),
        foraDoArquivo: numeroDoCabecalho(cabecalhos, 'x-exportacao-fora'),
      }

      return { ok: true, arquivo }
    },

    async preverImportacao(pedido): Promise<RespostaDaPrevia> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { ok: false, motivo: contaRecusada(conta) }
      }

      const { data, error } = await cliente.functions.invoke<CorpoDaImportacao>(
        'leads-import',
        {
          body: {
            acao: 'previa',
            contaId: conta.id,
            planilha: pedido.planilha,
            mapeamento: pedido.mapeamento,
          },
        },
      )

      if (error) return { ok: false, motivo: await motivoDaImportacao(error) }
      if (!data?.previa) return { ok: false, motivo: 'falha-de-comunicacao' }

      return { ok: true, previa: data.previa, frases: data.frases ?? {} }
    },

    async importar(pedido): Promise<RespostaDaImportacao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { ok: false, motivo: contaRecusada(conta) }
      }

      // A planilha e o mapeamento vão de novo, inteiros: a borda recalcula a
      // prévia com o estado atual da base em vez de gravar os leads que o
      // navegador montou minutos atrás.
      const { data, error } = await cliente.functions.invoke<CorpoDaImportacao>(
        'leads-import',
        {
          body: {
            acao: 'confirmar',
            contaId: conta.id,
            planilha: pedido.planilha,
            mapeamento: pedido.mapeamento,
            arquivo: pedido.arquivo,
            aoDuplicar: pedido.aoDuplicar,
          },
        },
      )

      if (error) return { ok: false, motivo: await motivoDaImportacao(error) }
      if (!data?.relatorio) return { ok: false, motivo: 'falha-de-comunicacao' }

      return { ok: true, relatorio: data.relatorio, frases: data.frases ?? {} }
    },
  }

  /**
   * O corpo comum das três escritas em lote: manda a operação, confere o que
   * voltou e narra o que passou.
   *
   * A conferência é o ponto. A política de RLS recusa **em silêncio** — um
   * `using` que não casa não levanta erro, apenas não afeta a linha —, e por
   * isso a escrita pede `.select('id')` de volta e compara com o que mandou.
   * Nada voltou é falta de permissão; parte voltou é resultado parcial, e quem
   * o transforma em frase é a tela.
   */
  async function escreverLote(
    ids: readonly string[],
    evento: 'blocked' | 'unblocked' | null,
    carga: Record<string, unknown>,
    operacao: (ids: string[]) => EscritaEmLeads,
  ): Promise<RespostaDoLote> {
    if (ids.length === 0) {
      return { ok: true, resultado: { feitos: [], recusados: [] } }
    }

    const { data, error } = await operacao([...ids]).select('id')
    if (error) return { ok: false, motivo: classificar(error) }

    const feitos = (data as unknown as { id: string }[] | null ?? []).map(
      (linha) => linha.id,
    )
    if (feitos.length === 0) return { ok: false, motivo: 'sem-permissao' }

    if (evento) await registrarEventos(feitos, evento, carga)

    const alcancados = new Set(feitos)
    return {
      ok: true,
      resultado: {
        feitos,
        recusados: ids.filter((id) => !alcancados.has(id)),
      },
    }
  }

  /**
   * Um `lead_event` por lead (RF-113), em ondas de `TAMANHO_DA_ONDA`.
   *
   * O evento não é atômico com a escrita que o gerou: são duas chamadas ao
   * PostgREST, e fundir as duas exigiria um RPC que fizesse o `update` e os
   * eventos na mesma transação. A ordem é a que dá para garantir daqui — o
   * evento só se escreve depois de a escrita ter sido aceita —, e por isso
   * evento que falha não desfaz o bloqueio nem o reporta como falha: o lead
   * está bloqueado, e dizer o contrário mandaria bloquear de novo.
   */
  async function registrarEventos(
    ids: readonly string[],
    kind: 'blocked' | 'unblocked',
    payload: Record<string, unknown>,
  ): Promise<void> {
    for (let inicio = 0; inicio < ids.length; inicio += TAMANHO_DA_ONDA) {
      const onda = ids.slice(inicio, inicio + TAMANHO_DA_ONDA)
      await Promise.all(
        onda.map((id) =>
          cliente.rpc('registrar_evento_de_lead', {
            p_lead_id: id,
            p_kind: kind,
            p_payload: payload,
          }),
        ),
      )
    }
  }
}
