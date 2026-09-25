// O portão da fatia: o que falta para a conta ligar para lead real (L-03,
// O-02, RF-912).
//
// Quem aplica o portão é `guard_dial`, no passo 2, e esta regra não o
// substitui: ela existe para que duas pontas que PRECISAM dizer a mesma coisa
// sobre ele não escrevam duas versões dela. A borda (`guarda.ts`) diz na recusa
// o que falta; o discador (`app/src/chamadas/portao.ts`) só oferece número de
// teste enquanto falta alguma coisa. Se cada uma decidisse sozinha, a tela
// poderia oferecer um número que a guarda recusa, ou esconder um que ela
// aceitaria.
//
// **As duas condições são E.** O portão abre quando a fase liberou a discagem
// real (`feature_flags.real_dialing`, que só a migração da F3 liga) E a conta
// completou uma ligação de teste com transcrição (`first_test_call_ok_at`,
// preenchida por `call-finalize`). Uma sem a outra não abre: a bandeira sem a
// ligação de teste deixaria uma conta mal configurada estrear num cliente, e a
// ligação de teste sem a bandeira abriria a F3 antes de ela existir.
//
// Módulo portável: sem Deno, sem rede, sem banco. O retorno é código, e a frase
// fica em quem exibe.

/** O que falta para o portão abrir, em código estável. */
export type FaltaNoPortao = 'liberacao_da_fase' | 'primeira_chamada_de_teste'

/** O estado do portão como a conta o guarda. */
export interface EstadoDoPortao {
  /** `accounts.feature_flags.real_dialing`. */
  readonly realDialing: boolean
  /** `accounts.first_test_call_ok_at`, em ISO-8601, ou nulo. */
  readonly primeiraChamadaDeTesteEm: string | null
}

/**
 * O que ainda falta, na ordem em que as coisas acontecem: a liberação da fase
 * primeiro, a ligação de teste depois. Lista vazia é portão aberto.
 */
export function faltaParaAbrir(estado: EstadoDoPortao): readonly FaltaNoPortao[] {
  const falta: FaltaNoPortao[] = []
  if (estado.realDialing !== true) falta.push('liberacao_da_fase')
  if (!estado.primeiraChamadaDeTesteEm) falta.push('primeira_chamada_de_teste')
  return falta
}

/** Portão aberto: as duas condições, e não uma delas. */
export function portaoAberto(estado: EstadoDoPortao): boolean {
  return faltaParaAbrir(estado).length === 0
}
