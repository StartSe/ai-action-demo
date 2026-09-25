// O esqueleto comum das ferramentas do agente: o contrato da seção 5 do PRD de
// implementação escrito uma vez.
//
// `criarFerramenta({ nome, propositos, executar })` devolve o tratador da
// ferramenta, e o tratador faz sempre, nesta ordem:
//
//   1. confere `x-tool-secret` (`./segredo.ts`, T-18, R-07);
//   2. resolve `x-conversation-id` contra `calls.provider_conversation_id`,
//      dentro da conta que o segredo provou;
//   3. confere que a ferramenta existe no propósito da chamada (T-01);
//   4. confere os campos obrigatórios da entrada;
//   5. executa, dentro do orçamento de tempo (P-01): primeiro `ler`, depois,
//      fora do ensaio, `efeitos`;
//   6. grava em `call_tool_invocations`.
//
// Cada ferramenta nova é só o passo 5. Autenticação, resolução da chamada,
// frase pronta e registro nascem com ela.
//
// **Modo ensaio (T-16).** O executor declara leitura e efeito separados:
// `executar: { ler, efeitos }`. `ler` consulta o que precisar e decide a
// resposta inteira, `data` e `speech`; `efeitos` faz no mundo o que a leitura
// decidiu (bloquear o número, abrir o item da fila, marcar a reunião). Quando a
// chamada é `rehearsal`, o esqueleto não chama `efeitos`, e é o único lugar que
// decide isso: nenhuma ferramenta tem um `if (ensaio)` próprio. Como a resposta
// sai de `ler`, o ensaio responde exatamente o que a ligação responderia, que é
// o que ele existe para provar. A única diferença possível é a falha do efeito,
// que na ligação vira frase de contorno e no ensaio não acontece.
//
// **Memória da conversa não é efeito.** O que a ligação precisa lembrar entre
// uma ferramenta e a seguinte — as ofertas de `tool-availability`, que
// `tool-book-meeting` resolve por posição — não é ato no mundo: não marca
// reunião, não escreve em calendário, não manda e-mail. T-16 lista o que o
// ensaio pula, e isso não está na lista. Sem a oferta gravada, o ensaio da
// marcação não teria o que marcar e nunca passaria de "deixa eu olhar a agenda
// de novo". Por isso o executor pode declarar `memoria`, que roda depois da
// conferência da fala e antes de `efeitos`, **nos dois modos**. Só o que a
// próxima ferramenta da mesma chamada lê entra ali.
//
// **Efeito que decide a resposta.** Há ferramenta cujo desfecho só existe
// depois de agir: `tool-book-meeting` só sabe se o horário foi tomado quando o
// insert da reunião volta com o código do RPC. Para ela, `efeitos` pode
// devolver um `ResultadoDoEfeito`, que substitui a resposta de `ler` e passa
// pelas mesmas conferências de fala. `ler` continua decidindo a resposta do
// caminho feliz, que é o que o ensaio devolve: o ensaio responde como a ligação
// responderia se ninguém tivesse tomado o horário no meio.
//
// Para `ler` não escrever escondido, o esqueleto a chama com a porta de
// escrita trocada por um dublê que levanta exceção em qualquer acesso: a
// ferramenta que escreve na leitura cai na frase de contorno em toda chamada,
// real ou ensaio, e o erro registrado diz `escrita_na_leitura`. Por isso a
// escrita chega pelo contexto (`AmbienteDaFerramenta.escrita`), nunca por
// fechamento no módulo da ferramenta.
//
// O que o modo ensaio ainda não cobre: as ferramentas de agenda
// (`tool-availability`, `tool-book-meeting`, `tool-confirm-meeting`,
// `tool-reschedule`) e a de qualificação (`tool-qualify`), que são F4 e F5. O
// contrato já vale para elas quando entrarem: marcar reunião é `efeitos`,
// consultar horário é `ler`. O teste do esqueleto prova a regra com uma
// ferramenta de mentira, sem antecipar a fatia.
//
// **Resposta.** Sempre `{ ok, data, speech }`, com o `speech` pronto em
// português, na voz da Sarah (`../speech/ferramentas.ts`). O que não é sucesso
// não é erro técnico: falha do executor e prazo estourado respondem 200 com
// `ok: false` e a frase de contorno, porque o provedor lê a fala e silêncio na
// linha faz o interlocutor desligar. Os status de recusa (400, 401, 404, 409)
// ficam para o que não é a ligação conversando: pedido malformado, segredo
// errado, conversa de outra conta.
//
// **Nenhum identificador transita pela conversa (T-09).** A chamada chega por
// cabeçalho e o `speech` nunca carrega `call_id`, `account_id` nem `lead_id`: o
// esqueleto confere a fala do executor atrás dos três e de qualquer uuid, e a
// troca pela frase de contorno se achar. Pedir a um modelo que memorize 36
// caracteres é garantir defeito; deixar a fala de uma ferramenta ditar um é o
// mesmo defeito pelo outro lado.
//
// **Por que a conta vem antes da conversa.** O segredo é `HMAC(chave, conta)`,
// e HMAC não se inverte: conferir é recalcular para cada candidata. As
// candidatas vêm de `contasCandidatas()`, que o `index.ts` serve de cache, e a
// conversa só é procurada dentro da conta provada. Assim quem não tem segredo
// não descobre se uma conversa existe (401 antes de qualquer leitura por
// conversa), e quem tem o segredo de uma conta recebe 404 pela conversa de
// outra — a mesma resposta de conversa que não existe em lugar nenhum.
//
// **O que não vira linha em `call_tool_invocations`.** A tabela exige `call_id`
// e `account_id`, então 401 e 404 não têm onde ser gravados: vão para o `log`.
// Todo o resto grava, inclusive recusa por propósito, campo faltante, falha e
// prazo. E falha ao gravar não derruba a resposta: vira entrada de `log` e a
// ferramenta responde do mesmo jeito, porque a ligação está no ar e o registro
// não é mais importante do que ela.
//
// **Tempo por parâmetro.** `agora` mede a latência e carimba `at`; `esperar`
// arma o prazo. Os dois têm padrão (`Date.now` e `setTimeout`) e o teste passa
// os seus, sem timer falso e sem espera.
//
// Módulo portável: sem `Deno`, sem import de rede, sem banco. A camada de dados
// entra por `PortaDeFerramentas`, que o `index.ts` de cada ferramenta implementa
// sobre o cliente do Supabase com a chave de serviço, como `PortaDeConvites` em
// `invite-accept`.

