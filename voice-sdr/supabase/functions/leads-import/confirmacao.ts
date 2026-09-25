// leads-import, etapa da confirmação: gravar o que o operador aceitou, e só
// depois do aceite (RF-103, RF-105).
//
// A prévia (`previa.ts`) diz o que vai acontecer; este módulo faz acontecer. As
// duas moram no mesmo endereço, separadas pela `acao` do pedido, e a primeira
// não escreve nada — é `atenderImportacao` quem despacha, e o teste cobra a
// lista de operações que cada ação toca na porta.
//
// Quatro decisões dão forma ao arquivo:
//
// 1. **A confirmação recalcula a prévia; ela não a recebe pronta.** O pedido
//    traz a planilha e o mapeamento que o operador aprovou, não os leads que a
//    prévia montou. Aceitar leads prontos do navegador seria aceitar telefone
//    que não passou por `_shared/telefone.ts` e conta que não é a de quem
//    chamou — e ainda gravaria pelo estado da base de minutos atrás.
// 2. **Quem decide duplicata é o índice, não a prévia.** Toda linha viva vai
//    para `registrar_lead`, inclusive a que a prévia marcou como
//    `duplicado_na_base`, e o resultado (`criado`, `ignorado`, `atualizado`)
//    vem do banco. Entre a prévia e o aceite, alguém pode ter cadastrado o
//    mesmo telefone pelo endereço público: pular a linha por causa da prévia
//    seria decidir com dado velho.
// 3. **Erro é da linha, nunca do lote.** Cada linha tem o seu `try`, e o
//    motivo da recusa entra no relatório em código. Mil linhas com uma
//    malformada gravam 999.
// 4. **Reimportar o mesmo arquivo não cria nada.** É o segundo critério de
//    aceite da F1, e ele cai de graça das duas decisões acima: o padrão de
//    `aoDuplicar` é `ignorar`, e o índice parcial de telefone reconhece as mil
//    linhas na segunda passada.
//
// Módulo portável: sem `Deno`, sem import de rede. O adaptador que implementa
// `PortaDeConfirmacao` sobre o cliente do Supabase fica em `index.ts`.

import {
  CAMPOS_DO_LEAD,
  montarPrevia,
  type CampoDoLead,
  type LeadDaLinha,
  type MapeamentoDeColunas,
  type MotivoDaLinha,
  type PlanilhaLida,
  type PortaDeImportacao,
  type Previa,
} from './previa.ts'
import {
  MENSAGENS,
  STATUS,
  frasesDosMotivos,
  type MotivoDaImportacao,
} from './respostas.ts'

/**
 * Quantas linhas viajam juntas para o banco.
 *
 * Cem é o tamanho do lote porque é o que mantém mil linhas dentro do tempo de
 * CPU da borda sem abrir mil conexões de uma vez (P-05): os lotes vão um após o
 * outro, e dentro do lote as linhas vão juntas. Uma por uma, mil idas e voltas
 * estouram o tempo; todas juntas, o pool do banco.
 */
export const TAMANHO_DO_LOTE = 100

/** As duas etapas que o mesmo endereço atende. */
export const ACOES = ['previa', 'confirmar'] as const

export type Acao = (typeof ACOES)[number]

/** O que fazer com telefone que a conta já tem (RF-103). */
export const ESCOLHAS_DE_DUPLICATA = ['ignorar', 'atualizar', 'criar'] as const

export type AoDuplicar = (typeof ESCOLHAS_DE_DUPLICATA)[number]

/**
 * De onde os leads vieram, para o evento de cada um.
 *
 * O hash é do conteúdo do arquivo e é quem responde "isto já foi importado?"
 * meses depois, quando o nome do arquivo já é `leads (3).csv`. Quem o calcula é
 * quem tem os bytes — a tela ou o `index.ts` —, e aqui ele só é repassado.
 */
export interface ArquivoDaImportacao {
  readonly nome: string
  readonly hash: string
}

/** Códigos que `registrar_lead` levanta, um por `raise exception` dele. */
export const MOTIVOS_DO_BANCO = [
  'telefone_invalido',
  'duplicado_por_telefone',
  'sem_permissao',
  'etapa_invalida',
  'lead_invalido',
  'opcao_invalida',
] as const

/**
 * Por que o banco recusou a linha. `falha_ao_gravar` é o fundo do poço: o que
 * o banco disser e este módulo não reconhecer morre aqui, e a linha ganha uma
 * frase honesta em vez de uma mensagem de Postgres vazando para a tela.
 */
