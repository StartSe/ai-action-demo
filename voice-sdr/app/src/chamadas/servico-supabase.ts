// O serviço de chamadas sobre o Supabase: lê o estado da operação e o que o
// discador oferece, e fala com as três bordas do ciclo da chamada — `call-place`
// (US-066), `call-cancel` (US-072) e `emergency-stop` (US-073), da frente
// `ralph/f2-borda`.
//
// Nenhuma decisão mora aqui. A recusa da guarda chega pronta no corpo de
// `call-place`, com a frase e a alternativa; o que a implementação faz é ler o
// corpo também quando a borda responde fora de 2xx, porque é assim que o
// cliente do Supabase entrega um 409.
//
// A ficha (`carregarFicha`) lê `calls` e as duas filhas pela RLS de membro:
// chamada de outra conta volta vazia e vira `nao-encontrada`, a mesma resposta
// de um identificador que não existe. O áudio é de `call-audio` (US-072), e só
// é pedido quando alguém toca: a URL vale cinco minutos.
//
// A lista (`listarChamadas`) lê de `chamadas_reais`, a visão que tira o ensaio
// (T-16) num lugar só do banco, e aplica por cima o recorte de
// `chamadas/consulta.ts`, inclusive as direções que a lista mostra. Pede uma linha além do teto para saber, sem
// contar a tabela, se há mais chamadas fora da lista. A ordenação por custo usa
// `cost_cents`, a soma materializada; a célula mostra o total por moeda, lido
// das parcelas embutidas, pela mesma razão da ficha.
//
// A assinatura de `call_live` pede só as colunas de `COLUNAS_DE_CALL_LIVE`. A
// cada evento ela relê a lista inteira da conta em vez de aplicar o delta: a
// tabela é pequena por construção (só chamada viva cabe nela) e a releitura se
// corrige sozinha se um evento se perder.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { COLUNAS_DE_CALL_LIVE, paraChamadaAoVivo } from '@/chamadas/ao-vivo'
import { TETO_DA_LISTA } from '@/chamadas/consulta'
import { lerEstimativa } from '@/chamadas/estimativa'
import type {
  CargaDaEstimativa,
  CargaDaFicha,
  CargaDeChamadas,
  CargaDaOperacao,
  CargaDoDiscador,
  CorpoDaRevisao,
  FreioPuxado,
  MotivoDeFalhaDeChamadas,
  ItemAvaliado,
  ResultadoDaCorrecao,
  ResultadoDaLigacao,
  ResultadoDoAudio,
  ResultadoDoEncerramento,
  ResultadoDoFreio,
  ResultadoDoPasso,
  ServicoDeChamadas,
} from '@/chamadas/tipos'
import { evolucao } from '@/copy/revisao'
import { padraoDeBusca } from '@/leads/consulta'

const PRIVILEGIO_INSUFICIENTE = '42501'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const COLUNAS_DA_FICHA = [
  'id',
  'purpose',
  'direction',
  'status',
  'lead_id',
  'to_number',
  'from_number',
  'started_at',
  'answered_at',
  'ended_at',
  'duration_sec',
  'cost_cents',
  'transcript',
  'end_reason',
  'answered_by',
  'consent_notice_at',
  'recording_path',
  'recording_expires_at',
  'sentiment',
  'classification',
  'classification_source',
  'classification_confidence',
  'classification_corrected_by',
  'classification_corrected_at',
  'evaluation',
  'evaluation_score',
  'account_id',
  'lead:leads(name)',
].join(', ')

/**
 * O que `corrigir_classificacao` devolve, traduzido para o motivo da tela.
 * `chamada_de_outra_conta` é `nao-encontrada`, a mesma resposta da RLS.
 */
const RESPOSTAS_DA_CORRECAO: ReadonlyMap<string, ResultadoDaCorrecao> = new Map([
  ['corrigida', { ok: true }],
  ['chamada_inexistente', { ok: false, motivo: 'nao-encontrada' }],
  ['chamada_de_outra_conta', { ok: false, motivo: 'nao-encontrada' }],
  ['sem_permissao', { ok: false, motivo: 'sem-permissao' }],
  ['classificacao_invalida', { ok: false, motivo: 'classificacao-invalida' }],
])

