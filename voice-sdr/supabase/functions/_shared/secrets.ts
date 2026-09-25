// Resolução de credencial de provedor, em um lugar só (T-12).
//
// A cascata tem três degraus, nesta ordem: o cofre da conta
// (`get_account_secret`, sobre o Vault), a configuração do recurso que vai
// usar a chave (uma linha telefônica, um agente publicado) e, por último, a
// variável de ambiente da plataforma.
//
// O último degrau é o perigoso em multiempresa: uma conta sem chave gastaria o
// crédito da plataforma e ligaria com a identidade dela, em silêncio. Por isso
// em `producao` ele só vale quando a conta declarou `credentials_mode =
// 'platform'`; em `local` e `homologacao` a cascata completa vale.
// Referência: docs/PRD-implementacao.md seção 8.
//
// O arquivo é portável de propósito: mora em `_shared/`, não cita `Deno` e não
// tem import de rede. A camada de dados entra por `PortaDeCredenciais`, que o
// `index.ts` de cada função implementa sobre o cliente do Supabase com a chave
// de serviço, e que o teste dubla. `resolveSecret` guarda o nome em inglês
// porque é o contrato nomeado no PRD de implementação.

/** Ambiente de execução. Decide se o degrau da plataforma está liberado. */
export type Ambiente = 'local' | 'homologacao' | 'producao'

/** `accounts.credentials_mode`. */
export type ModoDeCredencial = 'account' | 'platform'

/** De onde a credencial veio. Quem resolve audita com isto. */
export type OrigemDoSegredo = 'conta' | 'recurso' | 'plataforma'

/**
 * `ausente`: não há valor em degrau nenhum.
 * `plataforma_bloqueada`: a plataforma tem a chave, mas estamos em produção e a
 * conta não abriu mão de usar a própria. A tela de integrações traduz isso em
 * "cadastre a chave desta conta" em vez de ligar com a identidade errada.
 */
export type MotivoDeFalha = 'ausente' | 'plataforma_bloqueada'

export type ResolucaoDeSegredo =
  | { readonly ok: true; readonly valor: string; readonly origem: OrigemDoSegredo }
  | { readonly ok: false; readonly motivo: MotivoDeFalha }

/** O recurso que vai usar a chave, quando o degrau do meio se aplica. */
export interface RecursoDoSegredo {
  readonly tipo: string
  readonly id: string
}

/**
 * A camada de dados da resolução. `index.ts` a implementa sobre o Supabase; o
 * teste a dubla. A leitura da plataforma é síncrona porque o ambiente já está
 * em memória quando a função sobe.
 */
export interface PortaDeCredenciais {
  /** Valor no cofre da conta, por `get_account_secret`. Null quando não há. */
  segredoDaConta(contaId: string, provedor: string, chave: string): Promise<string | null>
  /** Valor gravado na configuração do recurso. Null quando não há. */
  segredoDoRecurso(
    recurso: RecursoDoSegredo,
    provedor: string,
    chave: string,
  ): Promise<string | null>
  /** Variável de ambiente da plataforma. Null quando não há. */
  segredoDaPlataforma(provedor: string, chave: string): string | null
  /** `accounts.credentials_mode`. Só é consultado quando a plataforma responderia. */
  modoDeCredencial(contaId: string): Promise<ModoDeCredencial>
}

export interface OpcoesDaResolucao {
  /** Sem recurso, o degrau do meio é pulado em vez de consultado à toa. */
  readonly recurso?: RecursoDoSegredo
}

export interface CofreDeCredenciais {
  /** Resolve a credencial da conta pela cascata, com cache de 60 segundos. */
  resolveSecret(
    contaId: string,
    provedor: string,
    chave: string,
    opcoes?: OpcoesDaResolucao,
  ): Promise<ResolucaoDeSegredo>
  /** Descarta o que estiver em cache para esta tripla, em qualquer recurso. */
  invalidar(contaId: string, provedor: string, chave: string): void
  /** Descarta tudo o que estiver em cache para a conta. */
  invalidarConta(contaId: string): void
  /** Esvazia o cache inteiro. */
  limpar(): void
}

export interface OpcoesDoCofre {
  readonly porta: PortaDeCredenciais
  readonly ambiente: Ambiente
  /** Relógio injetável: o teste avança o tempo sem esperar por ele. */
  readonly agora?: () => number
  readonly ttlMs?: number
}

/** Vida de uma entrada de cache. Curta de propósito: 60 s (T-12). */
export const TTL_PADRAO_MS = 60_000

interface EntradaDoCache {
  readonly resolucao: Promise<ResolucaoDeSegredo>
  readonly expiraEm: number
}

/**
 * Monta o resolvedor. Uma instância por processo de função: o cache vive nela,
 * e é ela que a escrita invalida.
 */
