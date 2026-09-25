// voice-catalog: as vozes em português e a amostra da **primeira fala real**
// da conta (RF-302, RF-303, RF-304).
//
// A decisão que dá forma a este arquivo é a de RF-304, e ela é contraintuitiva
// o bastante para estar escrita: **a audição não usa frase de catálogo**. O
// provedor já devolve uma prévia pronta por voz, e usá-la seria uma linha de
// código; só que ouvir "a raposa marrom salta sobre o cão" não diz nada sobre
// como "Oi, Marcos? Aqui é a Sarah, da Vexo" vai soar — e é essa segunda coisa
// que quem configura precisa julgar antes de publicar. Então a amostra é a
// primeira fala da conta, interpolada, sintetizada com os ajustes que a tela
// está experimentando naquele instante.
//
// Quatro decisões mais, e as quatro estão nos testes:
//
// 1. **Marcador sem valor vira o lead da semente, nunca o nome da variável.**
//    `{nome_do_lead}` na abertura não pode ser lido em voz alta como "abre
//    chaves nome do lead": vira Marcos Ferreira, da Fluxo Cargo, que é o
//    cenário de demonstração do produto inteiro (docs/padrao-de-interface.md
//    seção 5). Marcador que ninguém conhece some da frase em vez de ser falado.
// 2. **Os quatro estados da F0 valem aqui.** `conectado`, `nao_configurado`
//    (falta chave), `erro` (a chave foi recusada) e `indisponivel` (o provedor
//    não respondeu). Juntar os dois últimos joga em quem administra um problema
//    que não é dele.
// 3. **O catálogo tem cache de 60 s por conta; a amostra não tem cache
//    nenhum.** A lista de vozes não muda a cada clique, e a amostra muda a cada
//    ajuste de velocidade — é justamente o que se está experimentando. O cache
//    é por conta porque a chave é da conta: a lista que uma conta enxerga é a
//    biblioteca dela no provedor, com as vozes clonadas dela dentro.
// 4. **Amostra que não sai não derruba a lista.** Sem primeira fala escrita,
//    sem a voz pedida no catálogo, provedor recusando a síntese: em todos, a
//    lista responde e a pendência da amostra viaja ao lado, com a frase do que
//    fazer. Recusar o pedido inteiro esconderia as vozes de quem abriu a tela
//    para ver as vozes.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoCatalogo`, implementada em `index.ts` e dublada no teste.

import {
  LEAD_DE_EXEMPLO,
  MARCADORES_DA_PRIMEIRA_FALA,
  interpolarPrimeiraFala as interpolar,
} from '../_shared/agente/primeira-fala.ts'
import { eFalhaDoProvedor, traduzirErroDoProvedor } from '../_shared/provedor/erros.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  AJUSTES_DE_VOZ,
  ajustePorNome,
  corpoDaAmostra,
  eEmPortugues,
  lerAjustesGravados,
  lerCatalogoDoProvedor,
  type CorpoDaAmostra,
  type GeneroDaVoz,
  type NomeDeAjuste,
  type VozDoProvedor,
} from './formato-do-provedor.ts'
import {
  MENSAGENS,
  MENSAGENS_DA_AMOSTRA,
  MENSAGENS_DA_AUSENCIA,
  STATUS,
  type MotivoDaAmostra,
  type MotivoDaAusencia,
  type MotivoLocal,
} from './respostas.ts'

/** O provedor de voz, como `integrations-status/provedores.ts` o nomeia. */
export const PROVEDOR_DE_VOZ = 'voz'

/** A chave dele no cofre. */
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/** Vida do catálogo em cache. Curta, como a do cofre de credenciais (T-12). */
export const TTL_DO_CATALOGO_MS = 60_000

// O lead da semente e a interpolação moram em `_shared/agente/primeira-fala.ts`
// desde que a tela de identidade passou a mostrar a prévia da abertura: a
// amostra que se ouve aqui e a prévia que se lê lá precisam ser o mesmo texto.
export { LEAD_DE_EXEMPLO }