import { CATALOGO_DE_FERRAMENTAS, PRAZO_DE_FERRAMENTA_SEGUNDOS } from '../agente/compilador.ts'
import type { Proposito } from '../playbook/camada-um.ts'
import { FALAS_DAS_FERRAMENTAS } from '../speech/ferramentas.ts'

import { conferirSegredo, type ChavesDoServidor } from './segredo.ts'

/** O cabeçalho que identifica a ligação (P-11). */
export const CABECALHO_DA_CONVERSA = 'x-conversation-id'

/** As sete ferramentas nossas, com os nomes do check de `call_tool_invocations.tool`. */
export type NomeDaFerramenta =
  | 'tool-availability'
  | 'tool-book-meeting'
  | 'tool-confirm-meeting'
  | 'tool-reschedule'
  | 'tool-qualify'
  | 'tool-transfer'
  | 'tool-dnc'

/**
 * O orçamento do executor, em milissegundos. A publicação declara
 * `response_timeout_secs` de 5 s (P-01); o orçamento fica um segundo abaixo,
 * porque depois do executor ainda vem a gravação do registro e a volta pela
 * rede, e resposta que chega depois do corte do provedor é resposta nenhuma. O
 * alvo de 2 s no p95 é medição do degrau 3, não trava daqui.
 */
export const ORCAMENTO_PADRAO_MS = PRAZO_DE_FERRAMENTA_SEGUNDOS * 1000 - 1000

