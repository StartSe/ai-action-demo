import type { RecorteDeLeads } from '@compartilhado/recorte-de-leads.ts'
import {
  atenderImportacao,
  type LeadGravado,
  type PortaDeConfirmacao,
} from '@importacao/confirmacao.ts'
import type { LeadDaLinha } from '@importacao/previa.ts'

import { chaveDoRotulo, ehCanonica } from '@/funil/etapas'
import type { EventoDoLead, LigacaoDoLead } from '@/leads/linha-do-tempo'
import type {
  BriefingDoLead,
  CargaDaConfiguracao,
  CargaDaFichaDoLead,
  CargaDeLeads,
  CargaDoFunil,
  EtapaConfigurada,
  EtapaDoFunil,
  EtapaPedida,
  LeadDaLista,
  LeadDoFunil,
  MudancaDeEtapa,
  NovoLead,
  Origem,
  PedidoDaImportacao,
  PedidoDaPrevia,
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
} from '@/leads/tipos'

/**
 * O lead como o dublê o guarda: o da lista mais o que a consulta usa sem
 * mostrar. O e-mail entra na busca (RF-110) e não tem coluna na tabela, e a
 * data de cadastro ordena sem aparecer — deixá-los fora do contrato é o que
 * impede a tela de desenhar dado que a consulta real não pediu.
 */
export interface LeadDeExemplo extends LeadDaLista {
  email: string
  criadoEm: string
  /**
   * `source`, que só o quadro filtra no dublê (US-145). Opcional para os
   * cenários da lista continuarem sem origem, como o comentário de `ordenar`
   * explica.
   */
  origem?: Origem
  /** `leads.score`; ausente é `null`. */
  pontuacao?: number | null
  /** O último `stage_change`; ausente é lead que nunca mudou de etapa. */
  ultimaMudancaDeEtapa?: MudancaDeEtapa | null
  /** Só a ficha os desenha (US-147); ausentes são vazios. */
  fuso?: string | null
  briefing?: Partial<BriefingDoLead>
  motivoDoBloqueio?: string | null
}

/** Quem está com a sessão no dublê: o mesmo `u-1` do dublê de equipe. */
export const USUARIO_DO_DUBLE = 'u-1'

/** Os membros da conta, pelo id, como a ficha os lê. */
export const NOMES_DO_DUBLE: ReadonlyMap<string, string> = new Map([
  ['u-1', 'Renata Alves'],
  ['u-2', 'Caio Moreira'],
])

/** O mesmo teto por coluna do serviço de verdade. */
const TETO_DA_COLUNA_DUBLADA = 8

export interface RespostasDeLeads {
  /** A carga do funil nunca volta, para provar o estado de carregando. */
  funilPendente?: boolean
  /** Recusa a carga do funil, para provar a frase de falha. */
  funilFalha?: boolean
  /** Quando presente, o dublê devolve isto e ignora os leads. */
  listar?: CargaDeLeads
  leads?: LeadDeExemplo[]
  etapas?: EtapaDoFunil[]
  truncada?: boolean
  /**
   * Quando presente, a escrita em lote devolve isto em vez de gravar. É como o
   * teste exercita a recusa da política, que no Supabase é silenciosa: ela não
   * levanta erro, só não devolve a linha.
   */
  bloquear?: RespostaDoLote
  desbloquear?: RespostaDoLote
  excluir?: RespostaDoLote
  mesclar?: RespostaDaMesclagem
  exportar?: RespostaDaExportacao
  /** Quando presente, o cadastro devolve isto e nada entra na lista. */
  cadastrar?: RespostaDoCadastro
  carregarEtapas?: RespostaDoFunil
  /**
   * Quando presente, a procura por telefone devolve isto. Sem ela, o dublê
   * procura de verdade entre os leads que guarda — é assim que o teste prova
   * que a tela achou o duplicado sem precisar montar a resposta à mão.
   */
  procurar?: RespostaDaProcura
  /**
   * Quando presentes, a prévia e a importação devolvem isto. Sem elas, o dublê
   * chama `atenderImportacao` de verdade sobre os leads que guarda: os números
   * da prévia são os que a borda produziria, e não uma resposta escrita à mão
   * que casaria com a tela por construção.
   */
  preverImportacao?: RespostaDaPrevia
  importar?: RespostaDaImportacao
  /**
   * Quando presente, a mudança de etapa devolve isto e nada se move. É como o
   * teste exercita a recusa de `mover_lead_de_etapa`.
   */
  moverDeEtapa?: RespostaDaMudancaDeEtapa
  /** A configuração das etapas nunca volta, para provar o estado de carregando. */
  configuracaoPendente?: boolean
  /** Recusa a leitura da configuração das etapas. */
  configuracaoFalha?: boolean
  /**
   * Quando presente, `configurarEtapas` devolve isto e nada muda. É como o
   * teste exercita a recusa do RPC, e prova que a tela não fica mostrando a
   * ordem que pediu.
   */
  configurarEtapas?: RespostaDaConfiguracao
  /** Quando presente, `apagarEtapa` devolve isto e nada sai. */
  apagarEtapa?: RespostaDaExclusaoDeEtapa
  /** A ficha do lead nunca volta, para provar o estado de carregando. */
  fichaPendente?: boolean
  /** Recusa a carga da ficha do lead. */
  fichaFalha?: boolean
  /**
   * Os eventos de `lead_events` de cada lead, pelo id do lead. O dublê os
   * guarda como estado: mover, bloquear e anotar acrescentam o evento que o
   * banco gravaria, com o rótulo da etapa de então.
   */
  linhasDoTempo?: Record<string, EventoDoLead[]>
  /** As linhas de `calls` que os eventos `call` apontam. */
  ligacoes?: LigacaoDoLead[]
  /** Quando presente, `registrarNota` devolve isto e nada entra na linha. */
  registrarNota?: RespostaDaNota
}