export type MotivoDoBanco = (typeof MOTIVOS_DO_BANCO)[number] | 'falha_ao_gravar'

/**
 * Tudo o que pode ser dito sobre uma linha, em código. A frase de cada um está
 * em `respostas.ts`, e viaja uma vez por resposta em vez de uma por linha.
 */
export type MotivoDoRelatorio =
  | MotivoDaLinha
  | 'duplicado_no_arquivo'
  | 'duplicado_na_base'
  | MotivoDoBanco

/** O que `registrar_lead` devolve quando a gravação passa. */
export interface LeadGravado {
  readonly leadId: string
  readonly resultado: 'criado' | 'ignorado' | 'atualizado'
}

/**
 * A camada de dados da importação inteira: a leitura da prévia mais as duas
 * escritas da confirmação.
 *
 * Estender `PortaDeImportacao` em vez de declarar outra porta é o que permite a
 * mesma porta atender as duas ações — e é o que torna "a prévia não grava"
 * conferível: com uma porta só, a prévia **teria** onde escrever, e o dublê
 * mostra que ela não escreveu.
 */
export interface PortaDeConfirmacao extends PortaDeImportacao {
  /**
   * Chama `registrar_lead(p_account_id, p_lead, p_ao_duplicar)`. Levanta com a
   * mensagem do banco quando ele recusa; quem classifica é `motivoDoBanco`.
   */
  registrarLead(
    contaId: string,
    lead: LeadDaLinha,
    aoDuplicar: AoDuplicar,
  ): Promise<LeadGravado>
  /**
   * Chama `registrar_evento_de_lead(lead_id, 'lead_imported', ...)` com o nome
   * e o hash do arquivo no payload. É o único caminho de escrita em
   * `lead_events`, como manda a migração da US-022.
   */
  registrarImportacao(leadId: string, arquivo: ArquivoDaImportacao): Promise<void>
}

export type ResultadoDaLinha = 'criado' | 'ignorado' | 'atualizado' | 'erro'

export interface LinhaDoRelatorio {
  /** Número da linha no arquivo, o mesmo que a prévia mostrou (RF-105). */
  readonly numero: number
  readonly resultado: ResultadoDaLinha
  /** O lead que a linha alcançou. `null` quando nada foi gravado. */
  readonly leadId: string | null
  /** Por que não criou. `null` em `criado` e em `atualizado`. */
  readonly motivo: MotivoDoRelatorio | null
}

/**
 * O que a importação fez, linha a linha e em números.
 *
 * `criados + ignorados + atualizados + erros === totalDeLinhas`, sempre — é a
 * mesma aritmética da prévia, e existe pelo mesmo motivo: relatório que se
 * confere de cabeça.
 */
export interface RelatorioDaImportacao {
  readonly arquivo: ArquivoDaImportacao
  readonly aoDuplicar: AoDuplicar
  readonly totalDeLinhas: number
  readonly criados: number
  readonly ignorados: number
  readonly atualizados: number
  readonly erros: number
  /**
   * Linhas cujo lead nasceu e cujo `lead_imported` não entrou.
   *
   * Não é erro da linha, e chamá-lo de erro mentiria duas vezes: o lead existe
   * e já tem `lead_created` pelo caminho da US-025. O que falta é a narração de
   * qual arquivo o trouxe, e é por isso que a lista viaja à parte em vez de
   * virar mais um motivo.
   */
  readonly semRegistroDeImportacao: readonly number[]
  readonly linhas: readonly LinhaDoRelatorio[]
}

export interface PedidoDeConfirmacao {
  readonly contaId: string
  readonly planilha: PlanilhaLida
  readonly mapeamento?: MapeamentoDeColunas
  readonly paisPadrao?: string
  readonly arquivo: ArquivoDaImportacao
  /** O padrão é `ignorar`, que é o que faz reimportar não duplicar nada. */
  readonly aoDuplicar?: AoDuplicar
}

/**
 * Recalcula a prévia e grava o que ela aprovar, em lotes.
 *
 * Levanta só quando a leitura da prévia falha — a partir daí, nenhuma linha
 * derruba as outras.
 */
