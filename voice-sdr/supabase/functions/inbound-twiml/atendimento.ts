// inbound-twiml: o que a linha faz com a ligação que o agente não atende
// (T-14, RF-409).
//
// O número registrado na integração nativa do provedor de voz manda **tudo**
// para o agente publicado. Os outros dois comportamentos de `phone_lines` —
// encaminhar para `forward_to` e dar o recado — não têm como existir lá dentro,
// e é por isso que esta função existe: `phone-register` aponta o webhook de voz
// da telefonia para cá quando o comportamento não é `agent`, e aqui se monta o
// documento que a operadora executa.
//
// Três decisões que o módulo carrega:
//
// 1. **A assinatura é conferida antes de ler a linha.** Quem chega aqui não
//    tem sessão: é a operadora, no meio de uma ligação. A credencial é a
//    assinatura que ela calcula sobre o pedido inteiro
//    (`_shared/telefonia/assinatura.ts`), com o Auth Token **da conta**.
//    Assinatura ausente, malformada e inválida, conta inexistente, conta sem
//    token e cofre fora do ar saem pela **mesma** porta — mesmo status, mesmo
//    corpo, mesmo tipo —, porque respostas diferentes contariam a quem tenta
//    qual das coisas ele acertou. E nenhuma delas chega a consultar o número
//    chamado: sem isso, um pedido forjado viraria uma sonda de quais números a
//    instalação atende, medida pelo tempo da resposta.
// 2. **Quem não é reconhecido ouve português, não o tom da operadora.**
//    Número desconhecido, comportamento `agent` que chegou aqui por divergência
//    de configuração, banco fora do ar: em todos, a resposta é um documento
//    válido que diz uma frase e encerra. Devolver 500 faria a operadora tocar o
//    aviso dela, que quem ligou entende como número errado.
// 3. **A fala vem de `_shared/speech/`, sempre.** O texto que sai por esta
//    função é fala da Sarah como qualquer outra, emitida pelo servidor. Frase
//    escrita aqui dentro seria a única do produto fora do lugar onde as falas
//    se revisam juntas.
//
// **Quem é o dono do token que assina.** A conta, e só ela: a telefonia é a
// Twilio que a própria conta ligou, e o token está no cofre dela
// (`telefonia`/`auth_token`, a chave que a etapa de telefonia grava). Para
// saber qual token conferir sem consultar o número, `phone-register` cadastra o
// webhook com `?conta=<id>` (`_shared/telefonia/conta-no-endereco.ts`), e a
// consulta entra na URL assinada — trocar a conta no endereço exige o token da
// outra conta para assinar. A leitura que acontece antes da validação é a do
// cofre, por id de conta, que é uuid e não se enumera; a do número continua
// depois. Validada a assinatura, a linha só atende se for **da mesma conta**:
// sem isso, quem tem o próprio token assinaria um pedido com o número de outra
// conta no corpo e ouviria o destino do encaminhamento dela.
//
// **Webhook cadastrado antes do parâmetro.** Endereço sem `conta` é conferido
// com o token da instalação (`SARAH_TELEFONIA_AUTH_TOKEN`), só quando a
// variável existir; sem ela, a ligação é recusada como qualquer outra. O
// caminho para sair disso é registrar a linha de novo, e a seção "Número que
// atende" de `supabase/CLAUDE.md` diz como.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoAtendimento`, implementada em `index.ts` e dublada no teste.

import { FALAS_DE_ATENDIMENTO_RECEBIDO } from '../_shared/speech/atendimento-recebido.ts'
import {
  conferirAssinaturaDaTelefonia,
  type ParDoCorpo,
} from '../_shared/telefonia/assinatura.ts'

import { contaDoEndereco } from '../_shared/telefonia/conta-no-endereco.ts'

import {
  documentoDeEncaminhamento,
  documentoDeEncerramento,
  TIPO_DO_DOCUMENTO,
} from './documento.ts'

/** O campo do corpo com o número que foi chamado. É a chave da linha. */
export const CAMPO_DO_NUMERO_CHAMADO = 'To'

