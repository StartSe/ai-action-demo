// Ler a planilha no navegador, antes de qualquer coisa viajar.
//
// O arquivo não sobe. Quem o abre é esta função, e o que segue para a borda é a
// `PlanilhaLida` de `@importacao/previa.ts` — cabeçalho, células e o número da
// linha. Três razões sustentam a escolha, e as três aparecem no formato de
// saída:
//
// 1. **O arquivo de RH da empresa não precisa ir para o servidor inteiro.** A
//    planilha de prospecção costuma trazer colunas que ninguém pediu (valor de
//    contrato, anotação sobre a pessoa); mandar só o que o mapeamento alcança
//    seria melhor ainda, mas o mapeamento se decide depois de ver as colunas —
//    e é a prévia que diz quais ficaram de fora.
// 2. **O número da linha é do arquivo, e só quem o leu sabe qual é.** Célula
//    entre aspas pode conter quebra de linha, e aí o terceiro registro não está
//    na quarta linha do texto. O relatório existe para mandar o operador na
//    linha certa (RF-105), então o parser conta linhas físicas enquanto anda.
// 3. **Erro de leitura é da tela, não da borda.** Arquivo vazio, cabeçalho
//    repetido e planilha grande demais se descobrem aqui, sem gastar uma ida ao
//    servidor — e a frase de cada caso está em `app/src/copy/leads-importar.ts`.
//
// A planilha do Excel (`.xlsx`) entra por `lerArquivoDePlanilha`, que
// reconhece o zip pela assinatura e lê a primeira aba por `./xlsx.ts`, sem
// biblioteca (D-08). Daí em diante as regras são as mesmas do CSV: cabeçalho
// na primeira linha, colunas sem nome repetido, teto de linhas.

import type { LinhaLida, PlanilhaLida } from '@importacao/previa.ts'

import { lerXlsx, pareceXlsAntigo, pareceXlsx } from '@/leads/xlsx'

/** O que o seletor de arquivo aceita, e o que a leitura sabe separar. */
export const EXTENSOES_ACEITAS =
  '.csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Quantas linhas de dados a tela aceita mandar de uma vez.
 *
 * A planilha inteira viaja no corpo de um POST e a borda a percorre dentro do
 * tempo de CPU dela (P-05). Cinco mil é folga larga sobre as mil do critério de
 * aceite da F1 e ainda cabe no orçamento; acima disso a tela manda dividir o
 * arquivo, que é honesto, em vez de deixar o pedido morrer no meio.
 */
export const TETO_DE_LINHAS = 5_000

/**
 * Os separadores que a leitura reconhece, na ordem de desempate.
 *
 * O ponto e vírgula está aqui porque o Excel em português exporta CSV com ele
 * quando a vírgula é o separador decimal do sistema — é o arquivo que mais
 * chega, e recusá-lo por não ser "CSV de verdade" mandaria o operador editar a
 * planilha para provar um ponto de formato.
 */
export const SEPARADORES = [',', ';', '\t'] as const

export type Separador = (typeof SEPARADORES)[number]

/**
 * Por que o arquivo não virou planilha. Todos são do arquivo, nunca do
 * conteúdo das linhas: telefone malformado é assunto da prévia, e recusar o
 * arquivo por causa dele tiraria do operador o relatório que diz quais linhas
 * consertar.
 */
export type MotivoDaLeitura =
  | 'arquivo-vazio'
  | 'sem-linhas'
  | 'cabecalho-vazio'
  | 'colunas-repetidas'
  | 'linhas-demais'
  | 'xlsx-ilegivel'
  | 'xls-antigo'

export type LeituraDaPlanilha =
  /** `separador` nulo é a planilha do Excel, que não tem separador. */
  | { ok: true; planilha: PlanilhaLida; separador: Separador | null }
  | { ok: false; motivo: MotivoDaLeitura }

/**
 * Lê o arquivo escolhido, seja qual for o formato: a assinatura decide, não a
 * extensão, porque o nome do arquivo é do operador e o conteúdo é do Excel.
 */
