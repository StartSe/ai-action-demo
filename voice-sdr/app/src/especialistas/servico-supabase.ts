// O serviço de especialistas sobre o Supabase (US-251, RF-501).
//
// **Não há borda no caminho, e é de propósito.** `specialists` é classe
// Configuração: membro lê, administrador escreve, tudo pela RLS. Não há efeito
// externo nenhum no cadastro — o convite da reunião é da F5, e quem o manda é
// o servidor no momento do agendamento. Uma função de borda aqui só
// acrescentaria uma viagem e um lugar a mais para a regra divergir.
//
// **`last_assigned_at` não se escreve daqui.** É o carimbo do rodízio, escrito
// pelo servidor a cada agendamento; mandá-lo da tela deixaria alguém empurrar
// o próprio especialista para o fim da fila.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { horaDoBanco } from '@/especialistas/agenda'
import type {
  Bloqueio,
  CargaDaAgenda,
  CargaDosEspecialistas,
  ConexaoDoCalendario,
  Especialista,
  GravacaoDaAgenda,
  GravacaoDoEspecialista,
  Modalidade,
  MotivoDeFalhaDosEspecialistas,
  PedidoDeEspecialista,
  PreparoDaConexao,
  ServicoDeEspecialistas,
} from '@/especialistas/tipos'

/** A borda que devolve o endereço de autorização do Google (US-177). */
const FUNCAO_DA_CONEXAO = 'calendar-connect'

/** As colunas que a tela desenha. `last_assigned_at` entra só para leitura. */
const COLUNAS =
  'id, name, area, timezone, modalities, default_duration_min, daily_cap, ' +
  'min_notice_min, max_notice_days, room_url, email, active, last_assigned_at, ' +
  // O calendário vem junto, pela mesma RLS de membro: a coluna de conexão da
  // tabela não pode custar uma consulta por linha.
  'specialist_calendars(provider, synced_at, sync_error)'

/** O fuso de reserva, o mesmo default de `accounts.timezone`. */
const FUSO_DE_RESERVA = 'America/Sao_Paulo'

interface LinhaDoCalendario {
  provider: string
  synced_at: string | null
  sync_error: string | null
}

interface LinhaDoEspecialista {
  id: string
  name: string
  area: string | null
  timezone: string
  modalities: string[]
  default_duration_min: number
  daily_cap: number
  min_notice_min: number
  max_notice_days: number
  room_url: string | null
  email: string
  active: boolean
  last_assigned_at: string | null
  specialist_calendars: LinhaDoCalendario[] | null
}

/** O erro do Postgres vira motivo. `42501` é a RLS recusando a escrita. */
function classificar(erro: PostgrestError): MotivoDeFalhaDosEspecialistas {
  return erro.code === '42501' ? 'sem-permissao' : 'falha-de-comunicacao'
}

/**
 * Um calendário por provedor (o endereço iCal e, no caminho avançado, o
 * Google). Com mais de um, o que falhou vence: é o que pede ação de quem olha.
 */
function paraConexao(calendarios: readonly LinhaDoCalendario[] | null): ConexaoDoCalendario {
  const lista = calendarios ?? []
  const comFalha = lista.find((calendario) => calendario.sync_error)
  if (comFalha?.sync_error) {
    return {
      estado: 'com-falha',
      provedor: comFalha.provider,
      falha: comFalha.sync_error,
      sincronizadoEm: comFalha.synced_at,
    }
  }
  const primeiro = lista[0]
  if (!primeiro) return { estado: 'desconectado' }
  return { estado: 'conectado', provedor: primeiro.provider, sincronizadoEm: primeiro.synced_at }
}

function paraEspecialista(linha: LinhaDoEspecialista): Especialista {
  return {
    id: linha.id,
    nome: linha.name,
    area: linha.area,
    fuso: linha.timezone,
    modalidades: linha.modalities as Modalidade[],
    duracaoPadraoMin: linha.default_duration_min,
    tetoDiario: linha.daily_cap,
    antecedenciaMinimaMin: linha.min_notice_min,
    antecedenciaMaximaDias: linha.max_notice_days,
    sala: linha.room_url,
    email: linha.email,
    ativo: linha.active,
    ultimoAtendimentoEm: linha.last_assigned_at,
    calendario: paraConexao(linha.specialist_calendars),
  }
}

interface LinhaDaFaixa {
  id: string
  weekday: number
  start_time: string
  end_time: string
}

