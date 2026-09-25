// leads-import, etapa da prévia: dizer o que a planilha vai fazer, antes de
// fazer (RF-104).
//
// Quem importa uma lista comprada não confia nela, e tem razão: metade das
// planilhas de prospecção traz telefone truncado, DDD que não existe e o mesmo
// contato repetido três vezes. A decisão de gravar ou não é de quem importa, e
// para tomá-la a pessoa precisa dos números na frente — quantas linhas entram,
// quantas estão erradas, quantas já existem. Este módulo produz esses números
// **sem escrever nada**: a única coisa que ele pede ao banco é a lista de
// telefones que a conta já tem.
//
// Três regras dão forma ao arquivo:
//
// 1. **Nenhuma frase, só código.** `ddd_invalido` é o que sai daqui; "o DDD 23
//    não existe" é da interface (`app/src/copy/`) e da resposta da função. É a
//    mesma regra de `_shared/telefone.ts` e de `invite-accept`: a decisão é de
//    quem decide, a frase é de quem exibe.
// 2. **Duplicado tem dois tipos e eles não se somam na tela.**
//    `duplicado_no_arquivo` é erro de quem montou a planilha e se resolve
//    editando o arquivo; `duplicado_na_base` é trabalho já feito e o operador
//    escolhe entre ignorar, atualizar ou criar (RF-103). Juntar os dois num
//    número só esconde qual das duas coisas está acontecendo.
// 3. **Uma linha cai em exatamente uma situação.** Inválida não é contada como
//    duplicada, e duplicada não é contada como válida: os três números somam o
//    total de linhas, que é o que permite conferir a prévia de cabeça.
//
// Módulo portável: sem `Deno`, sem import de rede. O adaptador que implementa
// `PortaDeImportacao` sobre o cliente do Supabase fica em `index.ts`.

import { resolverFusoDoTelefone, type LocalDoDdd } from '../_shared/ddd.ts'
import { normalizarTelefone, type MotivoDeRecusa } from '../_shared/telefone.ts'

/** Os campos do lead que a planilha sabe preencher (RF-101). */
export const CAMPOS_DO_LEAD = [
  'nome',
  'telefone',
  'email',
  'empresa',
  'cidade',
  'estado',
  'origem',
] as const

export type CampoDoLead = (typeof CAMPOS_DO_LEAD)[number]

/**
 * Escolha de coluna feita por quem importa, que vence o palpite automático.
 * `null` é escolha também: "esta planilha não tem esse campo".
 */
export type MapeamentoDeColunas = Readonly<Partial<Record<CampoDoLead, string | null>>>

/** O mapeamento depois de resolvido: todo campo presente, com coluna ou sem. */
export type MapeamentoResolvido = Readonly<Record<CampoDoLead, string | null>>

/**
 * Uma linha de dados já separada em células.
 *
 * O número da linha vem de quem leu o arquivo, e não é derivado do índice de
 * propósito: célula entre aspas pode conter quebra de linha, e aí a terceira
 * linha de dados não é a quarta linha do arquivo. Quem erra esse número manda
 * o operador procurar o problema na linha errada, que é o oposto do que o
 * relatório existe para fazer (RF-105).
 */
export interface LinhaLida {
  /** Número da linha no arquivo, como o operador a vê. O cabeçalho é 1. */
  readonly numero: number
  /** Valor de cada célula, pela chave do cabeçalho. */
  readonly celulas: Readonly<Record<string, string>>
}

/** A planilha já parseada: o cabeçalho e as linhas de dados. */
export interface PlanilhaLida {
  readonly colunas: readonly string[]
  readonly linhas: readonly LinhaLida[]
}

/**
 * Por que a linha não entra. Os códigos de telefone vêm de
 * `_shared/telefone.ts` inteiros, sem tradução no meio: o motivo que o operador
 * vê é o mesmo que o normalizador produziu.
 */
export type MotivoDaLinha = MotivoDeRecusa | 'coluna_nao_mapeada'

/** O relatório de uma linha recusada: onde, em qual coluna e por quê (RF-105). */
export interface RecusaDaLinha {
  readonly numero: number
  /** Coluna culpada. `null` quando o problema é não haver coluna nenhuma. */
  readonly coluna: string | null
  readonly motivo: MotivoDaLinha
}