/** A chamada, na parte que o esqueleto e o executor usam. */
export interface ChamadaDaFerramenta {
  readonly id: string
  readonly account_id: string
  readonly purpose: string
  /** `outbound`, `inbound` ou `rehearsal`. O esqueleto decide o ensaio por aqui. */
  readonly direction: string
  readonly lead_id: string | null
}

/** Uma linha de `call_tool_invocations`, com as chaves da tabela. */
export interface InvocacaoParaRegistro {
  readonly account_id: string
  readonly call_id: string
  readonly tool: NomeDaFerramenta
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly latency_ms: number
  readonly error: string | null
  readonly at: string
}

/**
 * A camada de dados do esqueleto. O `index.ts` de cada ferramenta a implementa
 * sobre o cliente do Supabase com a chave de serviço; o teste a dubla.
 */
export interface PortaDeFerramentas {
  /**
   * As contas que o segredo pode provar. O `index.ts` serve de cache: é isto
   * que deixa o cabeçalho autenticar sem uma leitura por invocação.
   */
  contasCandidatas(): Promise<Iterable<string>>
  /** A chamada desta conversa, **desta conta**. Nula quando não há. */
  chamadaDaConversa(contaId: string, conversaId: string): Promise<ChamadaDaFerramenta | null>
  registrarInvocacao(invocacao: InvocacaoParaRegistro): Promise<void>
}

/** Um campo que a ferramenta exige, com a chave do provedor e o nome falado. */
export interface CampoObrigatorio {
  /** A chave como o modelo a manda, igual à declarada na publicação. */
  readonly chave: string
  /** O nome em português, que a resposta 400 devolve. */
  readonly nome: string
}

/** A direção da chamada de ensaio (`calls.direction`). */
export const DIRECAO_DE_ENSAIO = 'rehearsal'

export interface ContextoDoExecutor<E = unknown> {
  readonly contaId: string
  readonly chamada: ChamadaDaFerramenta
  readonly entrada: Readonly<Record<string, unknown>>
  readonly agora: () => number
  /** A chamada é ensaio. Informativo: quem pula `efeitos` é o esqueleto. */
  readonly ensaio: boolean
  /**
   * A porta de escrita da ferramenta. Em `efeitos`, a de verdade; em `ler`, um
   * dublê que levanta `EscritaNaLeitura` em qualquer acesso.
   */
  readonly escrita: E
}

/** O que a leitura devolve. `ok` ausente é sucesso. */
export interface ResultadoDoExecutor<P = unknown> {
  readonly ok?: boolean
  readonly data: Readonly<Record<string, unknown>> | null
  readonly speech: string
  /** O que registrar em `error` quando `ok` é falso por decisão da ferramenta. */
  readonly erro?: string
  /** O que `efeitos` precisa para agir. Não vai na resposta. */
  readonly plano?: P
}

/**
 * O que `efeitos` devolve quando a resposta depende do que ele fez. Substitui
 * `data`, `speech`, `ok` e `erro` da leitura; ausente, vale a leitura.
 */
export interface ResultadoDoEfeito {
  readonly ok?: boolean
  readonly data: Readonly<Record<string, unknown>> | null
  readonly speech: string
  readonly erro?: string
}

export interface ExecutorDaFerramenta<E = unknown, P = unknown> {
  /** Decide a resposta. Não escreve: a porta de escrita aqui é um dublê que levanta. */
  ler(contexto: ContextoDoExecutor<E>): Promise<ResultadoDoExecutor<P>>
  /**
   * Faz no mundo o que a leitura decidiu. Nunca é chamado em ensaio, e só é
   * chamado depois que a fala da leitura passou pelas conferências do
   * esqueleto. Recebe a leitura inteira e decide sozinho se uma recusa
   * (`ok: false`) também tem efeito. Falha aqui vira a frase de contorno.
   * Devolvendo um `ResultadoDoEfeito`, troca a resposta da leitura por ele.
   */
  /**
   * Grava o que a conversa precisa lembrar para a ferramenta seguinte. Roda
   * também no ensaio, depois das conferências da fala e antes de `efeitos`.
   * Falha aqui vira a frase de contorno.
   */
  memoria?(contexto: ContextoDoExecutor<E>, leitura: ResultadoDoExecutor<P>): Promise<void>
  efeitos?(
    contexto: ContextoDoExecutor<E>,
    leitura: ResultadoDoExecutor<P>,
  ): Promise<ResultadoDoEfeito | void>
}