export async function confirmarImportacao(
  pedido: PedidoDeConfirmacao,
  porta: PortaDeConfirmacao,
): Promise<RelatorioDaImportacao> {
  const aoDuplicar = pedido.aoDuplicar ?? 'ignorar'
  const previa = await montarPrevia(
    {
      contaId: pedido.contaId,
      planilha: pedido.planilha,
      mapeamento: pedido.mapeamento,
      paisPadrao: pedido.paisPadrao,
    },
    porta,
  )

  const resolvidas: (LinhaDoRelatorio | null)[] = previa.linhas.map(() => null)
  const pendentes: {
    readonly posicao: number
    readonly numero: number
    readonly lead: LeadDaLinha
  }[] = []

  previa.linhas.forEach((linha, posicao) => {
    // Sem lead montado a linha nunca chega ao banco: a prévia já disse por quê,
    // e o código dela é o mesmo que entra no relatório.
    if (linha.lead === null) {
      resolvidas[posicao] = {
        numero: linha.numero,
        resultado: 'erro',
        leadId: null,
        motivo: linha.recusa?.motivo ?? 'lead_invalido',
      }
      return
    }

    // Telefone repetido dentro do próprio arquivo não vira segunda chamada: a
    // primeira ocorrência responde pelo número, e mandar as duas gastaria uma
    // ida ao banco para receber `ignorado` de volta.
    if (linha.situacao === 'duplicado_no_arquivo') {
      resolvidas[posicao] = {
        numero: linha.numero,
        resultado: 'ignorado',
        leadId: null,
        motivo: 'duplicado_no_arquivo',
      }
      return
    }

    pendentes.push({ posicao, numero: linha.numero, lead: linha.lead })
  })

  const semRegistro: number[] = []

  for (let inicio = 0; inicio < pendentes.length; inicio += TAMANHO_DO_LOTE) {
    const lote = pendentes.slice(inicio, inicio + TAMANHO_DO_LOTE)
    await Promise.all(
      lote.map(async (item) => {
        resolvidas[item.posicao] = await gravarLinha(
          item.numero,
          item.lead,
          { contaId: pedido.contaId, arquivo: pedido.arquivo, aoDuplicar },
          porta,
          semRegistro,
        )
      }),
    )
  }

  const linhas = resolvidas.map((linha, posicao) => {
    if (linha === null) {
      throw new Error(`relatório da importação: a linha na posição ${posicao} ficou sem resultado`)
    }
    return linha
  })

  return {
    arquivo: pedido.arquivo,
    aoDuplicar,
    totalDeLinhas: linhas.length,
    criados: quantas(linhas, 'criado'),
    ignorados: quantas(linhas, 'ignorado'),
    atualizados: quantas(linhas, 'atualizado'),
    erros: quantas(linhas, 'erro'),
    // As linhas do lote gravam juntas, então a ordem de chegada é a do banco.
    // O relatório é lido por gente, e gente lê na ordem do arquivo.
    semRegistroDeImportacao: [...semRegistro].sort((um, outro) => um - outro),
    linhas,
  }
}

interface ContextoDaGravacao {
  readonly contaId: string
  readonly arquivo: ArquivoDaImportacao
  readonly aoDuplicar: AoDuplicar
}

/**
 * Uma linha, do RPC ao evento. Nunca levanta: o que der errado volta como
 * motivo, porque uma linha ruim não pode levar o lote.
 */
async function gravarLinha(
  numero: number,
  lead: LeadDaLinha,
  contexto: ContextoDaGravacao,
  porta: PortaDeConfirmacao,
  semRegistro: number[],
): Promise<LinhaDoRelatorio> {
  let gravado: LeadGravado
  try {
    gravado = await porta.registrarLead(contexto.contaId, lead, contexto.aoDuplicar)
  } catch (erro) {
    // `criar` sobre telefone que a conta já tem cai aqui, com
    // `duplicado_por_telefone`: o índice parcial não deixa nascer o segundo
    // lead, e o RPC recusa em vez de tentar.
    return { numero, resultado: 'erro', leadId: null, motivo: motivoDoBanco(erro) }
  }

  if (gravado.resultado === 'criado') {
    try {
      await porta.registrarImportacao(gravado.leadId, contexto.arquivo)
    } catch {
      semRegistro.push(numero)
    }
  }

  return {
    numero,
    resultado: gravado.resultado,
    leadId: gravado.leadId,
    // `ignorado` sai do banco por dois caminhos — duplicata com `ignorar`, e
    // `atualizar` que não achou campo vazio para preencher. Os dois querem
    // dizer a mesma coisa a quem lê o relatório: este telefone já estava lá.
    motivo: gravado.resultado === 'ignorado' ? 'duplicado_na_base' : null,
  }
}