/** Um pedido de escrita em lote, como o teste o lê depois. */
export interface PedidoEmLote {
  ids: string[]
  motivo?: string
}

export interface ServicoDeLeadsDublado extends ServicoDeLeads {
  /** Todo recorte pedido, na ordem, para o teste medir o filtro. */
  readonly recortes: RecorteDeLeads[]
  readonly bloqueados: PedidoEmLote[]
  readonly desbloqueados: PedidoEmLote[]
  readonly excluidos: PedidoEmLote[]
  readonly mesclagens: { origem: string; destino: string }[]
  /** Todo recorte exportado, para o teste cobrar que é o da tela. */
  readonly exportados: RecorteDeLeads[]
  /** Todo lead cadastrado, na ordem, para o teste medir o que a tela mandou. */
  readonly cadastrados: NovoLead[]
  /** Todo E.164 procurado, para o teste cobrar que a procura saiu. */
  readonly procurados: string[]
  /** Toda prévia pedida, na ordem. */
  readonly previas: PedidoDaPrevia[]
  /**
   * Toda confirmação pedida. É a lista que prova o que a tela promete: até o
   * clique em confirmar, ela está vazia.
   */
  readonly importacoes: PedidoDaImportacao[]
  /**
   * Um `lead_event` por lead escrito, como o serviço real faz. O dublê o
   * guarda para o teste poder cobrar o evento sem banco.
   */
  /** Todo recorte que o quadro pediu, na ordem. */
  readonly recortesDoFunil: RecorteDeLeads[]
  /**
   * Toda mudança de etapa pedida, com o ator que o serviço real manda ao RPC.
   * É sempre `user`: a interface só move como gente (RF-202).
   */
  readonly movimentos: { leadId: string; chave: string; ator: 'user' }[]
  /** Toda chamada a `configurar_etapas`, com a lista inteira que foi. */
  readonly configuracoes: { funilId: string; etapas: EtapaPedida[] }[]
  /** Todo id de etapa que a tela pediu para apagar. */
  readonly etapasApagadas: string[]
  /** Toda nota pedida, na ordem, com o texto que a tela mandou. */
  readonly notas: { leadId: string; texto: string }[]
  /** Toda ficha pedida, pelo id do lead. */
  readonly fichasPedidas: string[]
  readonly eventos: {
    id: string
    kind: 'blocked' | 'unblocked' | 'lead_created' | 'lead_imported'
    /**
     * Quem assinou o evento. É sempre `user` porque a interface chama o banco
     * com sessão, e `registrar_evento_de_lead` descarta o ator que o argumento
     * pedir quando há `auth.uid()`. O dublê guarda o campo para o teste poder
     * cobrar isso sem banco.
     */
    actor: 'user'
  }[]
}

/** O funil padrão da conta do dublê. */
export const FUNIL_DO_DUBLE = 'f-1'

/** As seis etapas do funil padrão, na ordem em que a migração as cria. */
export const ETAPAS_DE_EXEMPLO: EtapaDoFunil[] = [
  { chave: 'new', rotulo: 'Novo' },
  { chave: 'contacted', rotulo: 'Contatado' },
  { chave: 'qualified', rotulo: 'Qualificado' },
  { chave: 'meeting_booked', rotulo: 'Reunião marcada' },
  { chave: 'won', rotulo: 'Ganho' },
  { chave: 'lost', rotulo: 'Perdido' },
]

/**
 * A conta em que o dublê grava. A tela nunca a manda — quem resolve a conta é
 * o serviço real, pela sessão —, e a borda exige uma: esta é a que o dublê põe
 * no lugar dela.
 */
