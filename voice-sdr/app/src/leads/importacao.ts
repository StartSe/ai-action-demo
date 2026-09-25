// As decisões puras da tela de importação (RF-101, RF-103, RF-104, RF-105).
// Nada aqui toca React nem rede, e é por isso que tudo se prova em
// `importacao.test.ts`.
//
// O que não está aqui é tão importante quanto o que está: **a classificação das
// linhas não é desta camada**. Quantas entram, quantas ficam de fora e quantas
// repetem é o que `montarPrevia` responde na borda, com a base à vista, e a
// tela desenha o que veio. Uma segunda contagem aqui produziria números que
// combinam com a tela e divergem do que será gravado — que é exatamente o
// engano que a prévia existe para evitar.

import type {
  CampoDoLead,
  LinhaDaPrevia,
  MapeamentoResolvido,
  PlanilhaLida,
  Previa,
} from '@importacao/previa.ts'
import { CAMPOS_DO_LEAD } from '@importacao/previa.ts'
import type { RelatorioDaImportacao } from '@importacao/confirmacao.ts'

import type { FrasesDaImportacao } from '@/leads/tipos'

/** O arquivo depois de lido: o que a confirmação precisa, e as linhas. */
export interface ArquivoLido {
  nome: string
  /** Do conteúdo, não do nome: é ele que responde "isto já foi importado?". */
  hash: string
  planilha: PlanilhaLida
}

/** Quantas linhas o mapeamento mostra para conferência (RF-101). */
export const LINHAS_DA_AMOSTRA = 3

/**
 * O hash do conteúdo do arquivo, em hexadecimal.
 *
 * SHA-256 pelo `crypto.subtle` do navegador. Ele não existe em origem
 * insegura, e aí o cálculo cai num FNV-1a de 64 bits **com o nome na frente**:
 * o payload do evento diz qual função produziu aquele texto, em vez de deixar
 * dois formatos se passarem um pelo outro na hora de comparar duas
 * importações.
 */
export async function hashDoArquivo(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const digestor = globalThis.crypto.subtle as SubtleCrypto | undefined

  if (digestor === undefined) return `fnv1a-${fnv1a(texto)}`

  const resumo = await digestor.digest('SHA-256', bytes)
  return [...new Uint8Array(resumo)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** FNV-1a de 64 bits, o suficiente para dizer que dois arquivos diferem. */
function fnv1a(texto: string): string {
  let hash = 0xcbf2_9ce4_8422_2325n
  for (const caractere of texto) {
    hash ^= BigInt(caractere.codePointAt(0) ?? 0)
    hash = BigInt.asUintN(64, hash * 0x100_0000_01b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

/** Os campos que o mapeamento alcança, na ordem do lead. */
export function camposMapeados(
  mapeamento: MapeamentoResolvido,
): readonly CampoDoLead[] {
  return CAMPOS_DO_LEAD.filter((campo) => mapeamento[campo] !== null)
}

/** Sem coluna de telefone não há o que importar: toda linha cairia em erro. */
export function podeVerPrevia(mapeamento: MapeamentoResolvido): boolean {
  return mapeamento.telefone !== null
}

/** Uma linha da amostra: o número no arquivo e o que cada campo receberia. */
export interface LinhaDaAmostra {
  readonly numero: number
  readonly valores: Readonly<Partial<Record<CampoDoLead, string>>>
}

/**
 * As primeiras linhas já vistas pelo mapeamento, para a conferência do passo 2.
 *
 * Mostra o que a planilha traz, sem normalizar: o telefone aparece como está
 * escrito no arquivo, porque o que se confere aqui é se a **coluna** é a certa.
 * O número que será gravado é assunto da prévia, que o normaliza de verdade.
 */
export function amostraDoMapeamento(
  planilha: PlanilhaLida,
  mapeamento: MapeamentoResolvido,
  quantas: number = LINHAS_DA_AMOSTRA,
): readonly LinhaDaAmostra[] {
  return planilha.linhas.slice(0, quantas).map((linha) => ({
    numero: linha.numero,
    valores: Object.fromEntries(
      camposMapeados(mapeamento).map((campo) => [
        campo,
        (linha.celulas[mapeamento[campo] ?? ''] ?? '').trim(),
      ]),
    ),
  }))
}

/**
 * As linhas da prévia nos três grupos que a tela mostra, na ordem do arquivo.
 *
 * Os dois tipos de duplicata andam juntos aqui e separados no texto de cada
 * linha: o critério de aceite conta "duplicados" como um número só, e quem lê
 * precisa saber se a repetição é da planilha ou da base para decidir o que
 * fazer.
 */
export interface GruposDaPrevia {
  readonly validos: readonly LinhaDaPrevia[]
  readonly invalidos: readonly LinhaDaPrevia[]
  readonly duplicados: readonly LinhaDaPrevia[]
}

export function agruparPrevia(previa: Previa): GruposDaPrevia {
  return {
    validos: previa.linhas.filter((linha) => linha.situacao === 'valido'),
    invalidos: previa.linhas.filter((linha) => linha.situacao === 'invalido'),
    duplicados: previa.linhas.filter(
      (linha) =>
        linha.situacao === 'duplicado_no_arquivo' ||
        linha.situacao === 'duplicado_na_base',
    ),
  }
}

/**
 * A lista de erros do relatório em linhas de planilha: número e motivo por
 * extenso (RF-105).
 *
 * A frase vem do dicionário que a resposta trouxe. Motivo sem frase — código
 * novo no servidor, versão antiga na tela — cai no próprio código em vez de
 * numa célula vazia: quem abre o arquivo consegue procurar por ele.
 */
export function linhasComErro(
  relatorio: RelatorioDaImportacao,
  frases: FrasesDaImportacao,
): readonly (readonly string[])[] {
  return relatorio.linhas
    .filter((linha) => linha.resultado === 'erro')
    .map((linha) => [
      String(linha.numero),
      linha.motivo === null ? '' : (frases[linha.motivo] ?? linha.motivo),
    ])
}

/**
 * A chave de cache da prévia: o arquivo mais o mapeamento em vigor. Trocar uma
 * coluna precisa refazer a prévia, e o objeto do mapeamento muda de identidade
 * a cada desenho — sem esta forma estável, a consulta sairia de novo a cada
 * troca de estado da tela.
 */
export function chaveDoMapeamento(mapeamento: MapeamentoResolvido): string {
  return CAMPOS_DO_LEAD.map((campo) => `${campo}=${mapeamento[campo] ?? ''}`).join('|')
}
