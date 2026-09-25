// lead-export: levar o recorte que está na tela para uma planilha (RF-115).
//
// A exportação parece a função mais simples da fatia e é a que tem mais jeitos
// de dar errado em silêncio. Três deles moram neste arquivo:
//
// 1. **O acento.** CSV em UTF-8 sem marca de ordem de byte abre no Excel em
//    português como `Jo├úo`, porque o Excel assume a página de código do
//    sistema quando o arquivo não se identifica. O BOM é a identificação, e
//    custa três bytes.
// 2. **A fórmula.** Célula que começa com `=`, `+`, `-` ou `@` é fórmula para
//    a planilha, e um lead chamado `=cmd|'/c calc'!A1` vira código executado na
//    máquina de quem abriu o arquivo. O apóstrofo à frente desarma isso, e o
//    preço está declarado abaixo, em `protegerDeFormula`.
// 3. **O corte calado.** Um recorte de 200 mil leads não cabe numa resposta de
//    borda. Cortar em 50 mil e entregar como se fosse tudo é a falha que
//    ninguém percebe: a planilha parece completa. O teto é declarado, e o que
//    ficou de fora viaja no relatório da resposta.
//
// **Auditoria e transação.** RF-008 pede que a exportação da base de contatos
// deixe registro. O registro entra por `registrar_exportacao_de_leads`, que
// escreve a linha de `audit_log` na transação dele — leitura e registro são
// duas chamadas ao PostgREST e não há como envolvê-las numa transação só a
// partir da borda. O que dá para garantir daqui, e é o que este módulo
// garante, é a ordem: **o registro é gravado antes de o CSV ser devolvido, e
// registro que falha cancela a entrega**. Não existe planilha na mão de alguém
// sem a linha correspondente na trilha. Fundir as duas coisas de verdade exige
// mover a leitura para dentro de um RPC, e aí a leitura deixaria de acontecer
// sob a RLS de quem pediu — que é a fronteira que não se troca por conveniência.
//
// Fora do escopo, e por quê: o zip com JSON e áudios e a exportação individual
// sob solicitação do titular (L-10, RF-809) não entram aqui. As duas dependem
// de `calls` e de `deletion_requests`, que são de fatias seguintes; a segunda
// ainda depende de um prazo e de um formato que a LGPD define e o produto
// ainda não escolheu. Escrever agora um caminho que não tem como ser exercido
// seria escrever código sem teste.
//
// Módulo portável: sem `Deno`, sem import de rede. O adaptador que implementa
// `PortaDeExportacao` sobre o cliente do Supabase fica em `index.ts`.

import {
  lerRecorteDeLeads,
  type RecorteDeLeads,
} from '../_shared/recorte-de-leads.ts'
import {
  MENSAGENS,
  STATUS,
  type MotivoDaExportacao,
} from './respostas.ts'

/**
 * Quantas linhas saem numa exportação.
 *
 * Cinquenta mil é teto de resposta, não de produto: o CSV dessa quantidade fica
 * na casa de poucos megabytes, que é o que a borda monta em memória e entrega
 * dentro do tempo dela. Quem precisa de mais estreita o recorte — por etapa,
 * por período de atividade — e leva em partes, que é também o jeito de a
 * planilha continuar utilizável do outro lado.
 */
export const TETO_DE_LINHAS = 50_000

/** Uma linha de lead como a exportação a recebe da camada de dados. */
export interface LeadExportavel {
  readonly name: string | null
  readonly phone_e164: string
  readonly email: string | null
  readonly company: string | null
  readonly city: string | null
  readonly state: string | null
  readonly timezone: string | null
  /** Rótulo da etapa, resolvido pela porta. Nulo em lead sem etapa. */
  readonly stage_label: string | null
  readonly temperature: string | null
  readonly source: string | null
  readonly blocked_at: string | null
  readonly blocked_reason: string | null
  readonly last_activity_at: string | null
  readonly created_at: string
}

/**
 * O que a porta devolve: as linhas até o teto e quantas o recorte alcança.
 *
 * `total` vem contado pelo banco, não pelo tamanho de `linhas` — é justamente
 * quando os dois números divergem que a exportação tem algo a dizer.
 */
export interface PaginaDeLeads {
  readonly linhas: readonly LeadExportavel[]
  readonly total: number
}

