// lead-intake: o endereço público de entrada de leads, um por conta (RF-107).
//
// O cliente aponta o formulário do site (ou a integração dele) para este
// endereço e manda o lead. Não há sessão: quem autentica é a chave da conta, no
// cabeçalho `x-intake-key`, e o banco guarda só o `sha256` dela em
// `accounts.intake_key_hash` (US-028). A borda recalcula o hash, resolve a conta
// por ele, normaliza o telefone, resolve cidade, estado e fuso pelo DDD (RF-109)
// e grava chamando `registrar_lead`, que é o caminho único de escrita de lead.
//
// Quatro decisões o estruturam.
//
// 1. **A chave é segredo de portador, e o 401 é um só.** Chave ausente,
//    malformada e desconhecida devolvem o mesmo status, o mesmo motivo e a
//    mesma frase. Distinguir "não existe" de "não é desta conta" entrega a quem
//    tenta chaves a notícia de que uma delas chegou perto. E a conferência final
//    do hash é em tempo constante (`chaveConfereComOHash`), pela mesma razão.
// 2. **O limite de taxa é por conta e vem depois da autenticação.** É o que
//    L-02 pede: o endereço dispara ligação, e chave vazada sem limite é fatura.
//    Vir depois da chave significa que quem chega sem chave não consome cota de
//    conta nenhuma — e também que o caminho do 401 não é limitado aqui; conter
//    enxurrada sem chave é do gateway, não desta função.
// 3. **O telefone é normalizado antes de o banco ver.** `_shared/telefone.ts` é
//    o único lugar que decide o que é telefone válido, porque duas normalizações
//    em dois caminhos são duplicata gravada. O banco confere o formato e recusa;
//    ele não adivinha.
// 4. **Duplicata preenche o que está vazio.** `p_ao_duplicar` é `atualizar`, e
//    não `ignorar` como na importação: quem preenche o formulário duas vezes
//    costuma preencher mais campos na segunda, e `registrar_lead` só preenche
//    coluna vazia e nunca apaga. `criar` está fora — o formulário do site não
//    tem como decidir que dois telefones iguais são duas pessoas.
//
// **Enfileirar em `dial_queue` não entra aqui.** O critério comercial de RF-107
// é o lead receber ligação em segundos, e RF-610 diz que a conta configura essa
// janela. Na F1, `dial_queue` e `cron-speed-to-lead` ainda não existiam, e
// escrever numa tabela que não existe não é adiantamento, é código morto que
// passa a mentir sobre o que a função faz. A F2 fechou o par sem mexer aqui:
// quem enfileira é a rotina `cron-speed-to-lead`
// (`supabase/functions/cron-speed-to-lead/enfileiramento.ts`), que lê os leads
// com `source = 'intake'` a cada minuto. O lead gravado e a ligação
// enfileirada são efeitos diferentes, e falhar em enfileirar não pode desfazer
// o lead nem obrigar esta função a escolher entre responder erro com o lead já
// gravado e esconder a falha. Por isso `ORIGEM` é contrato: a rotina filtra
// por ele.
//
// **Os 2 s do critério de aceite não se medem aqui.** O que este arquivo
// controla é a parte portável — hash, normalização, DDD, montagem do lead —, e é
// isso que o teste mede, com orçamento de 50 ms. Os 2 s de ponta a ponta
// envolvem rede, o runtime Deno acordando o isolado e o Postgres real; a medição
// é do degrau 3 e está na tabela de dívidas de docs/PRD-implementacao.md seção 9.1.
//
// Tudo neste arquivo é portável: nenhuma referência a `Deno`, nenhum import de
// rede. A camada de dados entra por `PortaDeEntrada`, e o adaptador sobre o
// Supabase está em `index.ts`.

import { chaveConfereComOHash, hashDaChaveDeEntrada } from '../_shared/chave-de-entrada.ts'
import { resolverFusoDoTelefone, type LocalDoDdd } from '../_shared/ddd.ts'
import { normalizarTelefone } from '../_shared/telefone.ts'

import type { LimiteDeTaxa } from './limite-de-taxa.ts'
import {
  MENSAGENS,
  MENSAGENS_DO_TELEFONE,
  STATUS,
  type MotivoDaEntrada,
  type MotivoRecusado,
} from './respostas.ts'

/** O cabeçalho que carrega a chave. Em cabeçalho, e não na URL, de propósito:
 * caminho de URL entra em log de servidor, em histórico de navegador e no
 * `Referer` da página seguinte, e a chave é segredo de portador. */
export const CABECALHO_DA_CHAVE = 'x-intake-key'

/**
 * O formato da chave, para recusar lixo sem consultar o banco. É o alfabeto do
 * base64url que `gerarChaveDeEntrada` produz, com folga no comprimento para
 * chave girada com outra medida de entropia continuar entrando.
 */
const FORMATO_DA_CHAVE = /^[A-Za-z0-9_-]{32,256}$/

/** `source` de todo lead que entra por aqui. A coluna distingue os caminhos. */
export const ORIGEM = 'intake'