function quantas(
  linhas: readonly LinhaDoRelatorio[],
  resultado: ResultadoDaLinha,
): number {
  return linhas.filter((linha) => linha.resultado === resultado).length
}

/**
 * O que o banco recusou, em código.
 *
 * `registrar_lead` levanta com o código na mensagem (`raise exception
 * 'telefone_invalido'`), então o reconhecimento é por palavra inteira da
 * mensagem — e só da mensagem, nunca do `detail`, que é prosa para quem lê
 * log. O que não casar vira `falha_ao_gravar`: mensagem de Postgres não sai
 * daqui.
 */
export function motivoDoBanco(erro: unknown): MotivoDoBanco {
  const palavras = new Set(textoDoErro(erro).toLowerCase().match(/[a-z_]+/g) ?? [])
  for (const motivo of MOTIVOS_DO_BANCO) {
    if (palavras.has(motivo)) return motivo
  }
  return 'falha_ao_gravar'
}

function textoDoErro(erro: unknown): string {
  if (typeof erro === 'string') return erro
  if (typeof erro === 'object' && erro !== null && 'message' in erro) {
    const mensagem = (erro as { readonly message: unknown }).message
    if (typeof mensagem === 'string') return mensagem
  }
  return ''
}

// ---------------------------------------------------------------------------
// O endereço: duas ações, uma porta
// ---------------------------------------------------------------------------

export interface CorpoDaImportacao {
  readonly ok: boolean
  readonly motivo: MotivoDaImportacao
  readonly mensagem: string
  readonly previa?: Previa
  readonly relatorio?: RelatorioDaImportacao
  /** A frase de cada motivo que apareceu, indexada pelo código dele. */
  readonly frases?: Readonly<Partial<Record<MotivoDoRelatorio, string>>>
}

export interface RespostaDaImportacao {
  readonly status: number
  readonly corpo: CorpoDaImportacao
}

export interface PedidoDaBorda {
  readonly metodo: string
  /** O corpo do POST, como veio. É aqui que ele é conferido. */
  readonly corpo: unknown
}

/**
 * Resolve o pedido inteiro. Devolve sempre status e corpo em português, nunca
 * levanta: exceção da camada de dados vira `falha_interna`, porque quem importa
 * precisa de uma frase, não de um stack trace.
 */
export async function atenderImportacao(
  pedido: PedidoDaBorda,
  porta: PortaDeConfirmacao,
): Promise<RespostaDaImportacao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const corpo = objetoDe(pedido.corpo)
  // Sem corpo legível não há nem ação para nomear, e é por ela que o pedido
  // começa: é ela que diz se esta chamada grava ou não.
  if (corpo === null) return recusa('acao_invalida')

  const acao = lerAcao(corpo.acao)
  if (acao === null) return recusa('acao_invalida')

  const contaId = lerTexto(corpo.contaId)
  if (contaId === null) return recusa('conta_ausente')

  const planilha = lerPlanilha(corpo.planilha)
  if (planilha === null) return recusa('planilha_invalida')

  const mapeamento = lerMapeamento(corpo.mapeamento)
  const paisPadrao = lerTexto(corpo.paisPadrao) ?? undefined

  if (acao === 'previa') {
    try {
      const previa = await montarPrevia({ contaId, planilha, mapeamento, paisPadrao }, porta)
      return {
        status: STATUS.previa_pronta,
        corpo: {
          ok: true,
          motivo: 'previa_pronta',
          mensagem: MENSAGENS.previa_pronta,
          previa,
          frases: frasesDosMotivos(motivosDaPrevia(previa)),
        },
      }
    } catch {
      return recusa('falha_interna')
    }
  }

  const arquivo = lerArquivo(corpo.arquivo)
  if (arquivo === null) return recusa('arquivo_ausente')

  const aoDuplicar = lerAoDuplicar(corpo.aoDuplicar)
  if (aoDuplicar === null) return recusa('escolha_invalida')

  try {
    const relatorio = await confirmarImportacao(
      { contaId, planilha, mapeamento, paisPadrao, arquivo, aoDuplicar },
      porta,
    )
    return {
      status: STATUS.importado,
      corpo: {
        ok: true,
        motivo: 'importado',
        mensagem: MENSAGENS.importado,
        relatorio,
        frases: frasesDosMotivos(
          relatorio.linhas.flatMap((linha) => (linha.motivo === null ? [] : [linha.motivo])),
        ),
      },
    }
  } catch {
    return recusa('falha_interna')
  }
}