/**
 * A camada de dados da exportação: uma leitura e um registro.
 *
 * As duas acontecem sob a sessão de quem pediu. A leitura porque a RLS de
 * `leads` é a fronteira — com a chave de serviço, qualquer sessão exportaria
 * qualquer conta —, e o registro porque `registrar_exportacao_de_leads` assina
 * com `auth.uid()` e recusa quem chega sem sessão.
 */
export interface PortaDeExportacao {
  /**
   * As linhas do recorte, no máximo `teto`, mais a contagem do recorte inteiro.
   */
  leadsDoRecorte(
    contaId: string,
    recorte: RecorteDeLeads,
    teto: number,
  ): Promise<PaginaDeLeads>
  /**
   * Chama `registrar_exportacao_de_leads(p_account_id, p_quantidade,
   * p_recorte)`. Levanta com a mensagem do banco quando ele recusa.
   */
  registrarExportacao(
    contaId: string,
    quantidade: number,
    recorte: RecorteDeLeads,
  ): Promise<void>
}

/**
 * As colunas do arquivo, na ordem em que aparecem.
 *
 * Dado, e não uma sequência de concatenações: coluna nova entra numa linha, e
 * o teste varre esta lista em vez de repetir os títulos. Os títulos são de
 * interface — diretos e declarativos, no registro da seção 4 de
 * docs/padrao-de-interface.md — e por isso estão em português, enquanto as
 * chaves do lead continuam as de `public.leads`.
 */
export const COLUNAS_DA_EXPORTACAO: readonly {
  readonly titulo: string
  readonly de: (lead: LeadExportavel) => string | null
}[] = [
  { titulo: 'Nome', de: (lead) => lead.name },
  { titulo: 'Telefone', de: (lead) => lead.phone_e164 },
  { titulo: 'E-mail', de: (lead) => lead.email },
  { titulo: 'Empresa', de: (lead) => lead.company },
  { titulo: 'Cidade', de: (lead) => lead.city },
  { titulo: 'Estado', de: (lead) => lead.state },
  { titulo: 'Fuso', de: (lead) => lead.timezone },
  { titulo: 'Etapa', de: (lead) => lead.stage_label },
  { titulo: 'Temperatura', de: (lead) => lead.temperature },
  { titulo: 'Origem', de: (lead) => lead.source },
  { titulo: 'Bloqueado em', de: (lead) => lead.blocked_at },
  { titulo: 'Motivo do bloqueio', de: (lead) => lead.blocked_reason },
  { titulo: 'Última atividade', de: (lead) => lead.last_activity_at },
  { titulo: 'Criado em', de: (lead) => lead.created_at },
]

/**
 * A marca de ordem de byte do UTF-8.
 *
 * Ela não muda o conteúdo do arquivo para nenhum leitor que declare a
 * codificação; muda para o Excel em português, que sem ela adivinha errado. É a
 * diferença entre `São Paulo` e `S├úo Paulo` na planilha de quem exportou.
 */
export const BOM = '﻿'

/** RFC 4180: a quebra de linha do CSV é CRLF, e o Excel a espera assim. */
const QUEBRA = '\r\n'

/** O que a planilha trata como início de fórmula. */
const INICIO_DE_FORMULA = /^[=+\-@]/

/**
 * Desarma a célula que a planilha executaria.
 *
 * O apóstrofo à frente faz o Excel e o LibreOffice tratarem o conteúdo como
 * texto. Ele tem um preço declarado: telefone em E.164 começa com `+` e sai
 * como `'+5548999998888`, e número negativo sai como texto. O preço é aceito
 * porque a alternativa é entregar um arquivo que executa código na máquina de
 * quem o abrir — e porque telefone em planilha serve para ser lido e copiado,
 * não somado.
 *
 * Os quatro caracteres são os que o critério de aceite fixa. Guias e retornos
 * de carro iniciais também aparecem em listas de injeção de fórmula, e aqui
 * eles caem na regra de aspas em vez desta: ficam entre aspas, preservados, e
 * não viram fórmula porque o que vem depois deles já foi desarmado.
 */
export function protegerDeFormula(valor: string): string {
  return INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor
}

/**
 * Uma célula pronta para o arquivo: protegida de fórmula e escapada.
 *
 * Aspas viram aspas dobradas e a célula inteira vai entre aspas quando contém
 * aspas, vírgula, quebra de linha ou espaço nas bordas — o espaço porque
 * leitores diferentes discordam sobre o que fazer com ele, e a discordância
 * aparece como nome com espaço sumido.
 */