/** A conta que a chave resolveu, com o hash guardado para a conferência. */
export interface ContaDeEntrada {
  readonly id: string
  /** O valor de `accounts.intake_key_hash`, como está no banco. */
  readonly intakeKeyHash: string
}

/** O lead que vai para `registrar_lead`, com as chaves de `public.leads`. */
export interface LeadDaEntrada {
  readonly name: string | null
  readonly phone_e164: string
  readonly email: string | null
  readonly company: string | null
  readonly city: string | null
  readonly state: string | null
  readonly timezone: string | null
  readonly source: string
  readonly source_ref: string | null
}

/** O que `registrar_lead` devolveu. Código, nunca frase. */
export interface LeadGravado {
  readonly leadId: string
  readonly resultado: 'criado' | 'ignorado' | 'atualizado'
}

/**
 * A camada de dados, em duas operações. O teste a dubla com um `Proxy` que
 * registra todo membro tocado; `index.ts` a implementa sobre o cliente do
 * Supabase com a chave de serviço, porque aqui não há sessão nenhuma.
 */
export interface PortaDeEntrada {
  /** A conta cujo `intake_key_hash` é este, ou null. Uma consulta por pedido. */
  contaPorHashDaChave(hash: string): Promise<ContaDeEntrada | null>
  /** Chama `registrar_lead` com `p_ao_duplicar = 'atualizar'`. */
  registrarLead(contaId: string, lead: LeadDaEntrada): Promise<LeadGravado>
}

export interface PedidoDeEntrada {
  readonly metodo: string
  /** O cabeçalho `x-intake-key`, como chegou. */
  readonly chave: string | null
  /** O corpo JSON já parseado, ou null quando não havia corpo legível. */
  readonly corpo: unknown
}

/** O que a resposta conta sobre o lead. Nada além do que quem enviou mandou. */
export interface LeadDaResposta {
  readonly id: string
  readonly telefone: string
  readonly cidade: string | null
  readonly estado: string | null
  readonly fuso: string | null
}

export interface CorpoDaEntrada {
  readonly ok: boolean
  readonly motivo: MotivoDaEntrada
  readonly mensagem: string
  readonly lead?: LeadDaResposta
}

export interface RespostaDeEntrada {
  readonly status: number
  readonly corpo: CorpoDaEntrada
  /** Cabeçalhos que só alguns desfechos têm, como o `Retry-After` do 429. */
  readonly cabecalhos: Readonly<Record<string, string>>
}

/**
 * Apelidos aceitos em cada campo do corpo. O formulário de um cliente tem os
 * nomes que quem o escreveu deu, e metade da web escreve `name` e a outra
 * metade escreve `nome`; recusar um dos dois seria pedir ao cliente que mudasse
 * o formulário para o nosso gosto. A comparação é pela chave em minúsculas e
 * sem espaço em volta.
 *
 * Chave que não casa com nada é ignorada e não é erro: formulário manda
 * `utm_source`, `g-recaptcha-response` e o nome do botão junto, e recusar por
 * isso seria recusar todo formulário real.
 */
const APELIDOS = {
  nome: ['nome', 'name', 'fullname', 'full_name'],
  telefone: ['telefone', 'phone', 'phone_e164', 'celular', 'whatsapp', 'tel'],
  email: ['email', 'e-mail', 'e_mail', 'mail'],
  empresa: ['empresa', 'company', 'organizacao', 'organization'],
  cidade: ['cidade', 'city'],
  estado: ['estado', 'state', 'uf'],
  origem: ['origem', 'source'],
  referencia: ['referencia', 'source_ref', 'ref', 'form_id'],
} as const satisfies Record<string, readonly string[]>

type CampoDaEntrada = keyof typeof APELIDOS

/**
 * Resolve o pedido inteiro. Devolve sempre status, corpo em português e
 * cabeçalhos, e nunca levanta: exceção da camada de dados vira `falha_interna`,
 * porque quem integra precisa de uma frase e de um status, não de um stack
 * trace — e porque a mensagem crua do Postgres não sai da borda.
 */