export interface DefinicaoDeFerramenta<E = unknown, P = unknown> {
  readonly nome: NomeDaFerramenta
  readonly propositos: readonly Proposito[]
  readonly obrigatorios?: readonly CampoObrigatorio[]
  readonly executar: ExecutorDaFerramenta<E, P>
}

/** O que o dublê da escrita levanta quando `ler` tenta usá-la. */
export class EscritaNaLeitura extends Error {
  constructor(membro: string) {
    super(`a leitura tocou a porta de escrita: ${membro}`)
    this.name = 'EscritaNaLeitura'
  }
}

/**
 * A porta de escrita que `ler` recebe: qualquer acesso levanta, e não só a
 * chamada, para que nem guardar a função para depois funcione. Exportada para
 * `execucao-direta.ts`, que roda o mesmo executor sem pedido HTTP.
 */
export function escritaQueLevanta<E>(): E {
  const levantar = (membro: PropertyKey): never => {
    throw new EscritaNaLeitura(String(membro))
  }
  return new Proxy(
    {},
    {
      get: (_alvo, membro) => levantar(membro),
      set: (_alvo, membro) => levantar(membro),
      has: (_alvo, membro) => levantar(membro),
      apply: () => levantar('chamada'),
    },
  ) as E
}

/** O pedido como o `index.ts` o lê da requisição. */
export interface PedidoDeFerramenta {
  readonly metodo: string
  /** Valor de `x-tool-secret`. */
  readonly segredo: string | null
  /** Valor de `x-conversation-id`. */
  readonly conversa: string | null
  /** O corpo já parseado. Nulo quando não era JSON. */
  readonly corpo: unknown
}

export interface AmbienteDaFerramenta<E = unknown> {
  readonly porta: PortaDeFerramentas
  /** A porta de escrita que `efeitos` recebe. O `index.ts` a monta. */
  readonly escrita: E
  readonly chaves: ChavesDoServidor
  readonly agora?: () => number
  /** Resolve depois de `ms`. Padrão `setTimeout`. */
  readonly esperar?: (ms: number) => Promise<void>
  readonly orcamentoMs?: number
  /** Para onde vai o que não tem linha na tabela. Padrão `console.error`. */
  readonly log?: (evento: string, detalhe: Readonly<Record<string, unknown>>) => void
}

export interface CorpoDaFerramenta {
  readonly ok: boolean
  readonly data: Readonly<Record<string, unknown>> | null
  readonly speech: string
}

export interface RespostaDaFerramenta {
  readonly status: number
  readonly corpo: CorpoDaFerramenta
}

export type TratadorDeFerramenta<E = unknown> = (
  pedido: PedidoDeFerramenta,
  ambiente: AmbienteDaFerramenta<E>,
) => Promise<RespostaDaFerramenta>

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const ESTOUROU: unique symbol = Symbol('estourou')

/** O executor não chegou a uma resposta; o texto vai para `error`. */
interface Recusa {
  readonly erro: string
}

/** O executor respondeu; `erroRegistrado` é o `error` da linha. */
interface Concluida {
  readonly saida: RespostaDaFerramenta
  readonly erroRegistrado: string | null
}

function esperarPadrao(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

function logPadrao(evento: string, detalhe: Readonly<Record<string, unknown>>): void {
  console.error(`[ferramenta] ${evento}`, detalhe)
}

function resposta(
  status: number,
  ok: boolean,
  data: Readonly<Record<string, unknown>> | null,
  speech: string,
): RespostaDaFerramenta {
  return { status, corpo: { ok, data, speech } }
}

const FALHA = (): RespostaDaFerramenta => resposta(200, false, null, FALAS_DAS_FERRAMENTAS.falha)

function comoObjeto(corpo: unknown): Readonly<Record<string, unknown>> {
  return typeof corpo === 'object' && corpo !== null && !Array.isArray(corpo)
    ? (corpo as Record<string, unknown>)
    : {}
}

function preenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false
  return typeof valor !== 'string' || valor.trim() !== ''
}

