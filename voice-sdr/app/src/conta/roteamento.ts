// Regras da tela de roteamento, sem React: o que a tela recusa antes do banco
// e como a recusa do banco vira motivo.
//
// A tela é a primeira linha; o check `account_settings_destino_do_modo` e o
// gatilho `guardar_destino_do_roteamento` são a segunda. As duas linhas
// devolvem o mesmo vocabulário, para a frase ser uma só venha a recusa de onde
// vier.

import type {
  EspecialistaDoRoteamento,
  ModoDeRoteamento,
  MotivoDeFalhaDoRoteamento,
  RoteamentoDaConta,
} from '@/conta/tipos'

/** A ordem em que a tela oferece os modos. */
export const MODOS_DE_ROTEAMENTO: readonly ModoDeRoteamento[] = ['area', 'round_robin', 'fixed']

/** Só quem está ativo pode virar destino do modo fixo. */
export function especialistasEscolhiveis(
  especialistas: readonly EspecialistaDoRoteamento[],
): EspecialistaDoRoteamento[] {
  return especialistas.filter((especialista) => especialista.ativo)
}

/** O que vai para o banco: fora do modo fixo, o destino é sempre nulo. */
export function normalizarRoteamento(rascunho: RoteamentoDaConta): RoteamentoDaConta {
  return rascunho.modo === 'fixed'
    ? { modo: 'fixed', especialistaFixoId: rascunho.especialistaFixoId || null }
    : { modo: rascunho.modo, especialistaFixoId: null }
}

/** Houve mudança em relação ao que está gravado. */
export function roteamentoMudou(gravado: RoteamentoDaConta, rascunho: RoteamentoDaConta): boolean {
  const normalizado = normalizarRoteamento(rascunho)
  return (
    normalizado.modo !== gravado.modo ||
    normalizado.especialistaFixoId !== gravado.especialistaFixoId
  )
}

/**
 * A recusa da tela, antes do banco. O destino inativo só é recusado quando
 * muda, como no gatilho: quem foi desativado depois de virar destino não trava
 * a troca para outro modo.
 */
export function validarRoteamento(
  gravado: RoteamentoDaConta,
  rascunho: RoteamentoDaConta,
  especialistas: readonly EspecialistaDoRoteamento[],
): MotivoDeFalhaDoRoteamento | null {
  const normalizado = normalizarRoteamento(rascunho)
  if (normalizado.modo !== 'fixed') return null
  if (!normalizado.especialistaFixoId) return 'fixo-sem-especialista'
  if (normalizado.especialistaFixoId === gravado.especialistaFixoId) return null

  const destino = especialistas.find((item) => item.id === normalizado.especialistaFixoId)
  if (!destino) return 'especialista-de-outra-conta'
  if (!destino.ativo) return 'especialista-inativo'
  return null
}

/** Código que o gatilho de destino põe no começo da mensagem. */
const CODIGO_DO_GATILHO: ReadonlyMap<string, MotivoDeFalhaDoRoteamento> = new Map([
  ['especialista_inativo', 'especialista-inativo'],
  ['especialista_de_outra_conta', 'especialista-de-outra-conta'],
])

/**
 * A recusa do banco no vocabulário da tela. O código do gatilho se reconhece
 * por palavra inteira da `message`; o check, pelo nome da restrição. A
 * mensagem do Postgres nunca chega à tela.
 */
export function classificarFalhaDoRoteamento(
  erro: { code?: string; message?: string } | null,
): MotivoDeFalhaDoRoteamento {
  const mensagem = erro?.message ?? ''
  for (const [codigo, motivo] of CODIGO_DO_GATILHO) {
    if (new RegExp(`(?<![\\w])${codigo}(?![\\w])`).test(mensagem)) return motivo
  }
  if (erro?.code === '23514' && mensagem.includes('account_settings_destino_do_modo')) {
    return 'fixo-sem-especialista'
  }
  if (erro?.code === '42501' || /row-level security/i.test(mensagem)) return 'sem-permissao'
  return 'falha-de-comunicacao'
}