/** Os quatro estados do vocabulário da F0, iguais aos de `integrations-status`. */
export type EstadoDoCatalogo = 'conectado' | 'nao_configurado' | 'erro' | 'indisponivel'

export interface UsuarioDaSessao {
  readonly id: string
}

/** A identidade da Sarah, no recorte que a amostra precisa. */
export interface AgenteDaConta {
  readonly name: string
  readonly company_name: string
  readonly never_claim: readonly string[]
  readonly voice_settings: Readonly<Record<string, unknown>>
  readonly first_message: string | null
}

/** O que o provedor respondeu ao pedido do catálogo. Nunca levanta. */
export interface RespostaDaLista {
  readonly ok: boolean
  /** A resposta crua, lida por `formato-do-provedor.ts`. */
  readonly vozes?: unknown
  /** Código do provedor. Lido aqui e descartado: não sai no corpo. */
  readonly codigo?: string | null
  readonly status?: number | null
}

/** O pedido de amostra, já montado. O teste mede este objeto (o som é do CI). */
export interface PedidoDeAmostra {
  readonly contaId: string
  readonly vozId: string
  /** A primeira fala da conta, já interpolada. É o que a voz vai dizer. */
  readonly texto: string
  /** Os ajustes aplicados, com os nossos nomes. */
  readonly ajustes: Readonly<Record<NomeDeAjuste, number>>
  /** O mesmo pedido com os nomes do provedor. */
  readonly corpo: CorpoDaAmostra
  /** A chave do provedor, já resolvida pela cascata. Não sai daqui. */
  readonly credencial: string
}

/** O que o provedor devolveu da síntese. Nunca levanta. */
export interface RespostaDaAmostra {
  readonly ok: boolean
  readonly audioBase64?: string | null
  readonly formato?: string | null
  readonly codigo?: string | null
  readonly status?: number | null
}

/**
 * A camada de dados, em cinco operações. `index.ts` a implementa sobre o
 * cliente do Supabase e sobre a API do provedor; o teste a dubla.
 */