/**
 * O lead que a linha produziria, nas chaves de `public.leads` — é assim que
 * ele segue para `registrar_lead(p_lead jsonb)` na confirmação, sem tradutor no
 * meio do caminho.
 */
export interface LeadDaLinha {
  readonly name: string | null
  readonly phone_e164: string
  readonly email: string | null
  readonly company: string | null
  readonly city: string | null
  readonly state: string | null
  readonly timezone: string | null
  readonly source: string | null
}

export type SituacaoDaLinha =
  | 'valido'
  | 'invalido'
  | 'duplicado_no_arquivo'
  | 'duplicado_na_base'

export interface LinhaDaPrevia {
  readonly numero: number
  readonly situacao: SituacaoDaLinha
  /** O lead resolvido. `null` só quando a situação é `invalido`. */
  readonly lead: LeadDaLinha | null
  /** A recusa. Preenchida só quando a situação é `invalido`. */
  readonly recusa: RecusaDaLinha | null
  /**
   * O que o DDD respondeu, ao lado do lead e não dentro dele. A planilha pode
   * trazer cidade e estado escritos de outro jeito e é ela que vence no lead;
   * guardar o palpite do DDD à parte deixa a tela mostrar a divergência em vez
   * de escolher em silêncio.
   */
  readonly local: LocalDoDdd | null
  /** Quando duplicado no arquivo, a linha que chegou primeiro com o número. */
  readonly primeiraOcorrencia: number | null
}

/**
 * Os números da prévia, mais a linha a linha.
 *
 * `validos + invalidos + duplicados === totalDeLinhas`, sempre, e
 * `duplicados === duplicadosNoArquivo + duplicadosNaBase`.
 */
export interface Previa {
  readonly totalDeLinhas: number
  readonly validos: number
  readonly invalidos: number
  readonly duplicados: number
  readonly duplicadosNoArquivo: number
  readonly duplicadosNaBase: number
  readonly mapeamento: MapeamentoResolvido
  /** Colunas do arquivo que não viraram campo. Não são erro (RF-101). */
  readonly colunasSemDestino: readonly string[]
  readonly linhas: readonly LinhaDaPrevia[]
}

/**
 * A camada de dados da prévia, com **uma** operação, de leitura.
 *
 * A prévia não grava, e a interface estreita é o que torna isso conferível em
 * vez de prometido: não há método de escrita para chamar por engano. A porta da
 * confirmação (US-027) é outra, e é lá que a escrita aparece.
 */
export interface PortaDeImportacao {
  /**
   * Dos telefones oferecidos, quais a conta já tem. Recebe os candidatos em
   * vez de devolver a base inteira: conta com cem mil leads não cabe na
   * memória da borda, e a planilha grande tem mil linhas.
   */
  telefonesExistentes(
    contaId: string,
    telefones: readonly string[],
  ): Promise<readonly string[]>
}

export interface PedidoDePrevia {
  readonly contaId: string
  readonly planilha: PlanilhaLida
  /** Escolhas de quem importa. O que não vier aqui sai do palpite automático. */
  readonly mapeamento?: MapeamentoDeColunas
  /** País assumido quando o número não traz código (RF-102). */
  readonly paisPadrao?: string
}

/** Sinais diacríticos que a decomposição NFD separa da letra. */
const DIACRITICOS = /[\u0300-\u036f]/g

/** Espaço, pontuação e qualquer outra coisa que não conte para a comparação. */
const NAO_ALFANUMERICO = /[^a-z0-9]+/g

/**
 * A forma em que dois nomes de coluna se comparam: sem acento, sem caixa e sem
 * separador. `E-Mail`, `e mail` e `E-MAIL` colapsam todos em `email`.
 */
export function normalizarNomeDeColuna(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(NAO_ALFANUMERICO, '')
}

/**
 * Como cada campo costuma se chamar na planilha do cliente. Escrito com acento
 * e com espaço porque é assim que se lê; a comparação normaliza os dois lados,
 * então não há variante a repetir aqui.
 *
 * Um apelido pertence a um campo só. `contato` fica em `nome` porque é assim
 * que a maioria dos CRMs exporta a pessoa; quem chama a coluna de telefone de
 * `contato` corrige no mapeamento, que é o que ele existe para fazer.
 */