export async function lerArquivoDePlanilha(bytes: Uint8Array): Promise<LeituraDaPlanilha> {
  if (pareceXlsAntigo(bytes)) return { ok: false, motivo: 'xls-antigo' }
  if (!pareceXlsx(bytes)) return lerPlanilha(new TextDecoder().decode(bytes))

  const lida = await lerXlsx(bytes)
  if (!lida.ok) return { ok: false, motivo: lida.motivo }
  const primeira = lida.registros[0]
  if (primeira === undefined) return { ok: false, motivo: 'arquivo-vazio' }
  // Como no CSV: o cabeçalho é a primeira linha, e uma aba que começa em
  // branco promoveria o primeiro lead a nome de coluna.
  if (primeira.numero !== 1) return { ok: false, motivo: 'cabecalho-vazio' }
  return montarPlanilha(lida.registros, null)
}

/** A marca de ordem de bytes que o Excel põe na frente do arquivo. */
const MARCA_DE_BYTES = '﻿'

/**
 * Lê o texto inteiro do arquivo e devolve a planilha, ou o motivo da recusa.
 *
 * O separador sai do cabeçalho: é a primeira linha, é sempre curta e é a única
 * cujo conteúdo se conhece de antemão (nomes de coluna, não dado). Contar
 * ocorrências no arquivo inteiro faria uma coluna de endereço cheia de vírgulas
 * decidir por um arquivo separado por tabulação.
 */
export function lerPlanilha(texto: string): LeituraDaPlanilha {
  const conteudo = texto.startsWith(MARCA_DE_BYTES) ? texto.slice(1) : texto
  if (conteudo.trim() === '') return { ok: false, motivo: 'arquivo-vazio' }

  const separador = separadorDe(conteudo)

  // O cabeçalho se confere na primeira linha física, e não no primeiro
  // registro: registro em branco é descartado pelo parser, e um arquivo que
  // começa com `,,` promoveria a primeira linha de dados a cabeçalho em
  // silêncio — com o nome do primeiro lead virando nome de coluna.
  if (vazia(primeiraLinhaFisica(conteudo), separador)) {
    return { ok: false, motivo: 'cabecalho-vazio' }
  }

  return montarPlanilha(separarRegistros(conteudo, separador), separador)
}

/** Das linhas lidas à planilha: as regras de cabeçalho e de teto dos dois formatos. */
function montarPlanilha(
  registros: readonly RegistroLido[],
  separador: Separador | null,
): LeituraDaPlanilha {
  const cabecalho = registros[0]
  if (cabecalho === undefined) return { ok: false, motivo: 'arquivo-vazio' }

  const colunas = cabecalho.celulas.map((celula) => celula.trim())
  if (new Set(colunas).size !== colunas.length) {
    return { ok: false, motivo: 'colunas-repetidas' }
  }

  const linhas: LinhaLida[] = registros.slice(1).map((registro) => ({
    numero: registro.numero,
    celulas: Object.fromEntries(
      colunas.map((coluna, posicao) => [coluna, registro.celulas[posicao] ?? '']),
    ),
  }))

  if (linhas.length === 0) return { ok: false, motivo: 'sem-linhas' }
  if (linhas.length > TETO_DE_LINHAS) return { ok: false, motivo: 'linhas-demais' }

  return { ok: true, planilha: { colunas, linhas }, separador }
}

/**
 * O separador do cabeçalho: o que mais aparece fora de aspas na primeira
 * linha. Empate cai no primeiro da lista, que é a vírgula — planilha de uma
 * coluna só não tem separador nenhum, e aí a escolha não muda o resultado.
 */
export function separadorDe(texto: string): Separador {
  const primeira = primeiraLinhaFisica(texto)

  let escolhido: Separador = SEPARADORES[0]
  let maior = 0
  for (const candidato of SEPARADORES) {
    const quantos = contarFora(primeira, candidato)
    if (quantos > maior) {
      maior = quantos
      escolhido = candidato
    }
  }
  return escolhido
}