export const CONTA_DO_DUBLE = 'c-1'

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

/**
 * Quatro leads que cobrem o que a tela precisa distinguir: com e sem nome, de
 * etapas e temperaturas diferentes, um bloqueado e um que nunca teve contato.
 * Os instantes são relativos ao relógio porque o filtro de atividade também é:
 * datas fixas fariam o teste do recorte depender do dia em que roda.
 */
export function leadsDeExemplo(agora: () => number = Date.now): LeadDeExemplo[] {
  const base = agora()

  return [
    {
      id: 'l-1',
      nome: 'Marina Castro',
      telefone: '+5548999998888',
      email: 'marina@aurora.com.br',
      empresa: 'Aurora Logística',
      cidade: 'Florianópolis',
      estado: 'SC',
      etapa: { chave: 'qualified', rotulo: 'Qualificado' },
      temperatura: 'quente',
      ultimaAtividade: new Date(base - 2 * HORA).toISOString(),
      criadoEm: new Date(base - 10 * DIA).toISOString(),
      bloqueado: false,
    },
    {
      id: 'l-2',
      nome: 'Bruno Tavares',
      telefone: '+5511988887777',
      email: 'bruno@pilar.com.br',
      empresa: 'Pilar Engenharia',
      cidade: 'São Paulo',
      estado: 'SP',
      etapa: { chave: 'new', rotulo: 'Novo' },
      temperatura: 'morno',
      ultimaAtividade: new Date(base - 4 * DIA).toISOString(),
      criadoEm: new Date(base - 4 * DIA).toISOString(),
      bloqueado: false,
    },
    {
      id: 'l-3',
      nome: '',
      telefone: '+5521977776666',
      email: '',
      empresa: '',
      cidade: 'Rio de Janeiro',
      estado: 'RJ',
      etapa: { chave: 'contacted', rotulo: 'Contatado' },
      temperatura: null,
      ultimaAtividade: null,
      criadoEm: new Date(base - 20 * DIA).toISOString(),
      bloqueado: false,
    },
    {
      id: 'l-4',
      nome: 'Célia Prado',
      telefone: '+5551966665555',
      email: 'celia@vento.com.br',
      empresa: 'Vento Sul',
      cidade: 'Porto Alegre',
      estado: 'RS',
      etapa: { chave: 'lost', rotulo: 'Perdido' },
      temperatura: 'frio',
      ultimaAtividade: new Date(base - 25 * DIA).toISOString(),
      criadoEm: new Date(base - 30 * DIA).toISOString(),
      bloqueado: true,
    },
  ]
}

/**
 * Dublê do serviço de leads para os testes de componente. Recorta em memória
 * com as mesmas regras do serviço real, para o teste poder provar que a tela
 * pediu o recorte certo e que a lista encolheu.
 */