/** A fala cita algum identificador da chamada, ou qualquer uuid? */
function falaComIdentificador(fala: string, chamada: ChamadaDaFerramenta): boolean {
  if (UUID.test(fala)) return true
  const ids = [chamada.id, chamada.account_id, chamada.lead_id].filter(
    (id): id is string => typeof id === 'string' && id !== '',
  )
  return ids.some((id) => fala.includes(id))
}

function mensagemDe(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  return texto.trim() === '' ? 'sem mensagem' : texto.trim()
}

/**
 * Monta o tratador de uma ferramenta. Confere na criação que o nome e os
 * propósitos batem com o catálogo que a publicação usa: ferramenta que o
 * esqueleto aceitasse num propósito em que o agente não a tem seria a segunda
 * linha de T-01 desmentindo a primeira.
 */
export function criarFerramenta<E, P = unknown>(
  definicao: DefinicaoDeFerramenta<E, P>,
): TratadorDeFerramenta<E> {
  const doCatalogo = CATALOGO_DE_FERRAMENTAS.find((item) => item.nome === definicao.nome)
  if (doCatalogo === undefined) {
    throw new Error(`Ferramenta fora do catálogo: ${definicao.nome}`)
  }
  const esperados = [...doCatalogo.propositos].sort()
  const declarados = [...new Set(definicao.propositos)].sort()
  if (esperados.join(',') !== declarados.join(',')) {
    throw new Error(
      `Os propósitos de ${definicao.nome} divergem do catálogo: ${declarados.join(', ')} contra ${esperados.join(', ')}`,
    )
  }
  const propositos: ReadonlySet<string> = new Set(declarados)
  const obrigatorios = definicao.obrigatorios ?? []

  return async function tratar(pedido, ambiente) {
    const agora = ambiente.agora ?? Date.now
    const esperar = ambiente.esperar ?? esperarPadrao
    const orcamento = ambiente.orcamentoMs ?? ORCAMENTO_PADRAO_MS
    const log = ambiente.log ?? logPadrao
    const inicio = agora()

    if (pedido.metodo !== 'POST') {
      return resposta(405, false, null, FALAS_DAS_FERRAMENTAS.falha)
    }

    // 1. O segredo, antes de qualquer leitura por conversa.
    const conferencia = await conferirSegredo({
      cabecalho: pedido.segredo,
      chaves: ambiente.chaves,
      contas: await ambiente.porta.contasCandidatas(),
      agora,
    })
    if (!conferencia.ok) {
      log('segredo_recusado', { ferramenta: definicao.nome, motivo: conferencia.motivo })
      return resposta(401, false, null, FALAS_DAS_FERRAMENTAS.falha)
    }
    const contaId = conferencia.contaId
    if (conferencia.chave === 'anterior') {
      // R-07: a rotação só termina quando ninguém mais usa a chave velha.
      log('segredo_da_chave_anterior', { ferramenta: definicao.nome, contaId })
    }

    // 2. A chamada, dentro da conta provada.
    const conversa = (pedido.conversa ?? '').trim()
    const chamada =
      conversa === '' ? null : await ambiente.porta.chamadaDaConversa(contaId, conversa)
    if (chamada === null || chamada.account_id !== contaId) {
      log('conversa_nao_encontrada', { ferramenta: definicao.nome })
      return resposta(404, false, null, FALAS_DAS_FERRAMENTAS.falha)
    }

    const entrada = comoObjeto(pedido.corpo)
    const registrar = async (saida: RespostaDaFerramenta, erro: string | null) => {
      try {
        await ambiente.porta.registrarInvocacao({
          account_id: contaId,
          call_id: chamada.id,
          tool: definicao.nome,
          request: entrada,
          response: { ...saida.corpo },
          latency_ms: Math.max(0, Math.round(agora() - inicio)),
          error: erro,
          at: new Date(inicio).toISOString(),
        })
      } catch (falha) {
        log('registro_falhou', {
          ferramenta: definicao.nome,
          chamadaId: chamada.id,
          erro: mensagemDe(falha),
        })
      }
      return saida
    }

    // 3. O propósito: segunda linha da garantia da publicação (T-01).
    if (!propositos.has(chamada.purpose)) {
      return registrar(
        resposta(409, false, null, FALAS_DAS_FERRAMENTAS.propositoErrado),
        `proposito_errado: ${chamada.purpose}`,
      )
    }

    // 4. Os campos obrigatórios, nomeados em português.
    const faltando = obrigatorios.find((campo) => !preenchido(entrada[campo.chave]))
    if (faltando !== undefined) {
      return registrar(
        resposta(400, false, { campo: faltando.nome, chave: faltando.chave }, FALAS_DAS_FERRAMENTAS.campoFaltando),
        `campo_faltando: ${faltando.chave}`,
      )
    }

    // 5. O executor, dentro do orçamento: a leitura decide, o efeito age, e o
    // ensaio não age (T-16).
    const ensaio = chamada.direction === DIRECAO_DE_ENSAIO
    const base = { contaId, chamada, entrada, agora, ensaio }
    const executar = async (): Promise<Concluida | Recusa> => {
      let leitura: ResultadoDoExecutor<P>
      try {
        leitura = await definicao.executar.ler({ ...base, escrita: escritaQueLevanta<E>() })
      } catch (falha) {
        return falha instanceof EscritaNaLeitura
          ? { erro: `escrita_na_leitura: ${mensagemDe(falha)}` }
          : { erro: `falha_do_executor: ${mensagemDe(falha)}` }
      }

      const conferirFala = (bruta: unknown): string | Recusa => {
        const fala = typeof bruta === 'string' ? bruta.trim() : ''
        if (fala === '') return { erro: 'fala_vazia' }
        if (falaComIdentificador(fala, chamada)) return { erro: 'identificador_na_fala' }
        return fala
      }

      let final: ResultadoDoEfeito = leitura
      let fala = conferirFala(leitura.speech)
      if (typeof fala !== 'string') return fala

      if (definicao.executar.memoria !== undefined) {
        try {
          await definicao.executar.memoria({ ...base, escrita: ambiente.escrita }, leitura)
        } catch (falha) {
          return { erro: `falha_da_memoria: ${mensagemDe(falha)}` }
        }
      }

      if (!ensaio && definicao.executar.efeitos !== undefined) {
        try {
          const doEfeito = await definicao.executar.efeitos({ ...base, escrita: ambiente.escrita }, leitura)
          if (doEfeito) final = doEfeito
        } catch (falha) {
          return { erro: `falha_do_efeito: ${mensagemDe(falha)}` }
        }
        if (final !== leitura) {
          fala = conferirFala(final.speech)
          if (typeof fala !== 'string') return fala
        }
      }

      const ok = final.ok ?? true
      const erro = ok ? null : (final.erro?.trim() || 'recusa_da_ferramenta')
      return { saida: resposta(200, ok, final.data ?? null, fala), erroRegistrado: erro }
    }

    const execucao = executar()
    // O executor que perde a corrida continua rodando; a rejeição dele depois
    // do prazo não pode virar rejeição sem tratamento no isolado.
    execucao.catch(() => undefined)
    const resultado = await Promise.race([
      execucao,
      esperar(orcamento).then((): typeof ESTOUROU => ESTOUROU),
    ])
    if (resultado === ESTOUROU) {
      return registrar(FALHA(), `prazo_estourado: ${orcamento} ms`)
    }
    if ('erro' in resultado) {
      return registrar(FALHA(), resultado.erro)
    }
    return registrar(resultado.saida, resultado.erroRegistrado)
  }
}