const APELIDOS: Readonly<Record<CampoDoLead, readonly string[]>> = {
  nome: ['nome', 'nome completo', 'nome do lead', 'nome do contato', 'contato', 'lead', 'cliente', 'name', 'full name'],
  telefone: ['telefone', 'telefone 1', 'telefone de contato', 'telefone/whatsapp', 'fone', 'celular', 'whatsapp', 'tel', 'phone', 'mobile', 'número', 'número de telefone'],
  email: ['email', 'e-mail', 'mail', 'correio eletrônico', 'endereço de e-mail'],
  empresa: ['empresa', 'organização', 'razão social', 'company', 'negócio', 'estabelecimento'],
  cidade: ['cidade', 'município', 'localidade', 'city'],
  estado: ['estado', 'uf', 'unidade federativa', 'state'],
  origem: ['origem', 'fonte', 'canal', 'source', 'de onde veio'],
}

/** Índice invertido dos apelidos, já normalizados. Montado uma vez. */
const DESTINO_POR_APELIDO: ReadonlyMap<string, CampoDoLead> = new Map(
  CAMPOS_DO_LEAD.flatMap((campo) =>
    APELIDOS[campo].map(
      (apelido): [string, CampoDoLead] => [normalizarNomeDeColuna(apelido), campo],
    ),
  ),
)

/**
 * Monta a prévia inteira. Uma passada para normalizar telefone, uma consulta à
 * base com os candidatos, uma passada para classificar — nunca uma consulta por
 * linha, que é o que faria mil linhas estourarem o tempo da borda (P-05).
 */
export async function montarPrevia(
  pedido: PedidoDePrevia,
  porta: PortaDeImportacao,
): Promise<Previa> {
  const { colunas, linhas } = pedido.planilha
  const mapeamento = resolverMapeamento(colunas, pedido.mapeamento)

  const normalizadas = linhas.map((linha) =>
    normalizarLinha(linha, mapeamento, pedido.paisPadrao),
  )

  const candidatos = [
    ...new Set(normalizadas.flatMap((linha) => (linha.e164 === null ? [] : [linha.e164]))),
  ]
  const naBase = new Set(
    candidatos.length === 0
      ? []
      : await porta.telefonesExistentes(pedido.contaId, candidatos),
  )

  const primeiraPor164 = new Map<string, number>()
  const resultado: LinhaDaPrevia[] = []
  let validos = 0
  let duplicadosNoArquivo = 0
  let duplicadosNaBase = 0

  for (const linha of normalizadas) {
    if (linha.e164 === null) {
      resultado.push({
        numero: linha.numero,
        situacao: 'invalido',
        lead: null,
        recusa: linha.recusa,
        local: null,
        primeiraOcorrencia: null,
      })
      continue
    }

    const local = resolverFusoDoTelefone(linha.e164)
    const lead = montarLead(linha, linha.e164, local)
    const primeira = primeiraPor164.get(linha.e164)

    // A ordem entre os dois tipos importa quando o número repete numa conta que
    // já o tem: a primeira linha responde pela base, e só as seguintes são
    // repetição do arquivo. O contrário contaria a mesma linha duas vezes.
    if (primeira !== undefined) {
      duplicadosNoArquivo += 1
      resultado.push({
        numero: linha.numero,
        situacao: 'duplicado_no_arquivo',
        lead,
        recusa: null,
        local,
        primeiraOcorrencia: primeira,
      })
      continue
    }

    primeiraPor164.set(linha.e164, linha.numero)

    if (naBase.has(linha.e164)) {
      duplicadosNaBase += 1
      resultado.push({
        numero: linha.numero,
        situacao: 'duplicado_na_base',
        lead,
        recusa: null,
        local,
        primeiraOcorrencia: null,
      })
      continue
    }

    validos += 1
    resultado.push({
      numero: linha.numero,
      situacao: 'valido',
      lead,
      recusa: null,
      local,
      primeiraOcorrencia: null,
    })
  }

  return {
    totalDeLinhas: linhas.length,
    validos,
    invalidos: linhas.length - validos - duplicadosNoArquivo - duplicadosNaBase,
    duplicados: duplicadosNoArquivo + duplicadosNaBase,
    duplicadosNoArquivo,
    duplicadosNaBase,
    mapeamento,
    colunasSemDestino: colunasSemDestino(colunas, mapeamento),
    linhas: resultado,
  }
}