/** Os motivos que a prévia produziu, para o dicionário de frases. */
function motivosDaPrevia(previa: Previa): MotivoDoRelatorio[] {
  return previa.linhas.flatMap((linha) => {
    if (linha.recusa !== null) return [linha.recusa.motivo]
    if (linha.situacao === 'duplicado_no_arquivo') return ['duplicado_no_arquivo' as const]
    if (linha.situacao === 'duplicado_na_base') return ['duplicado_na_base' as const]
    return []
  })
}

function recusa(motivo: MotivoDaImportacao): RespostaDaImportacao {
  return {
    status: STATUS[motivo],
    corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] },
  }
}

// ---------------------------------------------------------------------------
// Conferência do corpo
// ---------------------------------------------------------------------------

function objetoDe(valor: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null
  return valor as Readonly<Record<string, unknown>>
}

function lerTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  return valor.trim() || null
}

function lerAcao(valor: unknown): Acao | null {
  const texto = lerTexto(valor)
  return ACOES.find((acao) => acao === texto) ?? null
}

/**
 * `null` é escolha inválida e `undefined` é escolha ausente, que cai no padrão.
 * Juntar os dois faria `aoDuplicar: 'atualzar'` gravar como `ignorar`, em
 * silêncio, sobre mil linhas.
 */
function lerAoDuplicar(valor: unknown): AoDuplicar | undefined | null {
  if (valor === undefined || valor === null) return undefined
  const texto = lerTexto(valor)
  return ESCOLHAS_DE_DUPLICATA.find((escolha) => escolha === texto) ?? null
}

function lerArquivo(valor: unknown): ArquivoDaImportacao | null {
  const objeto = objetoDe(valor)
  if (objeto === null) return null
  const nome = lerTexto(objeto.nome)
  const hash = lerTexto(objeto.hash)
  if (nome === null || hash === null) return null
  return { nome, hash }
}

/**
 * A planilha do corpo, conferida célula por célula.
 *
 * Célula que não é texto é descartada em vez de derrubar o pedido: planilha
 * exportada com número na coluna de telefone é comum, e quem a converteu é a
 * tela. O que o formato não pode perder é o cabeçalho e o número da linha —
 * sem eles o relatório aponta para o lugar errado.
 */
function lerPlanilha(valor: unknown): PlanilhaLida | null {
  const objeto = objetoDe(valor)
  if (objeto === null) return null

  const cru = objeto.colunas
  if (!Array.isArray(cru) || cru.some((coluna) => typeof coluna !== 'string')) return null
  const colunas = cru as readonly string[]

  const crus = objeto.linhas
  if (!Array.isArray(crus)) return null

  const linhas = []
  for (const linhaCrua of crus) {
    const linha = objetoDe(linhaCrua)
    if (linha === null) return null
    if (typeof linha.numero !== 'number' || !Number.isInteger(linha.numero)) return null
    const celulas = objetoDe(linha.celulas)
    if (celulas === null) return null
    linhas.push({
      numero: linha.numero,
      celulas: Object.fromEntries(
        Object.entries(celulas).flatMap(([coluna, celula]) =>
          typeof celula === 'string' ? [[coluna, celula] as const] : [],
        ),
      ),
    })
  }

  return { colunas, linhas }
}

/**
 * As escolhas de coluna, campo por campo do lead.
 *
 * Chave que não é campo de lead fica de fora — mapeamento salvo de uma versão
 * futura do produto não pode chegar aqui e virar campo que este código não
 * conhece. `null` sobrevive: é a escolha "esta planilha não tem esse campo".
 */
function lerMapeamento(valor: unknown): MapeamentoDeColunas | undefined {
  const objeto = objetoDe(valor)
  if (objeto === null) return undefined

  const escolhas: Partial<Record<CampoDoLead, string | null>> = {}
  for (const campo of CAMPOS_DO_LEAD) {
    const coluna = objeto[campo]
    if (coluna === null) escolhas[campo] = null
    else if (typeof coluna === 'string') escolhas[campo] = coluna
  }
  return escolhas
}
