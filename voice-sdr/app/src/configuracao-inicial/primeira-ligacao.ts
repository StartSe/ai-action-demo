/**
 * As decisões do passo da primeira ligação de teste, fora do componente: que
 * passo anterior resolve uma recusa e em que ponto a ligação está.
 *
 * O passo não tem caminho próprio até `call-place`. Ele liga pelo serviço de
 * chamadas, com a mesma trava do discador (`bloqueioAntesDeDiscar`), e lê o
 * andamento pela loja de `chamadas/ao-vivo.ts`. O que mora aqui é só o que o
 * tutorial sabe e o discador não: qual passo do assistente cuida de cada
 * recusa.
 */

import {
  dentroDaJanela,
  fraseDaJanela,
  fraseDaProximaAbertura,
} from '@compartilhado/discagem/janela.ts'

import type { EstadoAoVivo } from '@/chamadas/ao-vivo'
import type { ChamadaAoVivo } from '@/chamadas/tipos'
import type { PassoId } from '@/configuracao-inicial/tipos'

/**
 * O passo do assistente que resolve cada recusa de `call-place`. As chaves são
 * os motivos da guarda (`_shared/discagem/guarda.ts`) e os da borda
 * (`call-place/respostas.ts`); a frase continua sendo a que chega pronta.
 *
 * Recusa sem entrada não tem passo que a resolva: o freio se solta pelo aviso
 * da casca, o número bloqueado sai da lista em Bloqueios, e a guarda fora do ar
 * não é configuração.
 */
const PASSO_QUE_RESOLVE: Readonly<Record<string, PassoId>> = {
  // A lista de teste e a política da linha vêm com o passo do número. Fora da
  // janela não entra aqui (D-11): o passo do número não tem nada de errado, e
  // a recusa diz quando a janela abre e aponta Discagem.
  portao_de_lead_real: 'numero',
  intervalo_minimo: 'numero',
  teto_por_numero: 'numero',
  teto_da_conta: 'numero',
  teto_de_gasto: 'numero',
  sem_linha_disponivel: 'numero',
  linha_sem_registro: 'numero',
  sem_publicacao: 'roteiro',
  sem_playbook: 'roteiro',
  sem_credencial_de_voz: 'credenciais',
  voz_bloqueada: 'credenciais',
}

export function passoQueResolve(motivo: string): PassoId | null {
  return Object.hasOwn(PASSO_QUE_RESOLVE, motivo)
    ? (PASSO_QUE_RESOLVE[motivo] ?? null)
    : null
}

/** O motivo da guarda para a ligação fora da janela de discagem. */
export const FORA_DA_JANELA = 'fora_da_janela'

/**
 * A ligação de teste também respeita a janela de discagem (D-11). O número de
 * teste não tem lead, e a guarda lê a janela no fuso da conta. Nulo quando está
 * dentro, ou quando a janela não se lê: aí quem decide é a guarda.
 */
export function foraDaJanelaDoTeste(
  janela: unknown,
  fusoDaConta: string,
  agora: string,
): { janela: string; abre: string | null } | null {
  const situacao = dentroDaJanela(janela, agora, fusoDaConta)
  if (situacao.dentro || situacao.motivo === 'janela_invalida') return null
  const entrada = { janela, instante: agora, fusoDoLead: fusoDaConta, fusoDaConta }
  return { janela: fraseDaJanela(entrada), abre: fraseDaProximaAbertura(entrada) }
}

/**
 * Em que ponto a ligação pedida está, pela assinatura de `call_live`.
 *
 * `call_live` é mantida por gatilho na mesma transação que muda `calls`
 * (migração 20260922070000): quando `call-place` responde, a linha já existe.
 * Então a chamada que não está na lista acabou, mesmo que a tela nunca a tenha
 * visto em curso.
 */
export type FaseDaLigacao =
  | { fase: 'conectando' }
  | { fase: 'erro' }
  | { fase: 'em-curso'; chamada: ChamadaAoVivo }
  | { fase: 'encerrada' }

export function faseDaLigacao(
  estado: EstadoAoVivo,
  chamadaId: string,
): FaseDaLigacao {
  if (estado.fase === 'carregando') return { fase: 'conectando' }
  if (estado.fase === 'erro') return { fase: 'erro' }
  const chamada = estado.chamadas.find((cada) => cada.chamadaId === chamadaId)
  return chamada ? { fase: 'em-curso', chamada } : { fase: 'encerrada' }
}