export function criarCofreDeCredenciais(opcoes: OpcoesDoCofre): CofreDeCredenciais {
  const { porta, ambiente } = opcoes
  const agora = opcoes.agora ?? Date.now
  const ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS
  const cache = new Map<string, EntradaDoCache>()

  function resolveSecret(
    contaId: string,
    provedor: string,
    chave: string,
    detalhes: OpcoesDaResolucao = {},
  ): Promise<ResolucaoDeSegredo> {
    const pedido = normalizar(contaId, provedor, chave)
    if (!pedido) return Promise.resolve(AUSENTE)

    const identidade = chaveDeCache(pedido, detalhes.recurso)
    const guardada = cache.get(identidade)
    if (guardada && guardada.expiraEm > agora()) return guardada.resolucao

    // A promessa entra no cache antes de resolver, e não depois: duas chamadas
    // concorrentes pela mesma credencial fazem uma consulta só. Se ela
    // rejeitar, a entrada sai — erro de rede não se guarda por 60 segundos.
    const resolucao = descerCascata(pedido, detalhes.recurso)
    cache.set(identidade, { resolucao, expiraEm: agora() + ttlMs })
    resolucao.catch(() => {
      if (cache.get(identidade)?.resolucao === resolucao) cache.delete(identidade)
    })

    return resolucao
  }

  async function descerCascata(
    pedido: PedidoNormalizado,
    recurso: RecursoDoSegredo | undefined,
  ): Promise<ResolucaoDeSegredo> {
    const { contaId, provedor, chave } = pedido

    const daConta = valorOuNulo(await porta.segredoDaConta(contaId, provedor, chave))
    if (daConta) return { ok: true, valor: daConta, origem: 'conta' }

    if (recurso) {
      const doRecurso = valorOuNulo(await porta.segredoDoRecurso(recurso, provedor, chave))
      // O recurso é da conta, então este degrau vale também em produção: o que
      // produção restringe é a chave da plataforma, não a da própria conta.
      if (doRecurso) return { ok: true, valor: doRecurso, origem: 'recurso' }
    }

    const daPlataforma = valorOuNulo(porta.segredoDaPlataforma(provedor, chave))
    if (!daPlataforma) return AUSENTE

    if (ambiente !== 'producao') {
      return { ok: true, valor: daPlataforma, origem: 'plataforma' }
    }

    // Em produção o modo da conta é a única coisa que libera o crédito e a
    // identidade da plataforma. Consultado só aqui, porque só aqui importa.
    const modo = await porta.modoDeCredencial(contaId)
    if (modo !== 'platform') return { ok: false, motivo: 'plataforma_bloqueada' }

    return { ok: true, valor: daPlataforma, origem: 'plataforma' }
  }

  function invalidar(contaId: string, provedor: string, chave: string): void {
    const pedido = normalizar(contaId, provedor, chave)
    if (!pedido) return
    const prefixo = prefixoDaTripla(pedido)
    for (const identidade of cache.keys()) {
      if (identidade.startsWith(prefixo)) cache.delete(identidade)
    }
  }

  function invalidarConta(contaId: string): void {
    const prefixo = `${parte(contaId.trim())}|`
    for (const identidade of cache.keys()) {
      if (identidade.startsWith(prefixo)) cache.delete(identidade)
    }
  }

  return { resolveSecret, invalidar, invalidarConta, limpar: () => cache.clear() }
}

const AUSENTE = { ok: false, motivo: 'ausente' } as const

interface PedidoNormalizado {
  readonly contaId: string
  readonly provedor: string
  readonly chave: string
}

/**
 * Provedor e chave descem em minúsculas, como a tabela os guarda: 'ElevenLabs'
 * e 'elevenlabs' são a mesma credencial, e precisam ser a mesma entrada de
 * cache. Pedido sem conta, sem provedor ou sem chave é erro de quem chamou e
 * não vira consulta.
 */
function normalizar(contaId: string, provedor: string, chave: string): PedidoNormalizado | null {
  const pedido = {
    contaId: contaId.trim(),
    provedor: provedor.trim().toLowerCase(),
    chave: chave.trim().toLowerCase(),
  }
  if (!pedido.contaId || !pedido.provedor || !pedido.chave) return null
  return pedido
}

function chaveDeCache(pedido: PedidoNormalizado, recurso: RecursoDoSegredo | undefined): string {
  const alvo = recurso ? `${parte(recurso.tipo)}:${parte(recurso.id)}` : ''
  return `${prefixoDaTripla(pedido)}${alvo}`
}

function prefixoDaTripla(pedido: PedidoNormalizado): string {
  return `${parte(pedido.contaId)}|${parte(pedido.provedor)}|${parte(pedido.chave)}|`
}

/** `|` e `:` separam os campos da chave de cache, então não podem aparecer neles. */
function parte(valor: string): string {
  return encodeURIComponent(valor)
}

/** Valor em branco é ausência: uma variável vazia não é credencial. */
function valorOuNulo(valor: string | null | undefined): string | null {
  const limpo = valor?.trim() ?? ''
  return limpo || null
}

/**
 * Lê o ambiente declarado. Valor ausente ou desconhecido vira `producao`, que é
 * o mais restritivo: um deploy que esqueceu a variável não deve ganhar a
 * cascata completa por descuido.
 */
export function lerAmbiente(valor: string | null | undefined): Ambiente {
  switch (valor?.trim().toLowerCase()) {
    case 'local':
    case 'development':
    case 'desenvolvimento':
      return 'local'
    case 'homologacao':
    case 'homologação':
    case 'staging':
      return 'homologacao'
    default:
      return 'producao'
  }
}

/**
 * Nome da variável de plataforma de um par provedor/chave:
 * `elevenlabs` + `api_key` vira `SARAH_ELEVENLABS_API_KEY`. Uma convenção só,
 * para o degrau da plataforma não virar um mapa escrito à mão por função.
 */
export function nomeDaVariavelDaPlataforma(provedor: string, chave: string): string {
  return ['SARAH', normalizarNome(provedor), normalizarNome(chave)]
    .filter((pedaco) => pedaco !== '')
    .join('_')
}

function normalizarNome(valor: string): string {
  return valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Leitor do degrau da plataforma sobre um mapa de variáveis. Recebe o mapa em
 * vez de ler o ambiente sozinho: quem tem `Deno.env` é o `index.ts`.
 */
export function criarLeitorDaPlataforma(
  ambienteDoProcesso: Readonly<Record<string, string | undefined>>,
): (provedor: string, chave: string) => string | null {
  return (provedor, chave) => valorOuNulo(ambienteDoProcesso[nomeDaVariavelDaPlataforma(provedor, chave)])
}