const COLUNAS_DA_LISTA = [
  'id',
  'purpose',
  'direction',
  'status',
  'lead_id',
  'to_number',
  'from_number',
  'started_at',
  'duration_sec',
  'end_reason',
  'evaluation_score',
  'lead:leads(name)',
  'call_costs!call_costs_da_chamada_da_conta(component, amount_cents, currency)',
].join(', ')

/** A coluna de cada ordenação, sempre do maior para o menor. */
const COLUNA_DA_ORDENACAO = {
  instante: 'started_at',
  duracao: 'duration_sec',
  custo: 'cost_cents',
} as const

function objetoOuVazio(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

/** `calls.transcript.turns`, lido com a tolerância de `texto_da_transcricao`. */
function lerTurnos(transcricao: unknown) {
  const turnos = objetoOuVazio(transcricao).turns
  if (!Array.isArray(turnos)) return []
  return turnos.flatMap((cru) => {
    const turno = objetoOuVazio(cru)
    const texto = textoOuNulo(turno.text)
    if (!texto) return []
    return [{ quem: String(turno.role ?? ''), texto, em: String(turno.at ?? '') }]
  })
}

/**
 * `calls.evaluation.itens`, como `registrar_avaliacao_automatica` os grava
 * (`{ criterio, aprovado, evidencia }`). Item sem chave é descartado;
 * `aprovado` que não é booleano é critério sem decisão.
 */
function lerItensDaAvaliacao(avaliacao: unknown): ItemAvaliado[] {
  const itens = objetoOuVazio(avaliacao).itens
  if (!Array.isArray(itens)) return []
  return itens.flatMap((cru) => {
    const item = objetoOuVazio(cru)
    const criterio = textoOuNulo(item.criterio)
    if (!criterio) return []
    return [
      {
        criterio,
        aprovado: typeof item.aprovado === 'boolean' ? item.aprovado : null,
        evidencia: textoOuNulo(item.evidencia),
      },
    ]
  })
}

/** Quantos leads o discador oferece. É seletor, não lista de trabalho. */
const LEADS_NO_DISCADOR = 50

function classificar(erro: PostgrestError | null): MotivoDeFalhaDeChamadas {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  return 'falha-de-comunicacao'
}

/**
 * O corpo de uma função de borda que respondeu fora de 2xx. O cliente do
 * Supabase entrega esse caso como erro, com a resposta em `context`.
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

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

export function criarServicoDeChamadas(cliente: SupabaseClient): ServicoDeChamadas {
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDeChamadas> {
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

  /** Chama uma borda e devolve o corpo, venha ele em 2xx ou não. */
  async function invocar(funcao: string, corpo: Record<string, unknown>) {
    const { data, error } = await cliente.functions.invoke(funcao, { body: corpo })
    return (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null
  }

  /**
   * Um passo do ciclo de evolução. A recusa chega pronta da borda, em
   * `mensagem`; a tela a mostra como veio. Só a falha sem corpo nenhum — rede
   * caída antes de a função responder — ganha frase daqui, porque nesse caso
   * não houve borda para escrevê-la.
   */
  async function passoDaRevisao(corpo: Record<string, unknown>): Promise<ResultadoDoPasso> {
    const conta = await contaAtual()
    if (typeof conta === 'string') return { ok: false, mensagem: evolucao.falhaGenerica }

    const resposta = await invocar('call-review', { account_id: conta.id, ...corpo })
    if (!resposta) return { ok: false, mensagem: evolucao.falhaGenerica }
    if (resposta.ok === true) return { ok: true, corpo: resposta as unknown as CorpoDaRevisao }
    const caminho = textoOuNulo(resposta.caminho)
    return {
      ok: false,
      mensagem: textoOuNulo(resposta.mensagem) ?? evolucao.falhaGenerica,
      ...(caminho ? { caminho } : {}),
    }
  }

  async function freio(acao: 'parar' | 'retomar', motivo: string): Promise<ResultadoDoFreio> {
    const conta = await contaAtual()
    if (typeof conta === 'string') return { ok: false, mensagem: '' }
    const corpo = await invocar('emergency-stop', { acao, contaId: conta.id, motivo })
    return {
      ok: corpo?.ok === true,
      mensagem: textoOuNulo(corpo?.mensagem) ?? '',
    }
  }

  return {
    async carregarOperacao(): Promise<CargaDaOperacao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('accounts')
        .select('dialing_paused_at, dialing_paused_by, dialing_paused_reason')
        .eq('id', conta.id)
        .maybeSingle()
      if (error) return { ok: false, motivo: classificar(error) }
      if (!data) return { ok: false, motivo: 'sem-permissao' }

      let freioPuxado: FreioPuxado | null = null
      if (data.dialing_paused_at) {
        let nome: string | null = null
        if (data.dialing_paused_by) {
          const { data: perfil } = await cliente
            .from('profiles')
            .select('display_name')
            .eq('id', data.dialing_paused_by)
            .maybeSingle()
          nome = textoOuNulo(perfil?.display_name)
        }
        freioPuxado = {
          em: String(data.dialing_paused_at),
          por: nome,
          motivo: textoOuNulo(data.dialing_paused_reason),
        }
      }

      return { ok: true, contaId: conta.id, freio: freioPuxado }
    },

    async carregarDiscador(): Promise<CargaDoDiscador> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const [contaLida, testes, leads, linhas] = await Promise.all([
        cliente
          .from('accounts')
          .select('feature_flags, first_test_call_ok_at')
          .eq('id', conta.id)
          .maybeSingle(),
        cliente
          .from('account_test_numbers')
          .select('phone_e164, label')
          .eq('account_id', conta.id)
          .order('created_at', { ascending: true }),
        cliente
          .from('leads')
          .select('id, name, phone_e164')
          .eq('account_id', conta.id)
          .not('phone_e164', 'is', null)
          .order('last_activity_at', { ascending: false, nullsFirst: false })
          .limit(LEADS_NO_DISCADOR),
        cliente
          .from('phone_lines')
          .select('id, e164, label')
          .eq('account_id', conta.id)
          .eq('enabled', true)
          .eq('outbound_enabled', true)
          .order('created_at', { ascending: true }),
      ])

      const erro = contaLida.error ?? testes.error ?? leads.error ?? linhas.error
      if (erro) return { ok: false, motivo: classificar(erro) }
      if (!contaLida.data) return { ok: false, motivo: 'sem-permissao' }

      const bandeiras = (contaLida.data.feature_flags ?? {}) as Record<string, unknown>
      const numerosDeTeste = (testes.data ?? []).map((linha) => ({
        telefone: String(linha.phone_e164),
        rotulo: String(linha.label),
      }))

      return {
        ok: true,
        discador: {
          portao: {
            realDialing: bandeiras.real_dialing === true,
            primeiraChamadaDeTesteEm: textoOuNulo(contaLida.data.first_test_call_ok_at),
            numerosDeTeste: numerosDeTeste.map((numero) => numero.telefone),
          },
          numerosDeTeste,
          leads: (leads.data ?? []).map((lead) => ({
            id: String(lead.id),
            nome: textoOuNulo(lead.name) ?? String(lead.phone_e164),
            telefone: String(lead.phone_e164),
          })),
          linhas: (linhas.data ?? []).map((linha) => ({
            id: String(linha.id),
            e164: String(linha.e164),
            rotulo: String(linha.label),
          })),
        },
      }
    },

    async discar(pedido): Promise<ResultadoDaLigacao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { ok: false, motivo: conta, mensagem: '', alternativa: null }
      }

      const corpo = await invocar('call-place', {
        contaId: conta.id,
        proposito: pedido.proposito,
        fonte: 'manual',
        referencia: pedido.referencia,
        telefone: pedido.telefone,
        leadId: pedido.leadId,
        // `call-place` ainda não lê este campo: o passo 8 da guarda escolhe a
        // linha pelo rodízio. Declarado em `notes` da US-090.
        linhaId: pedido.linhaId,
      })

      if (corpo?.ok === true && typeof corpo.chamadaId === 'string') {
        return {
          ok: true,
          estado: corpo.estado === 'ja_existia' ? 'ja_existia' : 'discando',
          chamadaId: corpo.chamadaId,
          mensagem: textoOuNulo(corpo.mensagem) ?? '',
        }
      }

      return {
        ok: false,
        motivo: textoOuNulo(corpo?.motivo) ?? 'sem_resposta',
        mensagem: textoOuNulo(corpo?.mensagem) ?? '',
        alternativa: textoOuNulo(corpo?.alternativa),
      }
    },

    async encerrar(chamadaId): Promise<ResultadoDoEncerramento> {
      const corpo = await invocar('call-cancel', { chamadaId })
      return { ok: corpo?.ok === true, mensagem: textoOuNulo(corpo?.mensagem) ?? '' }
    },

    async carregarFicha(chamadaId): Promise<CargaDaFicha> {
      // Identificador malformado não vai ao banco: o PostgREST responderia
      // erro de tipo, e a tela mostraria falha de comunicação no lugar de
      // "não encontrada".
      if (!UUID.test(chamadaId)) return { ok: false, motivo: 'nao-encontrada' }

      const [chamada, custos, ferramentas] = await Promise.all([
        cliente.from('calls').select(COLUNAS_DA_FICHA).eq('id', chamadaId).maybeSingle(),
        cliente
          .from('call_costs')
          .select('component, amount_cents, currency')
          .eq('call_id', chamadaId),
        cliente
          .from('call_tool_invocations')
          .select('tool, at, error')
          .eq('call_id', chamadaId)
          .order('at', { ascending: true }),
      ])

      const erro = chamada.error ?? custos.error ?? ferramentas.error
      if (erro) return { ok: false, motivo: classificar(erro) }
      if (!chamada.data) return { ok: false, motivo: 'nao-encontrada' }

      const linha = chamada.data as unknown as Record<string, unknown>
      const lead = objetoOuVazio(linha.lead)
      const contaId = String(linha.account_id)
      const corretor = textoOuNulo(linha.classification_corrected_by)

      // A segunda onda depende da conta da chamada: as etapas que a correção
      // oferece, os rótulos dos critérios e o nome de quem corrigiu.
      const [etapas, criterios, perfil] = await Promise.all([
        cliente
          .from('pipeline_stages')
          .select('key, label, position, pipelines!inner(is_default)')
          .eq('account_id', contaId)
          .eq('pipelines.is_default', true)
          .order('position', { ascending: true }),
        cliente
          .from('evaluation_criteria')
          .select('key, label, position')
          .eq('account_id', contaId)
          .order('position', { ascending: true }),
        corretor
          ? cliente.from('profiles').select('display_name').eq('id', corretor).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      const erroDaConta = etapas.error ?? criterios.error
      if (erroDaConta) return { ok: false, motivo: classificar(erroDaConta) }

      return {
        ok: true,
        ficha: {
          id: String(linha.id),
          proposito: String(linha.purpose),
          direcao: String(linha.direction),
          status: String(linha.status),
          leadId: textoOuNulo(linha.lead_id),
          leadNome: textoOuNulo(lead.name),
          numeroDeDestino: textoOuNulo(linha.to_number),
          numeroDeOrigem: textoOuNulo(linha.from_number),
          iniciadaEm: String(linha.started_at),
          atendidaEm: textoOuNulo(linha.answered_at),
          encerradaEm: textoOuNulo(linha.ended_at),
          duracaoSeg: numeroOuNulo(linha.duration_sec),
          custoTotalCentavos: numeroOuNulo(linha.cost_cents) ?? 0,
          parcelas: (custos.data ?? []).map((parcela) => ({
            componente: String(parcela.component),
            centavos: Number(parcela.amount_cents),
            moeda: String(parcela.currency),
          })),
          turnos: lerTurnos(linha.transcript),
          ferramentas: (ferramentas.data ?? []).map((invocacao) => ({
            ferramenta: String(invocacao.tool),
            em: String(invocacao.at),
            erro: textoOuNulo(invocacao.error),
          })),
          motivoDoFim: textoOuNulo(linha.end_reason),
          atendidaPor: textoOuNulo(linha.answered_by),
          avisoDeGravacaoEm: textoOuNulo(linha.consent_notice_at),
          caminhoDaGravacao: textoOuNulo(linha.recording_path),
          gravacaoExpiraEm: textoOuNulo(linha.recording_expires_at),
          sentimento: numeroOuNulo(linha.sentiment),
          classificacao: objetoOuVazio(linha.classification),
          origemDaClassificacao: textoOuNulo(linha.classification_source),
          confiancaDaClassificacao: numeroOuNulo(linha.classification_confidence),
          corrigidaPor: textoOuNulo(objetoOuVazio(perfil.data).display_name),
          corrigidaEm: textoOuNulo(linha.classification_corrected_at),
          notaDaAvaliacao: numeroOuNulo(linha.evaluation_score),
          itensDaAvaliacao: lerItensDaAvaliacao(linha.evaluation),
          criteriosDaConta: (criterios.data ?? []).map((criterio) => ({
            chave: String(criterio.key),
            rotulo: String(criterio.label),
          })),
          etapas: (etapas.data ?? []).map((etapa) => ({
            chave: String(etapa.key),
            rotulo: String(etapa.label),
          })),
        },
      }
    },

    async corrigirClassificacao(pedido): Promise<ResultadoDaCorrecao> {
      const { data, error } = await cliente.rpc('corrigir_classificacao', {
        p_call_id: pedido.chamadaId,
        p_classificacao: pedido.classificacao,
        p_motivo: pedido.motivo,
      })
      if (error) {
        return {
          ok: false,
          motivo: error.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao',
        }
      }
      return RESPOSTAS_DA_CORRECAO.get(String(data)) ?? { ok: false, motivo: 'falha-de-comunicacao' }
    },

    async pedirAudio(chamadaId): Promise<ResultadoDoAudio> {
      const corpo = await invocar('call-audio', { chamadaId })
      if (corpo?.ok === true && typeof corpo.url === 'string') {
        return { ok: true, url: corpo.url, expiraEm: textoOuNulo(corpo.expiraEm) ?? '' }
      }
      return {
        ok: false,
        motivo: textoOuNulo(corpo?.motivo) ?? 'sem_resposta',
        mensagem: textoOuNulo(corpo?.mensagem) ?? '',
      }
    },

    // O ciclo de evolução (US-245). Os cinco passos batem na mesma borda,
    // mudando só `action`: quem sabe qual é o próximo passo é a revisão no
    // banco, e a borda recusa passo fora de vez com `etapa_errada`.
    async analisarChamada(chamadaId): Promise<ResultadoDoPasso> {
      return await passoDaRevisao({ action: 'analisar', call_id: chamadaId })
    },

    async responderRevisao(revisaoId, respostas): Promise<ResultadoDoPasso> {
      return await passoDaRevisao({
        action: 'responder',
        review_id: revisaoId,
        answers: respostas,
      })
    },

    async questionarProposta(revisaoId, mudancaId, questionamento): Promise<ResultadoDoPasso> {
      return await passoDaRevisao({
        action: 'questionar',
        review_id: revisaoId,
        change_id: mudancaId,
        note: questionamento,
      })
    },

    async aplicarRevisao(revisaoId, decisoes): Promise<ResultadoDoPasso> {
      return await passoDaRevisao({
        action: 'aplicar',
        review_id: revisaoId,
        decisions: decisoes,
      })
    },

    async descartarRevisao(revisaoId): Promise<ResultadoDoPasso> {
      return await passoDaRevisao({ action: 'descartar', review_id: revisaoId })
    },

    async estimarCusto(): Promise<CargaDaEstimativa> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }
      const { data, error } = await cliente.rpc('estimativa_de_custo', {
        p_account_id: conta.id,
      })
      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, estimativa: lerEstimativa(data) }
    },

    async listarChamadas(recorte): Promise<CargaDeChamadas> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      let consulta = cliente
        .from('chamadas_reais')
        .select(COLUNAS_DA_LISTA)
        .eq('account_id', conta.id)
        .in('direction', [...recorte.direcoes])
      if (recorte.desde) consulta = consulta.gte('started_at', recorte.desde)
      if (recorte.proposito) consulta = consulta.eq('purpose', recorte.proposito)
      if (recorte.resultado) consulta = consulta.eq('end_reason', recorte.resultado)
      if (recorte.numero) {
        const padrao = padraoDeBusca(recorte.numero)
        consulta = consulta.or(`to_number.ilike.${padrao},from_number.ilike.${padrao}`)
      }

      const coluna = COLUNA_DA_ORDENACAO[recorte.ordenacao]
      consulta = consulta.order(coluna, { ascending: false, nullsFirst: false })
      if (coluna !== 'started_at') consulta = consulta.order('started_at', { ascending: false })

      const { data, error } = await consulta.limit(TETO_DA_LISTA + 1)
      if (error) return { ok: false, motivo: classificar(error) }

      const linhas = (data ?? []) as unknown as Record<string, unknown>[]
      const chamadas = linhas.slice(0, TETO_DA_LISTA).map((linha) => {
        const direcao = String(linha.direction)
        const custos = Array.isArray(linha.call_costs) ? linha.call_costs : []
        return {
          id: String(linha.id),
          proposito: String(linha.purpose),
          direcao,
          status: String(linha.status),
          leadId: textoOuNulo(linha.lead_id),
          leadNome: textoOuNulo(objetoOuVazio(linha.lead).name),
          numero: textoOuNulo(direcao === 'inbound' ? linha.from_number : linha.to_number),
          iniciadaEm: String(linha.started_at),
          duracaoSeg: numeroOuNulo(linha.duration_sec),
          parcelas: custos.map((cru) => {
            const parcela = objetoOuVazio(cru)
            return {
              componente: String(parcela.component),
              centavos: Number(parcela.amount_cents),
              moeda: String(parcela.currency),
            }
          }),
          motivoDoFim: textoOuNulo(linha.end_reason),
          nota: numeroOuNulo(linha.evaluation_score),
        }
      })

      return { ok: true, pagina: { chamadas, truncada: linhas.length > TETO_DA_LISTA } }
    },

    pararDiscagem: (motivo) => freio('parar', motivo),
    retomarDiscagem: (motivo) => freio('retomar', motivo),

    assinarAoVivo(aoReceber) {
      let ativo = true
      let canal: ReturnType<SupabaseClient['channel']> | null = null

      async function reler(contaId: string) {
        const { data, error } = await cliente
          .from('call_live')
          .select(COLUNAS_DE_CALL_LIVE.join(', '))
          .eq('account_id', contaId)
          .order('started_at', { ascending: true })
        if (!ativo) return
        if (error) {
          aoReceber({ tipo: 'erro' })
          return
        }
        const linhas = (data ?? []) as unknown as Record<string, unknown>[]
        aoReceber({ tipo: 'chamadas', chamadas: linhas.map(paraChamadaAoVivo) })
      }

      void contaAtual().then((conta) => {
        if (!ativo) return
        if (typeof conta === 'string') {
          aoReceber({ tipo: 'erro' })
          return
        }
        canal = cliente
          .channel(`call_live:${conta.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'call_live',
              filter: `account_id=eq.${conta.id}`,
            },
            () => {
              void reler(conta.id)
            },
          )
          .subscribe((estado) => {
            if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
              aoReceber({ tipo: 'erro' })
            }
          })
        void reler(conta.id)
      })

      return () => {
        ativo = false
        if (canal) void cliente.removeChannel(canal)
      }
    },
  }
}