export function celulaCsv(valor: string | null): string {
  const texto = protegerDeFormula(valor ?? '')
  if (!/["\n\r,]/.test(texto) && texto.trim() === texto) return texto
  return `"${texto.replaceAll('"', '""')}"`
}

/** O CSV inteiro, com BOM, cabeçalho em português e uma linha por lead. */
export function montarCsv(leads: readonly LeadExportavel[]): string {
  const linhas = [
    COLUNAS_DA_EXPORTACAO.map((coluna) => celulaCsv(coluna.titulo)).join(','),
    ...leads.map((lead) =>
      COLUNAS_DA_EXPORTACAO.map((coluna) => celulaCsv(coluna.de(lead))).join(','),
    ),
  ]
  // A última linha também termina com quebra: arquivo sem quebra final faz
  // alguns leitores engolirem a linha, e todos aceitam a quebra sobrando.
  return `${BOM}${linhas.join(QUEBRA)}${QUEBRA}`
}

/** O que a exportação produziu, em números e em arquivo. */
export interface Exportacao {
  readonly csv: string
  /** Quantas linhas entraram no arquivo. */
  readonly exportadas: number
  /** Quantas o recorte alcança, contadas pelo banco. */
  readonly total: number
  /** `total - exportadas`. Zero quando o recorte coube inteiro. */
  readonly ficaramDeFora: number
  readonly teto: number
}

export interface PedidoDeExportacao {
  readonly contaId: string
  readonly recorte: RecorteDeLeads
}

/**
 * Lê o recorte, registra a exportação e monta o arquivo — nessa ordem.
 *
 * Levanta quando a leitura ou o registro falham: exportação sem registro não
 * sai daqui, e é `atenderExportacao` quem traduz a falha para resposta.
 */
export async function exportarLeads(
  pedido: PedidoDeExportacao,
  porta: PortaDeExportacao,
): Promise<Exportacao> {
  const pagina = await porta.leadsDoRecorte(pedido.contaId, pedido.recorte, TETO_DE_LINHAS)
  const linhas = pagina.linhas.slice(0, TETO_DE_LINHAS)

  // A contagem do banco manda, mas ela não pode ser menor do que o que veio:
  // uma porta que devolvesse linhas e esquecesse o total faria a exportação
  // relatar menos do que entregou.
  const total = Math.max(pagina.total, linhas.length)

  // Recorte que não alcança lead nenhum não vira registro. A trilha guarda
  // saída de dado, e aqui não saiu nada: linhas de "exportou 0" afogariam as
  // exportações de verdade no meio de tentativas de quem estava só filtrando.
  // Quem transforma isso em resposta é `atenderExportacao`.
  if (linhas.length > 0) {
    await porta.registrarExportacao(pedido.contaId, linhas.length, pedido.recorte)
  }

  return {
    csv: montarCsv(linhas),
    exportadas: linhas.length,
    total,
    ficaramDeFora: total - linhas.length,
    teto: TETO_DE_LINHAS,
  }
}

// ---------------------------------------------------------------------------
// O endereço
// ---------------------------------------------------------------------------

/** O corpo em JSON, que é o que sai quando não sai arquivo. */
export interface CorpoDaExportacao {
  readonly ok: boolean
  readonly motivo: MotivoDaExportacao
  readonly mensagem: string
  readonly campo?: string
}

export type RespostaDaExportacao =
  | {
      readonly status: number
      readonly tipo: 'csv'
      readonly csv: string
      readonly nomeDoArquivo: string
      /**
       * O relatório da exportação, em cabeçalhos.
       *
       * O corpo é o arquivo, então o que a exportação tem a dizer sobre si
       * viaja ao lado. Os valores são ASCII e são código, não frase
       * (`teto_atingido`), pela mesma regra de sempre nesta base: a frase é de
       * quem exibe, e mora em `respostas.ts` e em `app/src/copy/leads.ts`.
       * Cabeçalho com acento ainda é terreno de codificação discutível entre
       * servidores, e não é lugar de texto para gente.
       */
      readonly cabecalhos: Readonly<Record<string, string>>
    }
  | { readonly status: number; readonly tipo: 'json'; readonly corpo: CorpoDaExportacao }

export interface PedidoDaBorda {
  readonly metodo: string
  readonly corpo: unknown
}

/**
 * Resolve o pedido inteiro. Nunca levanta: exceção da camada de dados vira
 * `falha_interna` ou `falha_ao_registrar`, porque quem exporta precisa de uma
 * frase, não de um stack trace.
 */
export async function atenderExportacao(
  pedido: PedidoDaBorda,
  porta: PortaDeExportacao,
  agora: () => number = Date.now,
): Promise<RespostaDaExportacao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const corpo = objetoDe(pedido.corpo)
  if (corpo === null) return recusa('conta_ausente')

  const contaId = lerTexto(corpo.contaId)
  if (contaId === null) return recusa('conta_ausente')

  const leitura = lerRecorteDeLeads(corpo.recorte)
  if (!leitura.ok) return recusa('filtro_invalido', leitura.campo)

  let exportacao: Exportacao
  try {
    exportacao = await exportarLeads({ contaId, recorte: leitura.recorte }, porta)
  } catch (erro) {
    // Registro recusado e leitura recusada são duas coisas diferentes para quem
    // exportou: uma diz "seu papel não alcança esta conta", a outra diz "tente
    // de novo". Só o registro sabe distinguir, e é ele que carrega o código.
    return recusa(motivoDaFalha(erro))
  }

  // Nada a exportar não vira arquivo. Uma planilha só com cabeçalho parece
  // resposta e não é: quem a receber vai procurar os leads dentro dela. A tela
  // diz que o recorte não alcança nenhum lead e oferece afrouxá-lo.
  if (exportacao.exportadas === 0) return recusa('recorte_vazio')

  const motivo: MotivoDaExportacao =
    exportacao.ficaramDeFora > 0 ? 'teto_atingido' : 'exportado'

  return {
    status: STATUS[motivo],
    tipo: 'csv',
    csv: exportacao.csv,
    nomeDoArquivo: nomeDoArquivo(agora()),
    cabecalhos: {
      'x-exportacao-motivo': motivo,
      'x-exportacao-linhas': String(exportacao.exportadas),
      'x-exportacao-total': String(exportacao.total),
      'x-exportacao-fora': String(exportacao.ficaramDeFora),
      'x-exportacao-teto': String(exportacao.teto),
    },
  }
}

/**
 * `leads-2026-09-21.csv`. A data é a do servidor e entra em ISO justamente
 * para os arquivos se ordenarem sozinhos na pasta de quem exporta toda semana.
 */
export function nomeDoArquivo(instante: number): string {
  const dia = new Date(instante).toISOString().slice(0, 10)
  return `leads-${dia}.csv`
}

/**
 * O que a camada de dados recusou, em código.
 *
 * `registrar_exportacao_de_leads` levanta com o código na mensagem (`raise
 * exception 'sem_permissao'`), então o reconhecimento é por palavra inteira da
 * mensagem, como em `leads-import`. O que não casar vira `falha_interna`:
 * mensagem de Postgres não sai daqui.
 */
export function motivoDaFalha(erro: unknown): MotivoDaExportacao {
  const palavras = new Set(textoDoErro(erro).toLowerCase().match(/[a-z_]+/g) ?? [])
  if (palavras.has('sem_permissao') || palavras.has('sem_sessao')) return 'sem_permissao'
  if (palavras.has('quantidade_invalida') || palavras.has('recorte_invalido')) {
    return 'falha_ao_registrar'
  }
  return 'falha_interna'
}

function textoDoErro(erro: unknown): string {
  if (typeof erro === 'string') return erro
  if (typeof erro === 'object' && erro !== null && 'message' in erro) {
    const mensagem = (erro as { readonly message: unknown }).message
    if (typeof mensagem === 'string') return mensagem
  }
  return ''
}

function recusa(motivo: MotivoDaExportacao, campo?: string): RespostaDaExportacao {
  return {
    status: STATUS[motivo],
    tipo: 'json',
    corpo:
      campo === undefined
        ? { ok: false, motivo, mensagem: MENSAGENS[motivo] }
        : { ok: false, motivo, mensagem: MENSAGENS[motivo], campo },
  }
}

function objetoDe(valor: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null
  return valor as Readonly<Record<string, unknown>>
}

function lerTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  return valor.trim() || null
}