/**
 * A mesma régua de `phone_lines.e164`, e não `_shared/telefone.ts`.
 *
 * Aquele módulo decide o que é telefone **de lead**, e para isso aplica as
 * regras do Brasil: DDD que existe, nono dígito, celular contra fixo. O número
 * chamado aqui é nosso, já vem em E.164 pela operadora, e a única régua que
 * importa é a da coluna com que ele vai ser comparado. Passá-lo pelas regras de
 * lead faria a linha internacional da conta deixar de atender.
 */
const FORMATO_E164 = /^\+[1-9][0-9]{7,14}$/

/** Os comportamentos de entrada que esta função atende. `agent` não é um deles. */
export const COMPORTAMENTOS_ATENDIDOS: ReadonlySet<string> = new Set(['forward', 'voicemail'])

/**
 * A linha chamada, com a identidade que a fala cita. Uma leitura só: o nome e a
 * empresa vêm junto porque a frase os nomeia, e uma segunda consulta no meio de
 * uma ligação é meio segundo de silêncio na linha.
 */
export interface LinhaChamada {
  readonly account_id: string
  readonly e164: string
  readonly inbound_behavior: string
  readonly forward_to: string | null
  /** `agents.name` da conta. Null quando a conta ainda não montou a Sarah. */
  readonly agent_name: string | null
  /** `agents.company_name` da conta. Null pelo mesmo motivo. */
  readonly company_name: string | null
}

/** A camada de dados. Duas leituras, e nenhuma grava. */
export interface PortaDoAtendimento {
  /**
   * O Auth Token da telefonia no cofre desta conta, ou null quando a conta não
   * existe ou não o cadastrou. É a única leitura antes da assinatura.
   */
  tokenDaConta(contaId: string): Promise<string | null>
  /** A linha da instalação com este número, ou null. */
  linhaChamada(e164: string): Promise<LinhaChamada | null>
}

export interface OpcoesDoAtendimento {
  /**
   * O token da instalação, para o webhook cadastrado antes de o endereço levar
   * a conta. Null ou vazio recusa esses pedidos: função que atende ligação sem
   * saber conferir quem a chamou é pior do que função que não atende. Endereço
   * com a conta nunca usa este token.
   */
  readonly tokenDaInstalacao: string | null
}

export interface PedidoDaBorda {
  readonly metodo: string
  /** A URL exata que a telefonia chamou. Entra no cálculo da assinatura. */
  readonly url: string
  /** Os pares do corpo do formulário, na ordem em que chegaram. */
  readonly pares: readonly ParDoCorpo[]
  /** O cabeçalho `X-Twilio-Signature`, quando houver. */
  readonly assinatura: string | null
}

export interface RespostaDoAtendimento {
  readonly status: number
  readonly tipo: string
  readonly corpo: string
}

/**
 * A recusa de assinatura, congelada.
 *
 * É **uma** constante, e não três iguais, para que a igualdade entre os três
 * casos seja estrutural em vez de coincidência que alguém desfaz ao editar uma
 * das frases. Texto puro e curto: cabeçalho e corpo aqui são para o registro da
 * operadora, não para gente.
 */
export const RECUSA_DE_ASSINATURA: RespostaDoAtendimento = Object.freeze({
  status: 401,
  tipo: 'text/plain; charset=utf-8',
  corpo: 'assinatura invalida',
})

/** Só POST. A operadora é configurada por `phone-register`, e ele configura POST. */
export const RECUSA_DE_METODO: RespostaDoAtendimento = Object.freeze({
  status: 405,
  tipo: 'text/plain; charset=utf-8',
  corpo: 'metodo nao suportado',
})

/**
 * Atende a ligação recebida. Nunca levanta: falha da camada de dados vira o
 * documento de encerramento, porque há alguém com o telefone no ouvido.
 */