export async function receberLead(
  pedido: PedidoDeEntrada,
  porta: PortaDeEntrada,
  limite: LimiteDeTaxa,
): Promise<RespostaDeEntrada> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const chave = (pedido.chave ?? '').trim()
  // Formato errado morre antes do banco. A diferença de tempo entre isto e uma
  // chave bem formada porém desconhecida não conta nada sobre conta nenhuma: o
  // que precisa ser indistinguível é conta que existe de conta que não existe.
  if (!FORMATO_DA_CHAVE.test(chave)) return recusa('chave_invalida')

  try {
    const hash = await hashDaChaveDeEntrada(chave)
    const conta = await porta.contaPorHashDaChave(hash)
    if (conta === null) return recusa('chave_invalida')
    if (!chaveConfereComOHash(hash, conta.intakeKeyHash)) return recusa('chave_invalida')

    const decisao = limite.registrar(conta.id)
    if (!decisao.permitido) {
      return recusa('limite_excedido', { 'retry-after': String(decisao.esperarSegundos) })
    }

    const campos = lerCampos(pedido.corpo)
    if (campos === null) return recusa('corpo_invalido')

    const telefone = normalizarTelefone(campos.telefone)
    if (!telefone.ok) {
      // O código do defeito fica aqui: sai a frase dele, sob o motivo da borda.
      return {
        status: STATUS.telefone_invalido,
        corpo: {
          ok: false,
          motivo: 'telefone_invalido',
          mensagem: MENSAGENS_DO_TELEFONE[telefone.motivo],
        },
        cabecalhos: {},
      }
    }

    const local = resolverFusoDoTelefone(telefone.e164)
    const lead = montarLead(campos, telefone.e164, local)
    const gravado = await porta.registrarLead(conta.id, lead)

    return {
      status: STATUS[MOTIVO_DO_RESULTADO[gravado.resultado]],
      corpo: {
        ok: true,
        motivo: MOTIVO_DO_RESULTADO[gravado.resultado],
        mensagem: MENSAGENS[MOTIVO_DO_RESULTADO[gravado.resultado]],
        lead: {
          id: gravado.leadId,
          telefone: lead.phone_e164,
          cidade: lead.city,
          estado: lead.state,
          fuso: lead.timezone,
        },
      },
      cabecalhos: {},
    }
  } catch {
    // Qualquer código que `registrar_lead` levante daqui é bug nosso, não coisa
    // que quem integra possa corrigir: `sem_permissao` não acontece sem sessão,
    // `etapa_invalida` não acontece sem `stage_id`, `duplicado_por_telefone` não
    // acontece com `atualizar` e `telefone_invalido` só se a normalização tiver
    // produzido algo fora de E.164. Por isso é um 500 com frase, e não seis
    // motivos que mandariam o cliente mexer no formulário à toa.
    return recusa('falha_interna')
  }
}

/** Resultado do banco para motivo da resposta. */
const MOTIVO_DO_RESULTADO: Record<LeadGravado['resultado'], MotivoDaEntrada> = {
  criado: 'lead_criado',
  ignorado: 'lead_conhecido',
  atualizado: 'lead_atualizado',
}

type CamposDaEntrada = Readonly<Record<CampoDaEntrada, string | null>>

/**
 * Os campos do corpo, resolvidos pelos apelidos. `null` quando o corpo não é um
 * objeto JSON — array, número e `null` cabem em JSON válido e não são lead.
 *
 * Valor que não é texto nem número é descartado como ausente: objeto aninhado e
 * lista chegam de formulário com campo de múltipla escolha, e não há coluna
 * nenhuma em `public.leads` que os receba.
 */
function lerCampos(corpo: unknown): CamposDaEntrada | null {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) return null

  const porChave = new Map<string, string>()
  for (const [chave, valor] of Object.entries(corpo)) {
    const texto = textoDoValor(valor)
    if (texto === null) continue
    const normalizada = chave.trim().toLowerCase()
    // A primeira ocorrência vence: `{ nome: 'Ana', name: '' }` já caiu fora do
    // laço no `textoDoValor`, e duas escritas com valor não têm ordem melhor.
    if (!porChave.has(normalizada)) porChave.set(normalizada, texto)
  }

  const campos = {} as Record<CampoDaEntrada, string | null>
  for (const campo of Object.keys(APELIDOS) as CampoDaEntrada[]) {
    const apelidos: readonly string[] = APELIDOS[campo]
    let achado: string | null = null
    for (const apelido of apelidos) {
      const valor = porChave.get(apelido)
      if (valor !== undefined) {
        achado = valor
        break
      }
    }
    campos[campo] = achado
  }
  return campos
}

/** Texto útil do valor, ou `null` quando não há o que aproveitar. */
function textoDoValor(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null
  // Número chega de formulário que declarou o campo como numérico. Booleano e
  // objeto não: `true` não é nome de ninguém.
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return null
}

/**
 * O lead que vai para o banco. Cidade e estado do formulário vencem os do DDD,
 * como na importação — quem preencheu sabe onde está melhor do que a sede da
 * região de numeração sabe. O fuso é sempre do DDD (RF-109), porque formulário
 * não traz fuso, e é ele que decide a que hora a Sarah pode ligar.
 */
function montarLead(
  campos: CamposDaEntrada,
  e164: string,
  local: LocalDoDdd | null,
): LeadDaEntrada {
  return {
    name: campos.nome,
    phone_e164: e164,
    email: campos.email,
    company: campos.empresa,
    city: campos.cidade ?? local?.cidade ?? null,
    state: campos.estado ?? local?.estado ?? null,
    timezone: local?.fuso ?? null,
    // `source` diz por qual caminho o lead entrou e é sempre `intake`; o que o
    // formulário chamou de origem é mais específico e vai em `source_ref`, ao
    // lado do identificador do formulário. Deixar o cliente escrever em `source`
    // faria a coluna deixar de distinguir os caminhos de entrada.
    source: ORIGEM,
    source_ref: campos.referencia ?? campos.origem,
  }
}

function recusa(
  motivo: MotivoRecusado,
  cabecalhos: Readonly<Record<string, string>> = {},
): RespostaDeEntrada {
  return {
    status: STATUS[motivo],
    corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] },
    cabecalhos,
  }
}