export interface PortaDoCatalogo {
  /** Usuário dono deste JWT, ou null quando o token não vale mais. */
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Papel do usuário na conta, ou null quando ele não é membro dela. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** A Sarah da conta, ou null enquanto ela não existir. */
  agenteDaConta(contaId: string): Promise<AgenteDaConta | null>
  /** Cascata de `_shared/secrets.ts`. Nunca resolvida à mão nesta função. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  listarVozes(contaId: string, credencial: string): Promise<RespostaDaLista>
  sintetizarAmostra(pedido: PedidoDeAmostra): Promise<RespostaDaAmostra>
}

/** Um ajuste como a tela o desenha. Sem o nome do campo no provedor. */
export interface AjusteAceito {
  readonly nome: NomeDeAjuste
  readonly rotulo: string
  readonly explicacao: string
  readonly minimo: number
  readonly maximo: number
  readonly padrao: number
  readonly passo: number
}

export interface VozDoCatalogo {
  readonly id: string
  readonly nome: string
  readonly genero: GeneroDaVoz
  readonly sotaque: string | null
  readonly descricao: string | null
  /** A prévia do provedor. Serve de atalho; quem decide é a amostra. */
  readonly previa: string | null
  /** As configurações aceitas, com faixa e padrão (RF-303). */
  readonly ajustesAceitos: readonly AjusteAceito[]
}

export interface AmostraDaPrimeiraFala {
  readonly vozId: string
  /** A primeira fala da conta, interpolada. Vai na resposta para a tela mostrar. */
  readonly texto: string
  readonly ajustes: Readonly<Record<NomeDeAjuste, number>>
  readonly formato: string
  readonly audioBase64: string
}

export interface PendenciaDaAmostra {
  readonly motivo: MotivoDaAmostra
  readonly mensagem: string
}

export interface FalhaDoCatalogo {
  readonly motivo: string
  readonly mensagem: string
}

export interface CorpoDoCatalogo {
  readonly ok: true
  readonly contaId: string
  readonly consultadoEm: string
  readonly estado: EstadoDoCatalogo
  readonly vozes: readonly VozDoCatalogo[]
  /**
   * Quantas vozes o provedor devolveu e o filtro deixou de fora. Uma lista
   * vazia com este número em 42 é "o provedor respondeu, mas nenhuma voz dele
   * declara português"; com zero é "a biblioteca desta conta está vazia". São
   * problemas diferentes e o suporte precisa distingui-los sem abrir o painel.
   */
  readonly vozesIgnoradas: number
  /** O catálogo veio do cache desta borda, sem ida ao provedor. */
  readonly doCache: boolean
  readonly amostra: AmostraDaPrimeiraFala | null
  readonly pendenciaDaAmostra: PendenciaDaAmostra | null
  readonly erro: FalhaDoCatalogo | null
}

export interface CorpoDeRecusa {
  readonly ok: false
  readonly motivo: MotivoLocal
  readonly mensagem: string
}

export interface RespostaDoCatalogo {
  readonly status: number
  readonly corpo: CorpoDoCatalogo | CorpoDeRecusa
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly contaId: unknown
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
  /** A voz a ouvir. Ausente significa listar sem sintetizar nada. */
  readonly vozId?: unknown
  /** Velocidade e estabilidade em experimentação, como a tela os tem (RF-303). */
  readonly ajustes?: unknown
}

export interface OpcoesDoCatalogo {
  readonly porta: PortaDoCatalogo
  /** Relógio injetável, em milissegundos: o teste avança o tempo do cache. */
  readonly agora?: () => number
  /** Instante da resposta. Injetável pela mesma razão. */
  readonly instante?: () => Date
  readonly ttlMs?: number
}

export interface CatalogoDeVozes {
  atender(pedido: PedidoDaBorda): Promise<RespostaDoCatalogo>
  /** Descarta o catálogo em cache de uma conta. */
  invalidar(contaId: string): void
  /** Esvazia o cache inteiro. */
  limpar(): void
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i
const METODOS = new Set(['GET', 'POST'])

/** O que o catálogo guarda por conta enquanto o TTL não vence. */
interface ListaLida {
  readonly vozes: readonly VozDoCatalogo[]
  readonly vozesIgnoradas: number
  readonly emPortugues: ReadonlySet<string>
}

interface EntradaDoCache {
  readonly lista: Promise<ListaLida>
  readonly expiraEm: number
}

/** Erro interno com motivo próprio, para a recusa sair com a frase certa. */
class RecusaDoPedido extends Error {
  readonly motivo: MotivoLocal

  constructor(motivo: MotivoLocal) {
    super(motivo)
    this.motivo = motivo
  }
}

/** Falha do provedor ao listar. Vira estado, não recusa. */
class FalhaDaLista extends Error {
  readonly estado: EstadoDoCatalogo
  readonly falha: FalhaDoCatalogo