/**
 * Palpite automático para cada campo, sobrescrito pelo que veio no pedido.
 *
 * Coluna nomeada no mapeamento que não existe no cabeçalho resolve para `null`,
 * e não levanta: o arquivo é que manda, e um mapeamento salvo de outra planilha
 * não pode derrubar a prévia inteira.
 */
export function resolverMapeamento(
  colunas: readonly string[],
  escolhas: MapeamentoDeColunas = {},
): MapeamentoResolvido {
  const mapa: Record<CampoDoLead, string | null> = {
    nome: null,
    telefone: null,
    email: null,
    empresa: null,
    cidade: null,
    estado: null,
    origem: null,
  }

  // Primeira coluna reconhecida vence: planilha com `Telefone` e `Telefone 2`
  // usa a primeira, e quem quiser a outra diz no mapeamento.
  for (const coluna of colunas) {
    const campo = DESTINO_POR_APELIDO.get(normalizarNomeDeColuna(coluna))
    if (campo === undefined || mapa[campo] !== null) continue
    mapa[campo] = coluna
  }

  for (const campo of CAMPOS_DO_LEAD) {
    const escolha = escolhas[campo]
    if (escolha === undefined) continue
    mapa[campo] = escolha !== null && colunas.includes(escolha) ? escolha : null
  }

  return mapa
}

/** Colunas do arquivo que nenhum campo reclamou, na ordem do cabeçalho. */
function colunasSemDestino(
  colunas: readonly string[],
  mapeamento: MapeamentoResolvido,
): readonly string[] {
  const usadas = new Set(CAMPOS_DO_LEAD.flatMap((campo) => {
    const coluna = mapeamento[campo]
    return coluna === null ? [] : [coluna]
  }))
  return colunas.filter((coluna) => !usadas.has(coluna))
}

/** A linha com o telefone já resolvido, antes de saber se ela é duplicada. */
interface LinhaNormalizada {
  readonly numero: number
  readonly celulas: Readonly<Record<string, string>>
  readonly mapeamento: MapeamentoResolvido
  /** `null` quando a linha é inválida; aí `recusa` diz por quê. */
  readonly e164: string | null
  readonly recusa: RecusaDaLinha | null
}

function normalizarLinha(
  linha: LinhaLida,
  mapeamento: MapeamentoResolvido,
  paisPadrao: string | undefined,
): LinhaNormalizada {
  const base = { numero: linha.numero, celulas: linha.celulas, mapeamento }
  const coluna = mapeamento.telefone

  if (coluna === null) {
    return {
      ...base,
      e164: null,
      recusa: { numero: linha.numero, coluna: null, motivo: 'coluna_nao_mapeada' },
    }
  }

  const telefone = normalizarTelefone(linha.celulas[coluna], { paisPadrao })
  if (!telefone.ok) {
    return {
      ...base,
      e164: null,
      recusa: { numero: linha.numero, coluna, motivo: telefone.motivo },
    }
  }

  return { ...base, e164: telefone.e164, recusa: null }
}

/**
 * O lead da linha. Cidade e estado da planilha vencem os do DDD — não é o
 * produto que arbitra grafia de município, e quem exportou a lista sabe onde o
 * lead está melhor do que a sede da região de numeração sabe. O fuso é sempre
 * do DDD, porque planilha não traz fuso (RF-109).
 */
function montarLead(
  linha: LinhaNormalizada,
  e164: string,
  local: LocalDoDdd | null,
): LeadDaLinha {
  const valor = (campo: CampoDoLead): string | null => {
    const coluna = linha.mapeamento[campo]
    if (coluna === null) return null
    return (linha.celulas[coluna] ?? '').trim() || null
  }

  return {
    name: valor('nome'),
    phone_e164: e164,
    email: valor('email'),
    company: valor('empresa'),
    city: valor('cidade') ?? local?.cidade ?? null,
    state: valor('estado') ?? local?.estado ?? null,
    timezone: local?.fuso ?? null,
    source: valor('origem'),
  }
}