/** Linha sem nada além de separadores e aspas: não nomeia coluna nenhuma. */
function vazia(linha: string, separador: Separador): boolean {
  return linha.replaceAll('"', '').replaceAll(separador, '').trim() === ''
}

/** A primeira linha do texto, cortada no primeiro fim de linha fora de aspas. */
function primeiraLinhaFisica(texto: string): string {
  let dentroDeAspas = false
  for (let posicao = 0; posicao < texto.length; posicao += 1) {
    const caractere = texto[posicao]
    if (caractere === '"') dentroDeAspas = !dentroDeAspas
    else if (!dentroDeAspas && (caractere === '\n' || caractere === '\r')) {
      return texto.slice(0, posicao)
    }
  }
  return texto
}

function contarFora(linha: string, separador: Separador): number {
  let dentroDeAspas = false
  let quantos = 0
  for (const caractere of linha) {
    if (caractere === '"') dentroDeAspas = !dentroDeAspas
    else if (!dentroDeAspas && caractere === separador) quantos += 1
  }
  return quantos
}

/** Um registro do arquivo: as células e a linha física em que ele começa. */
interface RegistroLido {
  readonly numero: number
  readonly celulas: readonly string[]
}

/**
 * O parser, no formato que o CSV realmente tem (RFC 4180): campo entre aspas
 * pode conter o separador, a quebra de linha e a própria aspa, escrita duas
 * vezes. Um `split` por linha e por vírgula quebraria na primeira planilha com
 * endereço dentro de aspas, e quebraria em silêncio: o telefone iria para a
 * coluna errada e a prévia acusaria mil linhas inválidas.
 *
 * Registro em que toda célula está vazia é descartado: é a linha em branco no
 * fim do arquivo, e contá-la faria a prévia acusar um telefone vazio que
 * ninguém escreveu.
 */
function separarRegistros(texto: string, separador: Separador): RegistroLido[] {
  const registros: RegistroLido[] = []
  let celulas: string[] = []
  let celula = ''
  let dentroDeAspas = false
  let linha = 1
  let linhaDoRegistro = 1

  function fecharRegistro() {
    celulas.push(celula)
    celula = ''
    if (celulas.some((valor) => valor.trim() !== '')) {
      registros.push({ numero: linhaDoRegistro, celulas })
    }
    celulas = []
    linhaDoRegistro = linha
  }

  for (let posicao = 0; posicao < texto.length; posicao += 1) {
    // O índice está dentro do texto, mas `noUncheckedIndexedAccess` não sabe
    // disso; o `continue` é para o compilador, e nunca acontece.
    const caractere = texto[posicao]
    if (caractere === undefined) continue

    if (dentroDeAspas) {
      if (caractere === '"') {
        // Aspa dobrada é aspa literal; sozinha, fecha o campo.
        if (texto[posicao + 1] === '"') {
          celula += '"'
          posicao += 1
        } else dentroDeAspas = false
        continue
      }
      if (caractere === '\n') linha += 1
      celula += caractere
      continue
    }

    if (caractere === '"') {
      dentroDeAspas = true
      continue
    }
    if (caractere === separador) {
      celulas.push(celula)
      celula = ''
      continue
    }
    if (caractere === '\r') continue
    if (caractere === '\n') {
      linha += 1
      fecharRegistro()
      continue
    }
    celula += caractere
  }

  // O arquivo pode terminar sem quebra de linha, e aí o último registro está
  // pendurado no acumulador.
  if (celula !== '' || celulas.length > 0) fecharRegistro()

  return registros
}

/**
 * Escreve um CSV a partir das colunas e das linhas já em texto. É o caminho de
 * volta: a lista de erros do relatório vira arquivo por aqui, com o mesmo
 * escape que a leitura desfaz.
 */
export function escreverCsv(
  colunas: readonly string[],
  linhas: readonly (readonly string[])[],
): string {
  return [colunas, ...linhas]
    .map((linha) => linha.map(escapar).join(','))
    .join('\n')
}

/** Aspas em volta só quando o valor as exige, para o arquivo continuar legível. */
function escapar(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor
}