  constructor(estado: EstadoDoCatalogo, falha: FalhaDoCatalogo) {
    super(falha.motivo)
    this.estado = estado
    this.falha = falha
  }
}

/**
 * Monta o catálogo. Uma instância por processo de função: o cache vive nela, e
 * é por isso que ele não é um `Map` de módulo — dois testes na mesma suíte
 * herdariam o catálogo um do outro.
 */
export function criarCatalogoDeVozes(opcoes: OpcoesDoCatalogo): CatalogoDeVozes {
  const { porta } = opcoes
  const agora = opcoes.agora ?? Date.now
  const instante = opcoes.instante ?? (() => new Date())
  const ttlMs = opcoes.ttlMs ?? TTL_DO_CATALOGO_MS
  const cache = new Map<string, EntradaDoCache>()

  async function atender(pedido: PedidoDaBorda): Promise<RespostaDoCatalogo> {
    if (!METODOS.has(pedido.metodo.toUpperCase())) return recusa('metodo_invalido')

    const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
    if (!contaId) return recusa('conta_ausente')

    const jwt = extrairJwt(pedido.autorizacao)
    if (!jwt) return recusa('sem_sessao')

    try {
      const usuario = await porta.usuarioDaSessao(jwt)
      if (!usuario) return recusa('sessao_invalida')

      // Membro, qualquer papel: ouvir a voz é leitura. Trocar a voz da conta é
      // escrita, e quem a barra é a política de `agents`, não esta função.
      const papel = await porta.papelNaConta(contaId, usuario.id)
      if (!papel) return recusa('sem_acesso')

      return await responder(contaId, pedido)
    } catch (erro) {
      if (erro instanceof RecusaDoPedido) return recusa(erro.motivo)
      return recusa('falha_interna')
    }
  }

  async function responder(contaId: string, pedido: PedidoDaBorda): Promise<RespostaDoCatalogo> {
    const resolucao = await porta.credencial(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
    if (!resolucao.ok) {
      const motivo: MotivoDaAusencia =
        resolucao.motivo === 'plataforma_bloqueada' ? 'plataforma_bloqueada' : 'sem_chave'
      return semCatalogo(contaId, 'nao_configurado', {
        motivo,
        mensagem: MENSAGENS_DA_AUSENCIA[motivo],
      })
    }

    const credencial = resolucao.valor
    const vozPedida = typeof pedido.vozId === 'string' ? pedido.vozId.trim() : ''

    let lista: ListaLida
    let doCache: boolean
    try {
      const busca = buscarLista(contaId, credencial)
      doCache = busca.doCache
      lista = await busca.lista
    } catch (erro) {
      if (erro instanceof FalhaDaLista) return semCatalogo(contaId, erro.estado, erro.falha)
      throw erro
    }

    const { amostra, pendencia } = vozPedida
      ? await ouvirAbertura(contaId, vozPedida, pedido.ajustes, lista, credencial)
      : { amostra: null, pendencia: null }

    const corpo: CorpoDoCatalogo = {
      ok: true,
      contaId,
      consultadoEm: instante().toISOString(),
      estado: 'conectado',
      vozes: lista.vozes,
      vozesIgnoradas: lista.vozesIgnoradas,
      doCache,
      amostra,
      pendenciaDaAmostra: pendencia,
      erro: null,
    }

    // A conferência da US-013: a chave é resolvida aqui, entregue ao provedor e
    // descartada. Um nome de voz que ecoasse parte dela bastaria para furar a
    // regra em silêncio, e aí o pedido inteiro vira `falha_interna`.
    conferirQueNaoVazou(corpo, [credencial], 'o catálogo de vozes carregava o valor de uma credencial')
    return { status: 200, corpo }
  }

  /**
   * O catálogo desta conta, do cache ou do provedor.
   *
   * A promessa entra no cache antes de resolver: dois cliques ao mesmo tempo
   * fazem uma consulta só. Falha **não** fica guardada — catálogo indisponível
   * cacheado por um minuto transformaria "tente de novo" em um minuto de
   * mentira.
   */
  function buscarLista(
    contaId: string,
    credencial: string,
  ): { readonly lista: Promise<ListaLida>; readonly doCache: boolean } {
    const guardada = cache.get(contaId)
    if (guardada && guardada.expiraEm > agora()) return { lista: guardada.lista, doCache: true }

    const lista = consultarProvedor(contaId, credencial)
    cache.set(contaId, { lista, expiraEm: agora() + ttlMs })
    lista.catch(() => {
      if (cache.get(contaId)?.lista === lista) cache.delete(contaId)
    })

    return { lista, doCache: false }
  }

  async function consultarProvedor(contaId: string, credencial: string): Promise<ListaLida> {
    const resposta = await listarComSeguranca(() => porta.listarVozes(contaId, credencial))
    if (!resposta.ok) {
      const { motivo, mensagem } = traduzirErroDoProvedor(resposta.codigo, resposta.status)
      throw new FalhaDaLista(eFalhaDoProvedor(motivo) ? 'indisponivel' : 'erro', {
        motivo,
        mensagem,
      })
    }

    const { recebidas, vozes } = lerCatalogoDoProvedor(resposta.vozes)
    const emPortugues = vozes.filter(eEmPortugues)
    return {
      vozes: emPortugues.map(paraOCatalogo),
      // Sobre o que o provedor mandou, e não sobre o que deu para ler: a voz
      // ilegível também some da tela, e some sem ninguém ficar sabendo.
      vozesIgnoradas: recebidas - emPortugues.length,
      emPortugues: new Set(emPortugues.map((voz) => voz.id)),
    }
  }

  async function ouvirAbertura(
    contaId: string,
    vozId: string,
    ajustesPedidos: unknown,
    lista: ListaLida,
    credencial: string,
  ): Promise<{
    readonly amostra: AmostraDaPrimeiraFala | null
    readonly pendencia: PendenciaDaAmostra | null
  }> {
    // A voz é conferida contra a lista em português, e não contra o catálogo
    // inteiro: o que a tela oferece é o que ela pode ouvir.
    if (!lista.emPortugues.has(vozId)) return { amostra: null, pendencia: pendente('voz_desconhecida') }

    const agente = await porta.agenteDaConta(contaId)
    if (!agente) return { amostra: null, pendencia: pendente('sem_agente') }

    const primeiraFala = agente.first_message?.trim() ?? ''
    if (!primeiraFala) return { amostra: null, pendencia: pendente('sem_primeira_fala') }

    const texto = interpolarPrimeiraFala(primeiraFala, agente)
    const ajustes = resolverAjustes(ajustesPedidos, agente.voice_settings)

    const resposta = await sintetizarComSeguranca(() =>
      porta.sintetizarAmostra({
        contaId,
        vozId,
        texto,
        ajustes,
        corpo: corpoDaAmostra(texto, ajustes),
        credencial,
      }),
    )

    if (!resposta.ok || !resposta.audioBase64) {
      const { motivo } = traduzirErroDoProvedor(resposta.codigo, resposta.status)
      return {
        amostra: null,
        pendencia: pendente(
          eFalhaDoProvedor(motivo) ? 'provedor_indisponivel' : 'provedor_recusou',
        ),
      }
    }

    return {
      amostra: {
        vozId,
        texto,
        ajustes,
        formato: resposta.formato?.trim() || 'audio/mpeg',
        audioBase64: resposta.audioBase64,
      },
      pendencia: null,
    }
  }

  function semCatalogo(
    contaId: string,
    estado: EstadoDoCatalogo,
    erro: FalhaDoCatalogo,
  ): RespostaDoCatalogo {
    return {
      // 200 e não 5xx: o pedido foi atendido, e o estado do provedor é o
      // relatório. É a mesma resposta de `integrations-status`, e é o que
      // permite à tela desenhar o cartão de "cadastre a chave" em vez de um
      // erro genérico.
      status: 200,
      corpo: {
        ok: true,
        contaId,
        consultadoEm: instante().toISOString(),
        estado,
        vozes: [],
        vozesIgnoradas: 0,
        doCache: false,
        amostra: null,
        // Sem catálogo não há pendência de amostra: repetir o motivo em dois
        // campos faria a tela escolher qual dos dois mostrar.
        pendenciaDaAmostra: null,
        erro,
      },
    }
  }

  return {
    atender,
    invalidar: (contaId) => void cache.delete(contaId.trim()),
    limpar: () => cache.clear(),
  }
}

/** O JWT do cabeçalho `Authorization: Bearer <jwt>`, ou null. */
export function extrairJwt(autorizacao: string | null): string | null {
  const achado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  return achado?.[1]?.trim() || null
}

/**
 * A primeira fala com todos os marcadores resolvidos (RF-304), na forma que
 * esta borda conhece o agente.
 *
 * A regra mora em `_shared/agente/primeira-fala.ts`: a prévia que a tela de
 * identidade mostra enquanto se escreve e a amostra que se ouve aqui saem do
 * mesmo lugar, senão quem configura leria uma abertura e ouviria outra.
 */
export function interpolarPrimeiraFala(
  primeiraFala: string,
  agente: Pick<AgenteDaConta, 'name' | 'company_name' | 'never_claim'>,
): string {
  return interpolar(primeiraFala, {
    nome: agente.name,
    empresa: agente.company_name,
    nuncaAfirmar: agente.never_claim,
  })
}

/** Os marcadores que a amostra sabe preencher. A lista sai de quem publica. */
export const MARCADORES_DA_AMOSTRA: readonly string[] = MARCADORES_DA_PRIMEIRA_FALA

/**
 * Os ajustes que vão para a amostra: o que a tela está experimentando, o que a
 * conta já gravou e, por último, o padrão do provedor.
 *
 * Valor fora da faixa é **aparado**, não recusado: o controle da tela é um
 * cursor, e recusar o pedido inteiro por causa de um centésimo fora do limite
 * trocaria a audição por uma mensagem de erro. O que se aplicou volta na
 * resposta, dentro da amostra, para o que se ouviu e o que a tela mostra serem
 * a mesma coisa.
 */
export function resolverAjustes(
  pedidos: unknown,
  gravados: Readonly<Record<string, unknown>>,
): Readonly<Record<NomeDeAjuste, number>> {
  const daConta = lerAjustesGravados(gravados)
  const daTela = objetoDoPedido(pedidos)

  const resolvidos = {} as Record<NomeDeAjuste, number>
  for (const ajuste of AJUSTES_DE_VOZ) {
    const pedido = daTela[ajuste.nome]
    const escolhido =
      typeof pedido === 'number' && Number.isFinite(pedido)
        ? pedido
        : (daConta[ajuste.nome] ?? ajuste.padrao)
    resolvidos[ajuste.nome] = Math.min(ajuste.maximo, Math.max(ajuste.minimo, escolhido))
  }
  return resolvidos
}

/** Os ajustes do corpo do pedido, só os nomes que existem e só números. */
function objetoDoPedido(pedidos: unknown): Partial<Record<NomeDeAjuste, number>> {
  if (typeof pedidos !== 'object' || pedidos === null) return {}

  const lidos: Partial<Record<NomeDeAjuste, number>> = {}
  for (const [chave, valor] of Object.entries(pedidos as Record<string, unknown>)) {
    const ajuste = ajustePorNome(chave)
    if (!ajuste) continue
    const numero = typeof valor === 'string' ? Number(valor) : valor
    if (typeof numero === 'number' && Number.isFinite(numero)) lidos[ajuste.nome] = numero
  }
  return lidos
}

/**
 * A voz como a tela a recebe. Os ajustes aceitos vão por voz, e o padrão de
 * cada um é o que o provedor declarou para **aquela** voz quando declarou algo:
 * uma voz que nasce com estabilidade 0,8 deve abrir o controle em 0,8, senão a
 * primeira audição soa diferente da voz que se escolheu.
 */
function paraOCatalogo(voz: VozDoProvedor): VozDoCatalogo {
  return {
    id: voz.id,
    nome: voz.nome,
    genero: voz.genero,
    sotaque: voz.sotaque,
    descricao: voz.descricao,
    previa: voz.previa,
    ajustesAceitos: AJUSTES_DE_VOZ.map((ajuste) => ({
      nome: ajuste.nome,
      rotulo: ajuste.rotulo,
      explicacao: ajuste.explicacao,
      minimo: ajuste.minimo,
      maximo: ajuste.maximo,
      padrao: voz.ajustesGravados[ajuste.nome] ?? ajuste.padrao,
      passo: ajuste.passo,
    })),
  }
}

/**
 * As duas idas ao provedor não podem levantar: exceção de rede vira falha com
 * código de tempo esgotado, que `erros.ts` reduz a `indisponivel` — e não a
 * `erro`, que mandaria alguém conferir uma chave que está boa.
 */
async function listarComSeguranca(chamada: () => Promise<RespostaDaLista>): Promise<RespostaDaLista> {
  try {
    return await chamada()
  } catch {
    return { ok: false, codigo: 'timeout' }
  }
}

async function sintetizarComSeguranca(
  chamada: () => Promise<RespostaDaAmostra>,
): Promise<RespostaDaAmostra> {
  try {
    return await chamada()
  } catch {
    return { ok: false, codigo: 'timeout' }
  }
}

function pendente(motivo: MotivoDaAmostra): PendenciaDaAmostra {
  return { motivo, mensagem: MENSAGENS_DA_AMOSTRA[motivo] }
}

function recusa(motivo: MotivoLocal): RespostaDoCatalogo {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
