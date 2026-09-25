// As decisões puras da lista de bloqueio: normalizar o que se digita, ler a
// lista colada, montar a prévia da importação, recortar a lista e escrever a
// remoção. Nada aqui toca React, rede nem Supabase, e é por isso que tudo se
// prova em `lista.test.ts`.
//
// Três regras estruturam o arquivo:
//
// 1. **Número se grava normalizado.** O passo 3 da guarda compara
//    `dnc_entries.phone_e164` com `leads.phone_e164` por igualdade, e o lead
//    foi normalizado por `@compartilhado/telefone.ts`. Gravar `(48) 99999-8888`
//    como veio faria o bloqueio aparecer na tela e não pegar na hora de discar.
// 2. **A prévia não grava, e a confirmação não confia nela.** `preverImportacao`
//    é função do texto e dos bloqueios ativos; a confirmação chama a mesma
//    função de novo com o texto cru, em vez de receber a prévia pronta do
//    navegador — a lista ativa pode ter mudado entre as duas.
// 3. **Remover é `update`.** `remocaoDoBloqueio` devolve as colunas do
//    `update`, e é o mesmo objeto que o serviço manda e que o dublê aplica. Um
//    `delete` apagaria a linha e a resposta a "quem tirou este número do
//    bloqueio, e por quê?".

import {
  normalizarTelefone,
  type MotivoDeRecusa,
} from '@compartilhado/telefone.ts'

import type {
  Bloqueio,
  InclusaoDeBloqueio,
  LinhaInvalida,
  PreviaDaImportacao,
  RecorteDeBloqueios,
} from '@/bloqueios/tipos'

/** O recorte com que a tela abre: os bloqueios que valem agora. */
export const RECORTE_INICIAL: RecorteDeBloqueios = { estado: 'ativo', origem: 'todas' }

/** O mesmo teto de linhas da importação de leads. */
export const TETO_DA_LISTA = 5_000

export interface CamposDaInclusao {
  numero: string
  motivo: string
}

export const INCLUSAO_EM_BRANCO: CamposDaInclusao = { numero: '', motivo: '' }

export interface RecusasDaInclusao {
  numero?: MotivoDeRecusa
  motivo?: true
}

export type InclusaoValidada =
  | { ok: true; dados: InclusaoDeBloqueio }
  | { ok: false; recusas: RecusasDaInclusao }

/** Motivo em branco não vale: é o que a tela mostra quando perguntam por quê. */
export function motivoValido(motivo: string): boolean {
  return motivo.trim().length > 0
}

export function validarInclusao(campos: CamposDaInclusao): InclusaoValidada {
  const telefone = normalizarTelefone(campos.numero)
  const recusas: RecusasDaInclusao = {}

  if (!telefone.ok) recusas.numero = telefone.motivo
  if (!motivoValido(campos.motivo)) recusas.motivo = true

  if (!telefone.ok || recusas.motivo) return { ok: false, recusas }
  return { ok: true, dados: { e164: telefone.e164, motivo: campos.motivo.trim() } }
}

const SEPARADOR_DE_CELULA = /[,;\t]/
const TEM_DIGITO = /\d/

/**
 * As linhas da lista colada ou do arquivo, com a posição de cada uma.
 *
 * Cada linha vale pela primeira célula, para uma planilha exportada com o
 * número na primeira coluna entrar sem edição. Linha em branco não conta, e a
 * primeira linha sem dígito nenhum é cabeçalho ("telefone"), não número
 * inválido.
 */
export function lerLista(texto: string): { linha: number; bruto: string }[] {
  const linhas: { linha: number; bruto: string }[] = []
  let primeiraVista = false

  texto.split(/\r?\n/).forEach((conteudo, indice) => {
    const bruto = (conteudo.split(SEPARADOR_DE_CELULA)[0] ?? '').trim()
    if (bruto === '') return

    const ehPrimeira = !primeiraVista
    primeiraVista = true
    if (ehPrimeira && !TEM_DIGITO.test(bruto)) return

    linhas.push({ linha: indice + 1, bruto })
  })

  return linhas
}

/**
 * A prévia: quem entra, quem não é número e quem já está bloqueado.
 *
 * As três listas mais os repetidos fecham a conta das linhas lidas, como o
 * relatório da importação de leads: desfecho que não soma esconde linha.
 */
export function preverImportacao(
  texto: string,
  ativos: Iterable<string>,
): PreviaDaImportacao {
  const bloqueados = new Set(ativos)
  const vistos = new Set<string>()
  const validos: string[] = []
  const invalidos: LinhaInvalida[] = []
  const jaBloqueados: string[] = []
  let repetidos = 0

  for (const { linha, bruto } of lerLista(texto)) {
    const telefone = normalizarTelefone(bruto)
    if (!telefone.ok) {
      invalidos.push({ linha, bruto, motivo: telefone.motivo })
      continue
    }

    if (vistos.has(telefone.e164)) {
      repetidos += 1
      continue
    }
    vistos.add(telefone.e164)

    if (bloqueados.has(telefone.e164)) jaBloqueados.push(telefone.e164)
    else validos.push(telefone.e164)
  }

  return { validos, invalidos, jaBloqueados, repetidos }
}

/** Linhas que a prévia leu. É o total com que a tela abre o resumo. */
export function linhasLidas(previa: PreviaDaImportacao): number {
  return (
    previa.validos.length +
    previa.invalidos.length +
    previa.jaBloqueados.length +
    previa.repetidos
  )
}

/**
 * As colunas do `update` da remoção. Quem removeu não vai aqui: o gatilho
 * `carimbar_autoria_do_bloqueio` escreve `auth.uid()` e descartaria o que o
 * cliente mandasse.
 */
export function remocaoDoBloqueio(
  motivo: string,
  agora: Date,
): { removed_at: string; removal_reason: string } {
  return { removed_at: agora.toISOString(), removal_reason: motivo.trim() }
}

export function estadoDoBloqueio(bloqueio: Bloqueio): 'ativo' | 'removido' {
  return bloqueio.removidoEm === null ? 'ativo' : 'removido'
}

/** O recorte em memória; o serviço aplica o mesmo na consulta. */
export function aplicarRecorte(
  bloqueios: readonly Bloqueio[],
  recorte: RecorteDeBloqueios,
): Bloqueio[] {
  return bloqueios.filter(
    (bloqueio) =>
      estadoDoBloqueio(bloqueio) === recorte.estado &&
      (recorte.origem === 'todas' || bloqueio.origem === recorte.origem),
  )
}

export function recorteEhInicial(recorte: RecorteDeBloqueios): boolean {
  return (
    recorte.estado === RECORTE_INICIAL.estado && recorte.origem === RECORTE_INICIAL.origem
  )
}