export function criarServicoDeLeadsDublado(
  respostas: RespostasDeLeads = {},
): ServicoDeLeadsDublado {
  const recortes: RecorteDeLeads[] = []
  const bloqueados: PedidoEmLote[] = []
  const desbloqueados: PedidoEmLote[] = []
  const excluidos: PedidoEmLote[] = []
  const mesclagens: { origem: string; destino: string }[] = []
  const exportados: RecorteDeLeads[] = []
  const cadastrados: NovoLead[] = []
  const procurados: string[] = []
  const previas: PedidoDaPrevia[] = []
  const importacoes: PedidoDaImportacao[] = []
  const eventos: ServicoDeLeadsDublado['eventos'] = []
  const recortesDoFunil: RecorteDeLeads[] = []
  const movimentos: ServicoDeLeadsDublado['movimentos'] = []
  const configuracoes: ServicoDeLeadsDublado['configuracoes'] = []
  const etapasApagadas: string[] = []
  const notas: ServicoDeLeadsDublado['notas'] = []
  const fichasPedidas: string[] = []
  const linhasDoTempo = new Map<string, EventoDoLead[]>(
    Object.entries(respostas.linhasDoTempo ?? {}).map(([id, lista]) => [id, [...lista]]),
  )
  let proximoEvento = 1

  /** Acrescenta o evento que o RPC gravaria, assinado por quem tem a sessão. */
  function narrar(leadId: string, kind: string, payload: Record<string, unknown>) {
    const lista = linhasDoTempo.get(leadId) ?? []
    lista.push({
      id: `ev-${String(proximoEvento++)}`,
      kind,
      ocorridoEm: new Date().toISOString(),
      ator: 'user',
      autorId: USUARIO_DO_DUBLE,
      chamadaId: null,
      payload,
    })
    linhasDoTempo.set(leadId, lista)
  }
  let todos = respostas.leads ?? leadsDeExemplo()
  let proximoId = 1

  /**
   * As etapas como `pipeline_stages` as guarda: com id, posição e cor. É
   * estado, e não a constante, porque `configurarEtapas` as muda, e o quadro
   * precisa ler o rótulo novo pela chave de sempre.
   */
  let etapasGuardadas = (respostas.etapas ?? ETAPAS_DE_EXEMPLO).map((etapa, posicao) => ({
    id: `e-${etapa.chave}`,
    chave: etapa.chave,
    rotulo: etapa.rotulo,
    posicao,
    cor: etapa.cor ?? null,
  }))

  /** As etapas na ordem de `position`, como a consulta do funil as devolve. */
  function etapasVigentes(): EtapaDoFunil[] {
    return [...etapasGuardadas]
      .sort((a, b) => a.posicao - b.posicao)
      .map(({ chave, rotulo, cor }) => (cor ? { chave, rotulo, cor } : { chave, rotulo }))
  }

  /** A etapa do lead pela chave, com o rótulo de agora: é o que a junção faz. */
  function etapaDoLead(lead: LeadDeExemplo): EtapaDoFunil | null {
    if (!lead.etapa) return null
    const chave = lead.etapa.chave
    return etapasVigentes().find((etapa) => etapa.chave === chave) ?? lead.etapa
  }

  function lerConfiguracao(): CargaDaConfiguracao {
    return {
      ok: true,
      configuracao: {
        funilId: FUNIL_DO_DUBLE,
        etapas: [...etapasGuardadas]
          .sort((a, b) => a.posicao - b.posicao)
          .map(
            (etapa): EtapaConfigurada => ({
              ...etapa,
              canonica: ehCanonica(etapa.chave),
              leads: todos.filter((lead) => lead.etapa?.chave === etapa.chave).length,
            }),
          ),
      },
    }
  }

  /**
   * Imita a conferência de `configurar_etapas`, na ordem dela: formato de cada
   * item, chave nova, e só então as posições finais, com as das etapas que
   * ficaram de fora da lista. Nada se grava antes de tudo passar.
   */
  function conferirConfiguracao(funilId: string, etapas: readonly EtapaPedida[]) {
    if (funilId !== FUNIL_DO_DUBLE) return 'etapa-de-outra-conta' as const
    for (const etapa of etapas) {
      if (!Number.isInteger(etapa.posicao) || etapa.posicao < 0 || !etapa.rotulo.trim()) {
        return 'chave-invalida' as const
      }
      if (etapa.id !== undefined) {
        if (!etapasGuardadas.some((guardada) => guardada.id === etapa.id)) {
          return 'etapa-de-outra-conta' as const
        }
      } else {
        const chave = etapa.chave ?? ''
        if (chaveDoRotulo(chave) !== chave) return 'chave-invalida' as const
        if (etapasGuardadas.some((guardada) => guardada.chave === chave)) {
          return ehCanonica(chave) ? ('etapa-canonica' as const) : ('chave-invalida' as const)
        }
      }
    }
    const listadas = new Set(etapas.map((etapa) => etapa.id))
    const finais = [
      ...etapas.map((etapa) => etapa.posicao),
      ...etapasGuardadas.filter((etapa) => !listadas.has(etapa.id)).map((etapa) => etapa.posicao),
    ]
    if (new Set(finais).size !== finais.length) return 'posicao-duplicada' as const
    return null
  }

  /** O lote que ninguém recusou: tudo o que foi pedido foi feito. */
  function tudoFeito(ids: readonly string[]): RespostaDoLote {
    return { ok: true, resultado: { feitos: [...ids], recusados: [] } }
  }

  /**
   * A camada de dados da importação, sobre os leads que o dublê guarda. Imita
   * `registrar_lead`: o índice parcial é quem decide duplicata, e o resultado
   * (`criado`, `ignorado`, `atualizado`) sai daqui como sairia do banco.
   */
  const portaDaImportacao: PortaDeConfirmacao = {
    telefonesExistentes(_contaId, telefones) {
      const existentes = new Set(todos.map((lead) => lead.telefone))
      return Promise.resolve(
        telefones.filter((telefone) => existentes.has(telefone)),
      )
    },

    registrarLead(_contaId, lead, aoDuplicar): Promise<LeadGravado> {
      const existente = todos.find((atual) => atual.telefone === lead.phone_e164)

      if (existente) {
        // `criar` sobre telefone que a conta já tem bate no índice único, e o
        // RPC levanta em vez de tentar. A tela não oferece a opção; o dublê a
        // sustenta para o dia em que alguém a mandar por fora.
        if (aoDuplicar === 'criar') {
          return Promise.reject(new Error('duplicado_por_telefone'))
        }
        if (aoDuplicar === 'ignorar') {
          return Promise.resolve({ leadId: existente.id, resultado: 'ignorado' })
        }

        // `atualizar` é `coalesce(existente, novo)` campo a campo: o que já
        // está gravado vence o que chegou. Nada preenchido é `ignorado`, e não
        // `atualizado`, como no RPC.
        const preenchido = {
          ...existente,
          nome: existente.nome || (lead.name ?? ''),
          email: existente.email || (lead.email ?? ''),
          empresa: existente.empresa || (lead.company ?? ''),
          cidade: existente.cidade || (lead.city ?? ''),
          estado: existente.estado || (lead.state ?? ''),
        }
        const mudou = CAMPOS_PREENCHIVEIS.some(
          (campo) => preenchido[campo] !== existente[campo],
        )
        if (mudou) todos = todos.map((atual) => (atual.id === existente.id ? preenchido : atual))

        return Promise.resolve({
          leadId: existente.id,
          resultado: mudou ? 'atualizado' : 'ignorado',
        })
      }

      const id = `l-importado-${String(proximoId++)}`
      todos = [...todos, leadImportado(id, lead)]
      // O evento nasce com a linha, na mesma transação do RPC.
      eventos.push({ id, kind: 'lead_created', actor: 'user' })

      return Promise.resolve({ leadId: id, resultado: 'criado' })
    },

    registrarImportacao(leadId) {
      eventos.push({ id: leadId, kind: 'lead_imported', actor: 'user' })
      return Promise.resolve()
    },
  }

  /**
   * O pedido atravessa a borda de verdade: `atenderImportacao` é o mesmo código
   * que a função de servidor roda, com a camada de dados dublada. O que o dublê
   * substitui é a rede, e só ela — os números da prévia são os da borda.
   */
  async function pedirABorda(corpo: unknown) {
    const resposta = await atenderImportacao({ metodo: 'POST', corpo }, portaDaImportacao)
    return resposta.corpo
  }

  return {
    recortes,
    bloqueados,
    desbloqueados,
    excluidos,
    mesclagens,
    exportados,
    cadastrados,
    procurados,
    previas,
    importacoes,
    eventos,
    recortesDoFunil,
    movimentos,
    configuracoes,
    etapasApagadas,
    notas,
    fichasPedidas,

    carregarFichaDoLead(id): Promise<CargaDaFichaDoLead> {
      fichasPedidas.push(id)
      if (respostas.fichaPendente) return new Promise<CargaDaFichaDoLead>(() => {})
      if (respostas.fichaFalha) return Promise.resolve({ ok: false, motivo: 'falha-de-comunicacao' })

      const lead = todos.find((atual) => atual.id === id)
      if (!lead) return Promise.resolve({ ok: false, motivo: 'nao-encontrado' })

      // A ordem crua de chegada, de propósito: quem ordena é a tela, por
      // `montarLinhaDoTempo`, e um dublê que já entregasse ordenado esconderia
      // a falta dela.
      const eventos = [...(linhasDoTempo.get(id) ?? [])]
      const apontadas = new Set(eventos.map((evento) => evento.chamadaId))
      return Promise.resolve({
        ok: true,
        ficha: {
          id: lead.id,
          nome: lead.nome,
          telefone: lead.telefone,
          empresa: lead.empresa,
          cidade: lead.cidade,
          estado: lead.estado,
          fuso: lead.fuso ?? null,
          etapa: etapaDoLead(lead),
          temperatura: lead.temperatura,
          pontuacao: lead.pontuacao ?? null,
          bloqueio: lead.bloqueado
            ? { em: lead.ultimaAtividade ?? lead.criadoEm, motivo: lead.motivoDoBloqueio ?? null }
            : null,
          briefing: {
            dor: lead.briefing?.dor ?? null,
            fit: lead.briefing?.fit ?? null,
            objecoes: lead.briefing?.objecoes ?? null,
            proximaAcao: lead.briefing?.proximaAcao ?? null,
          },
          etapas: etapasVigentes(),
          eventos,
          ligacoes: (respostas.ligacoes ?? []).filter((ligacao) => apontadas.has(ligacao.id)),
          nomes: NOMES_DO_DUBLE,
          truncada: false,
        },
      })
    },

    /** Imita `registrar_evento_de_lead` com kind `note`: assina com a sessão. */
    registrarNota(leadId, texto): Promise<RespostaDaNota> {
      notas.push({ leadId, texto })
      if (respostas.registrarNota) return Promise.resolve(respostas.registrarNota)
      if (!todos.some((lead) => lead.id === leadId)) {
        return Promise.resolve({ ok: false, motivo: 'lead-inexistente' })
      }
      narrar(leadId, 'note', { texto: texto.trim() })
      return Promise.resolve({ ok: true })
    },

    carregarConfiguracaoDasEtapas() {
      if (respostas.configuracaoPendente) return new Promise<CargaDaConfiguracao>(() => {})
      if (respostas.configuracaoFalha) {
        return Promise.resolve({ ok: false, motivo: 'falha-de-comunicacao' })
      }
      return Promise.resolve(lerConfiguracao())
    },

    configurarEtapas(funilId, etapas): Promise<RespostaDaConfiguracao> {
      configuracoes.push({ funilId, etapas: etapas.map((etapa) => ({ ...etapa })) })
      if (respostas.configurarEtapas) return Promise.resolve(respostas.configurarEtapas)

      const recusa = conferirConfiguracao(funilId, etapas)
      if (recusa) return Promise.resolve({ ok: false, motivo: recusa })

      // A chave de quem já existe não muda, nem que a lista a traga.
      etapasGuardadas = etapasGuardadas.map((guardada) => {
        const pedida = etapas.find((etapa) => etapa.id === guardada.id)
        return pedida
          ? { ...guardada, rotulo: pedida.rotulo.trim(), posicao: pedida.posicao, cor: pedida.cor }
          : guardada
      })
      for (const etapa of etapas.filter((atual) => atual.id === undefined)) {
        etapasGuardadas.push({
          id: `e-${etapa.chave ?? ''}`,
          chave: etapa.chave ?? '',
          rotulo: etapa.rotulo.trim(),
          posicao: etapa.posicao,
          cor: etapa.cor,
        })
      }

      const relida = lerConfiguracao()
      return Promise.resolve(
        relida.ok ? relida : { ok: false, motivo: 'falha-de-comunicacao' },
      )
    },

    /** Imita `recusar_exclusao_de_etapa`: canônica não sai, e com lead também não. */
    apagarEtapa(id): Promise<RespostaDaExclusaoDeEtapa> {
      etapasApagadas.push(id)
      if (respostas.apagarEtapa) return Promise.resolve(respostas.apagarEtapa)

      const etapa = etapasGuardadas.find((atual) => atual.id === id)
      if (!etapa) return Promise.resolve({ ok: false, motivo: 'sem-permissao' })
      if (ehCanonica(etapa.chave)) return Promise.resolve({ ok: false, motivo: 'etapa-canonica' })
      if (todos.some((lead) => lead.etapa?.chave === etapa.chave)) {
        return Promise.resolve({ ok: false, motivo: 'etapa-com-leads' })
      }
      etapasGuardadas = etapasGuardadas.filter((atual) => atual.id !== id)
      return Promise.resolve({ ok: true })
    },

    /**
     * Imita `mover_lead_de_etapa`: a etapa se resolve pela chave, a mesma
     * etapa não vira segundo evento, e a mudança fica assinada por gente — é
     * o que apaga o sinal da Sarah no cartão.
     */
    moverDeEtapa(leadId, chave) {
      movimentos.push({ leadId, chave, ator: 'user' })
      if (respostas.moverDeEtapa) return Promise.resolve(respostas.moverDeEtapa)

      const lead = todos.find((atual) => atual.id === leadId)
      if (!lead) return Promise.resolve({ ok: false, motivo: 'lead-inexistente' })
      const etapa = etapasVigentes().find((atual) => atual.chave === chave)
      if (!etapa) return Promise.resolve({ ok: false, motivo: 'etapa-inexistente' })
      if (lead.etapa?.chave === chave) {
        return Promise.resolve({ ok: true, resultado: 'mesma_etapa' })
      }

      // O rótulo de então vai no payload, como `mover_lead_de_etapa` grava.
      const de = etapaDoLead(lead)
      narrar(leadId, 'stage_change', {
        de: de ? { key: de.chave, label: de.rotulo } : null,
        para: { key: etapa.chave, label: etapa.rotulo },
      })
      const agora = new Date().toISOString()
      todos = todos.map((atual) =>
        atual.id === leadId
          ? {
              ...atual,
              etapa,
              ultimaAtividade: agora,
              ultimaMudancaDeEtapa: { ator: 'user', em: agora },
            }
          : atual,
      )
      return Promise.resolve({ ok: true, resultado: 'movido' })
    },

    bloquear(ids, motivo) {
      bloqueados.push({ ids: [...ids], motivo })
      if (respostas.bloquear) return Promise.resolve(respostas.bloquear)

      todos = todos.map((lead) =>
        ids.includes(lead.id) ? { ...lead, bloqueado: true, motivoDoBloqueio: motivo } : lead,
      )
      for (const id of ids) {
        eventos.push({ id, kind: 'blocked', actor: 'user' })
        narrar(id, 'blocked', { motivo })
      }
      return Promise.resolve(tudoFeito(ids))
    },

    desbloquear(ids) {
      desbloqueados.push({ ids: [...ids] })
      if (respostas.desbloquear) return Promise.resolve(respostas.desbloquear)

      todos = todos.map((lead) =>
        ids.includes(lead.id) ? { ...lead, bloqueado: false, motivoDoBloqueio: null } : lead,
      )
      for (const id of ids) {
        eventos.push({ id, kind: 'unblocked', actor: 'user' })
        narrar(id, 'unblocked', {})
      }
      return Promise.resolve(tudoFeito(ids))
    },

    excluir(ids) {
      excluidos.push({ ids: [...ids] })
      if (respostas.excluir) return Promise.resolve(respostas.excluir)

      todos = todos.filter((lead) => !ids.includes(lead.id))
      return Promise.resolve(tudoFeito(ids))
    },

    mesclar(origem, destino) {
      mesclagens.push({ origem, destino })
      if (respostas.mesclar) return Promise.resolve(respostas.mesclar)

      // Mesclar tira a origem da lista: quem responde pelo telefone dela passa
      // a ser o destino, que é o que o `merged_into_id` faz no banco.
      todos = todos.filter((lead) => lead.id !== origem)
      return Promise.resolve({ ok: true })
    },

    exportar(recorte) {
      exportados.push(recorte)
      if (respostas.exportar) return Promise.resolve(respostas.exportar)

      const linhas = todos.filter((lead) => casa(lead, recorte))
      return Promise.resolve({
        ok: true,
        arquivo: {
          nome: 'leads-2026-09-21.csv',
          conteudo: 'nome,telefone\n',
          linhas: linhas.length,
          foraDoArquivo: 0,
        },
      })
    },

    /**
     * O funil (US-250). Monta as colunas a partir dos leads do dublê, como o
     * banco faria: sem isto, o teste do funil passaria mesmo com a consulta
     * ignorando a etapa.
     */
    async carregarFunil(recorte = {}): Promise<CargaDoFunil> {
      recortesDoFunil.push(recorte)
      if (respostas.funilPendente) return new Promise<CargaDoFunil>(() => {})
      if (respostas.funilFalha) return { ok: false, motivo: 'falha-de-comunicacao' }

      const noRecorte = todos.filter(
        (lead) =>
          casa(lead, recorte) &&
          (recorte.origem === undefined || lead.origem === recorte.origem),
      )
      const etapas = etapasVigentes()
      const colunas = etapas.map((etapa) => {
        const daEtapa = noRecorte.filter((lead) => lead.etapa?.chave === etapa.chave)
        const visiveis = daEtapa.slice(0, TETO_DA_COLUNA_DUBLADA).map(
          (lead): LeadDoFunil => ({
            ...lead,
            etapa: etapaDoLead(lead),
            pontuacao: lead.pontuacao ?? null,
            ultimaMudancaDeEtapa: lead.ultimaMudancaDeEtapa ?? null,
          }),
        )
        return {
          etapa,
          total: daEtapa.length,
          leads: visiveis,
          truncada: daEtapa.length > visiveis.length,
        }
      })

      return {
        ok: true,
        funil: {
          colunas,
          total: colunas.reduce((soma, coluna) => soma + coluna.total, 0),
          // Fora das colunas: quem não tem etapa não está no funil.
          semEtapa: noRecorte.filter((lead) => lead.etapa === null).length,
        },
      }
    },

    carregarEtapas() {
      if (respostas.carregarEtapas) {
        return Promise.resolve(respostas.carregarEtapas)
      }
      return Promise.resolve({ ok: true, etapas: etapasVigentes() })
    },

    procurarPorTelefone(e164) {
      procurados.push(e164)
      if (respostas.procurar) return Promise.resolve(respostas.procurar)

      // Procura de verdade, com o mesmo recorte do índice único: telefone
      // igual entre os leads vivos que o dublê guarda.
      const achado = todos.find((lead) => lead.telefone === e164)
      return Promise.resolve({
        ok: true,
        lead: achado
          ? {
              id: achado.id,
              nome: achado.nome,
              telefone: achado.telefone,
              empresa: achado.empresa,
            }
          : null,
      })
    },

    cadastrar(novo) {
      cadastrados.push(novo)
      if (respostas.cadastrar) return Promise.resolve(respostas.cadastrar)

      // O índice único é do banco, e o dublê o imita: telefone repetido não
      // vira segundo lead, vira a mesma recusa que `registrar_lead` levanta.
      if (todos.some((lead) => lead.telefone === novo.telefone)) {
        return Promise.resolve({ ok: false, motivo: 'duplicado' })
      }

      const id = `l-novo-${String(proximoId++)}`
      const agora = new Date().toISOString()
      todos = [
        ...todos,
        {
          id,
          nome: novo.nome,
          telefone: novo.telefone,
          email: novo.email,
          empresa: novo.empresa,
          cidade: novo.cidade,
          estado: novo.estado,
          etapa:
            etapasVigentes().find((etapa) => etapa.chave === novo.etapa) ?? null,
          temperatura: null,
          ultimaAtividade: null,
          criadoEm: agora,
          bloqueado: false,
        },
      ]
      // O evento é do RPC, não do cliente: `registrar_lead` escreve o
      // `lead_created` na mesma transação da linha. O dublê o guarda para o
      // teste poder cobrar o par sem banco.
      eventos.push({ id, kind: 'lead_created', actor: 'user' })

      return Promise.resolve({ ok: true, leadId: id })
    },

    async preverImportacao(pedido): Promise<RespostaDaPrevia> {
      previas.push(pedido)
      if (respostas.preverImportacao) return respostas.preverImportacao

      const corpo = await pedirABorda({
        acao: 'previa',
        contaId: CONTA_DO_DUBLE,
        planilha: pedido.planilha,
        mapeamento: pedido.mapeamento,
      })

      if (!corpo.ok || !corpo.previa) {
        return { ok: false, motivo: 'falha-de-comunicacao' }
      }
      return { ok: true, previa: corpo.previa, frases: corpo.frases ?? {} }
    },

    async importar(pedido): Promise<RespostaDaImportacao> {
      importacoes.push(pedido)
      if (respostas.importar) return respostas.importar

      const corpo = await pedirABorda({
        acao: 'confirmar',
        contaId: CONTA_DO_DUBLE,
        planilha: pedido.planilha,
        mapeamento: pedido.mapeamento,
        arquivo: pedido.arquivo,
        aoDuplicar: pedido.aoDuplicar,
      })

      if (!corpo.ok || !corpo.relatorio) {
        return { ok: false, motivo: 'falha-de-comunicacao' }
      }
      return { ok: true, relatorio: corpo.relatorio, frases: corpo.frases ?? {} }
    },

    listar(recorte) {
      recortes.push(recorte)
      if (respostas.listar) return Promise.resolve(respostas.listar)

      const leads = ordenar(todos.filter((lead) => casa(lead, recorte)), recorte)

      return Promise.resolve({
        ok: true,
        pagina: {
          leads,
          etapas: etapasVigentes(),
          truncada: respostas.truncada ?? false,
        },
      })
    },
  }
}