interface LinhaDoBloqueio {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

/** O corpo da recusa vem dentro do erro da função, como nas outras bordas. */
async function corpoDoErro(erro: unknown): Promise<unknown> {
  const contexto = (erro as { context?: { json?: () => Promise<unknown> } } | null)?.context
  try {
    return contexto?.json ? await contexto.json() : null
  } catch {
    return null
  }
}

/**
 * O corpo de `calendar-connect` vira preparo. A espera do Google chega com
 * 200 e `ok: false`, e por isso se lê pelo motivo, nunca pelo status. Corpo
 * sem frase é a borda fora do ar: frase inventada aqui seria uma segunda
 * versão da dela.
 */
export function lerPreparoDaConexao(corpo: unknown): PreparoDaConexao {
  const lido = (corpo ?? {}) as Record<string, unknown>
  if (lido.ok === true && typeof lido.url === 'string' && lido.url) {
    return { resultado: 'autorizar', url: lido.url }
  }
  const mensagem = typeof lido.mensagem === 'string' ? lido.mensagem : ''
  if (lido.ok !== false || !mensagem || lido.motivo === 'falha_interna') {
    return { resultado: 'indisponivel' }
  }
  if (lido.motivo === 'aguardando_google') return { resultado: 'aguardando-google', mensagem }
  return { resultado: 'recusada', mensagem }
}

function paraBloqueio(linha: LinhaDoBloqueio): Bloqueio {
  return { id: linha.id, inicio: linha.starts_at, fim: linha.ends_at, motivo: linha.reason }
}

/**
 * O erro da agenda vira motivo. `23505` é o único (dia, início) da faixa,
 * `23514` o check da ordem das horas; `23P01`, a sobreposição de bloqueio, é
 * tratado por quem o recebe, porque precisa reler o conflito.
 */
function classificarNaAgenda(erro: PostgrestError): GravacaoDaAgenda {
  if (erro.code === '23505') return { ok: false, motivo: 'faixa-repetida' }
  if (erro.code === '23514') return { ok: false, motivo: 'ordem-invertida' }
  return { ok: false, motivo: classificar(erro) }
}

/** A mesma guarda da escrita do cadastro: sem linha de volta, não gravou. */
function resultadoNaAgenda(
  data: readonly unknown[] | null,
  error: PostgrestError | null,
): GravacaoDaAgenda {
  if (error) return classificarNaAgenda(error)
  if (!data || data.length === 0) return { ok: false, motivo: 'recusada' }
  return { ok: true }
}

/**
 * A escrita só conta com linha de volta. Update que a RLS filtra não levanta
 * erro: responde sucesso com zero linhas, e sem esta guarda a tela diria
 * "salvo" sem nada ter mudado.
 */
function resultadoDaEscrita(
  data: readonly unknown[] | null,
  error: PostgrestError | null,
): GravacaoDoEspecialista {
  if (error) return { ok: false, motivo: classificar(error) }
  if (!data || data.length === 0) return { ok: false, motivo: 'recusada' }
  return { ok: true }
}

export function criarServicoDeEspecialistas(cliente: SupabaseClient): ServicoDeEspecialistas {
  async function contaAtual(): Promise<{ id: string; fuso: string } | MotivoDeFalhaDosEspecialistas> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id, accounts(timezone)')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return classificar(error)
    if (!data) return 'sem-conta'
    const conta = data.accounts as { timezone?: unknown } | null
    return {
      id: data.account_id as string,
      fuso: typeof conta?.timezone === 'string' ? conta.timezone : FUSO_DE_RESERVA,
    }
  }

  return {
    async carregar(): Promise<CargaDosEspecialistas> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialists')
        .select(COLUNAS)
        .eq('account_id', conta.id)
        // Ativos primeiro: são os que a Sarah pode usar hoje, e é o que quem
        // abre a tela quer conferir.
        .order('active', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) return { ok: false, motivo: classificar(error) }
      return {
        ok: true,
        especialistas: (data as unknown as LinhaDoEspecialista[]).map(paraEspecialista),
        fusoDaConta: conta.fuso,
      }
    },

    async salvar(pedido: PedidoDeEspecialista): Promise<GravacaoDoEspecialista> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const linha = {
        name: pedido.nome.trim(),
        // Vazio vira nulo: o check da tabela recusa área em branco, e nulo é o
        // estado normal de quem roteia por rodízio.
        area: pedido.area?.trim() || null,
        timezone: pedido.fuso.trim(),
        modalities: [...pedido.modalidades],
        default_duration_min: pedido.duracaoPadraoMin,
        daily_cap: pedido.tetoDiario,
        min_notice_min: pedido.antecedenciaMinimaMin,
        max_notice_days: pedido.antecedenciaMaximaDias,
        room_url: pedido.sala?.trim() || null,
        email: pedido.email.trim(),
        active: pedido.ativo,
      }

      // `.select('id')` nos dois caminhos: é a linha devolvida que prova a
      // gravação, e não a ausência de erro.
      const { data, error } = pedido.id
        ? await cliente
            .from('specialists')
            .update(linha)
            .eq('id', pedido.id)
            .eq('account_id', conta.id)
            .select('id')
        : await cliente
            .from('specialists')
            .insert({ ...linha, account_id: conta.id })
            .select('id')