export async function atenderChamadaRecebida(
  pedido: PedidoDaBorda,
  porta: PortaDoAtendimento,
  opcoes: OpcoesDoAtendimento,
): Promise<RespostaDoAtendimento> {
  if (pedido.metodo.toUpperCase() !== 'POST') return RECUSA_DE_METODO

  const conta = contaDoEndereco(pedido.url)
  if (conta.tipo === 'invalida') return RECUSA_DE_ASSINATURA

  let token: string | null
  if (conta.tipo === 'conta') {
    try {
      token = await porta.tokenDaConta(conta.contaId)
    } catch {
      // Cofre fora do ar é recusa como as outras: um documento diferente aqui
      // diria a quem tenta que a conta existe.
      return RECUSA_DE_ASSINATURA
    }
  } else {
    token = opcoes.tokenDaInstalacao
  }

  const valida = await conferirAssinaturaDaTelefonia({
    token,
    url: pedido.url,
    pares: pedido.pares,
    assinatura: pedido.assinatura,
  })
  if (!valida) return RECUSA_DE_ASSINATURA

  const chamado = valorDoCorpo(pedido.pares, CAMPO_DO_NUMERO_CHAMADO)
  if (!FORMATO_E164.test(chamado)) return encerrar(null)

  let linha: LinhaChamada | null
  try {
    linha = await porta.linhaChamada(chamado)
  } catch {
    // O banco caiu no meio de uma ligação. Quem ligou não tem nada com isso, e
    // ouve a frase em português em vez do aviso da operadora.
    return encerrar(null)
  }

  // Número de outra conta não se atende com o token desta. A frase é a de
  // número desconhecido, sem apresentar ninguém: apresentar a outra conta
  // contaria de quem é o número.
  if (linha && conta.tipo === 'conta' && linha.account_id.toLowerCase() !== conta.contaId) {
    return encerrar(null)
  }

  if (!linha || !COMPORTAMENTOS_ATENDIDOS.has(linha.inbound_behavior)) return encerrar(linha)

  if (linha.inbound_behavior === 'forward') {
    const destino = linha.forward_to?.trim() ?? ''
    // O banco já recusa `forward` sem destino, por check. A conferência aqui é
    // a rede para o dia em que alguém afrouxar a restrição: encaminhar para
    // lugar nenhum deixaria quem ligou no silêncio, que é pior do que a frase.
    if (!FORMATO_E164.test(destino)) return encerrar(linha)

    return documento(
      documentoDeEncaminhamento({
        destino,
        identificador: linha.e164,
        frases: [
          ...apresentar(linha),
          FALAS_DE_ATENDIMENTO_RECEBIDO.avisoDeEncaminhamento,
        ],
      }),
    )
  }

  return documento(
    documentoDeEncerramento([
      ...apresentar(linha),
      ...FALAS_DE_ATENDIMENTO_RECEBIDO.recadoDaLinha,
    ]),
  )
}

function documento(corpo: string): RespostaDoAtendimento {
  return { status: 200, tipo: TIPO_DO_DOCUMENTO, corpo }
}

/**
 * A apresentação da conta, quando há uma.
 *
 * Devolve lista porque a ausência é a lista vazia: sem nome ou sem empresa, a
 * fala inteira sai de cena e a seguinte assume a saudação. É o contrário de
 * limpar marcador vazio dentro da frase, e é de propósito — veja o cabeçalho de
 * `_shared/speech/atendimento-recebido.ts`.
 */
function apresentar(linha: LinhaChamada): readonly string[] {
  const nome = linha.agent_name?.trim() ?? ''
  const empresa = linha.company_name?.trim() ?? ''
  if (!nome || !empresa) return [FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade]

  return [
    interpolarFala(FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacao, {
      nome_do_agente: nome,
      empresa,
    }),
  ]
}

/** A frase de quem não foi reconhecido. A conta, quando há uma, se apresenta antes. */
function encerrar(linha: LinhaChamada | null): RespostaDoAtendimento {
  const apresentacao = linha
    ? apresentar(linha)
    : [FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade]
  return documento(
    documentoDeEncerramento([...apresentacao, FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende]),
  )
}

/** O primeiro valor deste campo no corpo, ou vazio. */
export function valorDoCorpo(pares: readonly ParDoCorpo[], nome: string): string {
  for (const [chave, valor] of pares) {
    if (chave === nome) return valor.trim()
  }
  return ''
}

const MARCADOR = /\{([a-z_]+)\}/g

/**
 * A fala com os marcadores trocados pelos valores.
 *
 * Não há limpeza de marcador vazio aqui, e a ausência é a decisão: quem chama
 * só interpola a frase quando tem todos os valores dela, e troca a frase
 * inteira quando não tem. Marcador que ninguém conhece some do mesmo jeito,
 * porque frase com `{cargo}` lido em voz alta é pior do que frase sem ele.
 */
export function interpolarFala(fala: string, valores: Readonly<Record<string, string>>): string {
  return fala.replace(MARCADOR, (_original, chave: string) => valores[chave] ?? '')
}