/** Os campos que `atualizar` pode preencher num lead que já existe. */
const CAMPOS_PREENCHIVEIS = [
  'nome',
  'email',
  'empresa',
  'cidade',
  'estado',
] as const satisfies readonly (keyof LeadDeExemplo)[]

/** O lead que a linha da planilha criou, na forma que a lista mostra. */
function leadImportado(id: string, lead: LeadDaLinha): LeadDeExemplo {
  return {
    id,
    nome: lead.name ?? '',
    telefone: lead.phone_e164,
    email: lead.email ?? '',
    empresa: lead.company ?? '',
    cidade: lead.city ?? '',
    estado: lead.state ?? '',
    // Importação não escolhe etapa nem temperatura: `stage_id` nasce nulo, e a
    // temperatura sai da conversa com a Sarah.
    etapa: null,
    temperatura: null,
    ultimaAtividade: null,
    criadoEm: new Date().toISOString(),
    bloqueado: false,
  }
}

function casa(lead: LeadDeExemplo, recorte: RecorteDeLeads): boolean {
  if (recorte.termo) {
    const termo = recorte.termo.toLowerCase()
    const alvo = [lead.nome, lead.telefone, lead.email]
      .join('\n')
      .toLowerCase()
    if (!alvo.includes(termo)) return false
  }
  if (recorte.etapa && lead.etapa?.chave !== recorte.etapa) return false
  if (recorte.temperatura && lead.temperatura !== recorte.temperatura) return false
  if (recorte.bloqueado !== undefined && lead.bloqueado !== recorte.bloqueado) {
    return false
  }
  if (recorte.atividadeDesde) {
    if (!lead.ultimaAtividade) return false
    if (lead.ultimaAtividade < recorte.atividadeDesde) return false
  }
  return true
}

/**
 * A origem não recorta aqui: `source` não é coluna da lista, e inventar um
 * valor para cada lead de exemplo faria o dublê afirmar sobre dado que a tela
 * não mostra. O que o teste mede é que a tela mandou `origem` no recorte.
 */
function ordenar(
  leads: LeadDeExemplo[],
  recorte: RecorteDeLeads,
): LeadDeExemplo[] {
  const ordenados = [...leads]

  if (recorte.ordenacao === 'nome') {
    return ordenados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
  if (recorte.ordenacao === 'criacao') {
    return ordenados.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }
  // Sem atividade vai para o fim, como o `nulls last` da consulta real.
  return ordenados.sort((a, b) =>
    (b.ultimaAtividade ?? '').localeCompare(a.ultimaAtividade ?? ''),
  )
}