      return resultadoDaEscrita(data, error)
    },

    async alternarAtivo(id, ativo): Promise<GravacaoDoEspecialista> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialists')
        .update({ active: ativo })
        .eq('id', id)
        .eq('account_id', conta.id)
        .select('id')

      return resultadoDaEscrita(data, error)
    },

    async carregarAgenda(especialistaId): Promise<CargaDaAgenda> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const [faixas, bloqueios] = await Promise.all([
        cliente
          .from('specialist_availability')
          .select('id, weekday, start_time, end_time')
          .eq('specialist_id', especialistaId)
          .eq('account_id', conta.id),
        cliente
          .from('specialist_blocks')
          .select('id, starts_at, ends_at, reason')
          .eq('specialist_id', especialistaId)
          .eq('account_id', conta.id)
          .order('starts_at', { ascending: true }),
      ])

      const erro = faixas.error ?? bloqueios.error
      if (erro) return { ok: false, motivo: classificar(erro) }
      return {
        ok: true,
        faixas: (faixas.data as LinhaDaFaixa[]).map((linha) => ({
          id: linha.id,
          diaDaSemana: linha.weekday,
          inicio: horaDoBanco(linha.start_time),
          fim: horaDoBanco(linha.end_time),
        })),
        bloqueios: (bloqueios.data as LinhaDoBloqueio[]).map(paraBloqueio),
      }
    },

    async acrescentarFaixa(pedido): Promise<GravacaoDaAgenda> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialist_availability')
        .insert({
          account_id: conta.id,
          specialist_id: pedido.especialistaId,
          weekday: pedido.diaDaSemana,
          start_time: pedido.inicio,
          end_time: pedido.fim,
        })
        .select('id')
      return resultadoNaAgenda(data, error)
    },

    async removerFaixa(id): Promise<GravacaoDaAgenda> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialist_availability')
        .delete()
        .eq('id', id)
        .eq('account_id', conta.id)
        .select('id')
      return resultadoNaAgenda(data, error)
    },

    async acrescentarBloqueio(pedido): Promise<GravacaoDaAgenda> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialist_blocks')
        .insert({
          account_id: conta.id,
          specialist_id: pedido.especialistaId,
          starts_at: pedido.inicio,
          ends_at: pedido.fim,
          reason: pedido.motivo,
        })
        .select('id')

      if (error?.code !== '23P01') return resultadoNaAgenda(data, error)

      // A restrição de exclusão não diz com quem colidiu. A releitura acha o
      // bloqueio pela mesma regra `[)` da restrição, para a frase nomeá-lo.
      const { data: conflitos } = await cliente
        .from('specialist_blocks')
        .select('id, starts_at, ends_at, reason')
        .eq('specialist_id', pedido.especialistaId)
        .eq('account_id', conta.id)
        .lt('starts_at', pedido.fim)
        .gt('ends_at', pedido.inicio)
        .order('starts_at', { ascending: true })
        .limit(1)
      const primeiro = (conflitos as LinhaDoBloqueio[] | null)?.[0]
      return {
        ok: false,
        motivo: 'bloqueio-sobreposto',
        conflito: primeiro ? paraBloqueio(primeiro) : null,
      }
    },

    async removerBloqueio(id): Promise<GravacaoDaAgenda> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialist_blocks')
        .delete()
        .eq('id', id)
        .eq('account_id', conta.id)
        .select('id')
      return resultadoNaAgenda(data, error)
    },

    async prepararConexaoDoCalendario(especialistaId): Promise<PreparoDaConexao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { resultado: 'indisponivel' }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DA_CONEXAO, {
        body: { account_id: conta.id, specialist_id: especialistaId },
      })
      return lerPreparoDaConexao(error ? await corpoDoErro(error) : data)
    },

    async desconectarCalendario(especialistaId): Promise<GravacaoDoEspecialista> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // Todos os provedores do especialista: a tela mostra um calendário só, e
      // desconectar metade deixaria a ocupação de um deles valendo sem cartão.
      const { data, error } = await cliente
        .from('specialist_calendars')
        .delete()
        .eq('specialist_id', especialistaId)
        .eq('account_id', conta.id)
        .select('id')
      return resultadoDaEscrita(data, error)
    },

    async conectarCalendarioIcal(especialistaId, endereco): Promise<GravacaoDoEspecialista> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { error } = await cliente.rpc('conectar_calendario_ical', {
        p_specialist_id: especialistaId,
        p_endereco: endereco,
      })
      if (!error) return { ok: true }
      // 22023 é o endereço que o banco recusou depois da tela: nada gravado.
      return { ok: false, motivo: error.code === '22023' ? 'recusada' : classificar(error) }
    },
  }
}
