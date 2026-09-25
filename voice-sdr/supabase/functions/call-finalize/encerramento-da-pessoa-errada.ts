// A conferência das duas falas no encerramento de pessoa errada (RF-422, US-109).
//
// A camada 1 manda a Sarah encerrar em no máximo duas falas quando percebe que
// não fala com a pessoa certa: pedir desculpa, chamar `tool-dnc` com
// `reason='wrong_number'`, despedir-se e chamar `end_call`. Instrução ao modelo
// não é garantia, e este módulo é o que torna a desobediência **visível**: ele
// conta, sobre a transcrição, as falas da Sarah do turno em que `tool-dnc` com
// `wrong_number` foi chamada até o turno em que `end_call` foi chamada, os dois
// inclusive. Mesma fala dá 1; a fala seguinte dá 2; a terceira dá 3, e três é
// divergência.
//
// **A régua é o instante, e não a posição no array.** A leitura do provedor
// devolve turnos e invocações com o segundo do turno, e os turnos podem vir
// fora de ordem (ver a fixture "pessoa errada" de `transcricoes-de-exemplo.ts`).
// Conta-se fala da Sarah com o segundo dentro de `[tool-dnc, end_call]`.
//
// **Sem `end_call`**, conta-se até o fim da transcrição: a pessoa pode ter
// desligado primeiro, e aí duas falas ou menos continuam conformes; três ou
// mais sem encerrar é a Sarah falando com quem não era o alvo. O resultado diz
// se houve `end_call`, para a ficha não confundir os dois casos. `end_call` que
// voltou com erro não encerrou, e não conta como encerramento — a mesma régua
// de `lerFim`.
//
// **O que é fala da Sarah entra por parâmetro** (`ehFalaDaSarah`). A
// finalização passa `FALA_DA_SARAH`, o turno com papel de agente; o módulo só
// conhece a `ConversaDoProvedor` que o adaptador do formato montou.
//
// **A divergência não abre item na fila nesta fatia.** A fila mínima da F3 tem
// três gêneros (pedido de humano, pedido de bloqueio, falha repetida), e
// avaliação reprovada como gatilho de item é da F4 (RF-909, RF-915). Quando a
// F4 chegar, o gancho entra em `finalizacao.ts`, logo depois de
// `registrarMedicaoDaAvaliacao`, lendo `conforme === false` deste resultado —
// e não aqui, que continua sendo só medição.
//
// O que não se prova em processo: que o modelo do provedor obedeça à camada 1.
// Isso é conversa real contra o provedor, dívida do degrau 3 e da suíte de
// contrato. O que fecha aqui é a medição.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { origemDoMotivo } from '../tool-dnc/bloqueio.ts'

import type { ConversaDoProvedor, TurnoDaConversa } from './formato-do-provedor.ts'

/**
 * O teto de falas da Sarah no encerramento de pessoa errada: RF-422, "encerra
 * cordialmente em até duas falas". Mudar o número é mudar este lugar só.
 */
export const LIMITE_DE_FALAS_NA_PESSOA_ERRADA = 2

/** A chave do critério em `calls.evaluation.medicoes`. */
export const CRITERIO_DO_ENCERRAMENTO = 'encerramento_pessoa_errada'

/** O requisito que a medição confere, gravado junto do número. */
export const REQUISITO_DO_ENCERRAMENTO = 'RF-422'

/** A fala da Sarah é o turno com papel de agente. */
export const FALA_DA_SARAH = (turno: TurnoDaConversa): boolean => turno.quem === 'agent'

export type MedicaoDoEncerramento =
  | { readonly aplica: false }
  | {
      readonly aplica: true
      /** Falas da Sarah de `tool-dnc` até `end_call` (ou até o fim), inclusive. */
      readonly falas: number
      readonly conforme: boolean
      /** Falso quando a conversa terminou sem `end_call` bem-sucedida. */
      readonly encerrouComEndCall: boolean
    }

/**
 * Mede a conversa. `aplica: false` quando nenhuma `tool-dnc` com
 * `wrong_number` foi chamada: sem a identificação, não há o que conferir.
 */
export function medirEncerramentoDaPessoaErrada(
  conversa: Pick<ConversaDoProvedor, 'turnos' | 'invocacoes'>,
  ehFalaDaSarah: (turno: TurnoDaConversa) => boolean,
): MedicaoDoEncerramento {
  const identificacoes = conversa.invocacoes
    .filter((invocacao) => invocacao.nome === 'tool-dnc' && origemDoMotivo(invocacao.parametros.reason) === 'wrong_number')
    .map((invocacao) => invocacao.segundo)
  if (identificacoes.length === 0) return { aplica: false }

  const inicio = Math.min(...identificacoes)
  const encerramentos = conversa.invocacoes
    .filter((invocacao) => invocacao.nome === 'end_call' && invocacao.erro === null && invocacao.segundo >= inicio)
    .map((invocacao) => invocacao.segundo)
  const encerrouComEndCall = encerramentos.length > 0
  const fim = encerrouComEndCall ? Math.min(...encerramentos) : Number.POSITIVE_INFINITY

  const falas = conversa.turnos.filter(
    (turno) => ehFalaDaSarah(turno) && turno.segundo >= inicio && turno.segundo <= fim,
  ).length

  return { aplica: true, falas, conforme: falas <= LIMITE_DE_FALAS_NA_PESSOA_ERRADA, encerrouComEndCall }
}

/** O que se grava em `calls.evaluation.medicoes.encerramento_pessoa_errada`. */
export function divergenciaGravada(
  medicao: Extract<MedicaoDoEncerramento, { aplica: true }>,
): Readonly<Record<string, unknown>> {
  return {
    conforme: false,
    falas: medicao.falas,
    limite: LIMITE_DE_FALAS_NA_PESSOA_ERRADA,
    encerrou_com_end_call: medicao.encerrouComEndCall,
    requisito: REQUISITO_DO_ENCERRAMENTO,
  }
}
