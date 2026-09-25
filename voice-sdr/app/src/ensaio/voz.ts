// O modo voz do ensaio, na parte que se prova sem navegador (US-115).
//
// **O MICROFONE FICA ATRÁS DE UM CONTRATO.** jsdom não tem microfone nem
// WebRTC, e a lógica do modo voz não pode depender do navegador para ser
// provada. A tela pede a permissão a `MicrofoneDoEnsaio`, que o teste dubla; a
// implementação de verdade (`criarMicrofoneDoNavegador`) recebe a
// `mediaDevices` por parâmetro, e por isso também roda em jsdom com um dublê.
// O áudio da conversa continua com o condutor (`sarah/condutor-elevenlabs.ts`).
//
// **A PERMISSÃO VEM ANTES DA SESSÃO.** A tela só pede a `rehearsal-session`
// depois que o microfone foi liberado: microfone negado não cria chamada de
// ensaio nenhuma, e não há linha para fechar depois.
//
// **A SESSÃO É A MESMA DO TEXTO** (T-16). O modo voz não abre caminho
// paralelo: é `rehearsal-session` com `mode='voice'`, contra a mesma
// publicação do propósito.
//
// **O QUE NÃO RODA NO LAÇO, E FICA PARA O DEGRAU 3:** a captura de microfone de
// verdade, o áudio tocando no navegador e a sessão de voz contra o provedor.
// Tudo isso abre permissão do sistema e depende de rede.

import type { EstadoDaConversa } from '@/sarah/ensaio'

/** O que o navegador respondeu ao pedido do microfone. */
export type PermissaoDoMicrofone = 'liberado' | 'negado' | 'sem_microfone'

/** Quem pede o microfone. `criarMicrofoneDoNavegador` o implementa. */
export interface MicrofoneDoEnsaio {
  pedir(): Promise<PermissaoDoMicrofone>
}

/**
 * Onde o modo voz está. `sem_permissao` e `sem_microfone` são estados de tela,
 * com explicação e saída, e não erro cru. `encerrado` é terminal: um evento do
 * provedor que chega atrasado não reabre o microfone na tela.
 */
export type EstadoDaVoz =
  | 'pedindo_permissao'
  | 'sem_permissao'
  | 'sem_microfone'
  | 'conectando'
  | 'ouvindo'
  | 'falando'
  | 'encerrado'

export type EventoDaVoz =
  | { tipo: 'pedir' }
  | { tipo: 'permissao'; resultado: PermissaoDoMicrofone }
  | { tipo: 'conversa'; estado: EstadoDaConversa }
  | { tipo: 'encerrar' }

const EM_CONVERSA: ReadonlySet<EstadoDaVoz> = new Set(['conectando', 'ouvindo', 'falando'])

/** A máquina de estados do modo voz. `null` é o modo voz ainda não começado. */
export function avancarVoz(atual: EstadoDaVoz | null, evento: EventoDaVoz): EstadoDaVoz | null {
  switch (evento.tipo) {
    case 'pedir':
      return 'pedindo_permissao'

    case 'permissao':
      // O condutor pode ter o microfone recusado já conectando, quando a
      // permissão é revogada entre o pedido e a sessão.
      if (atual !== 'pedindo_permissao' && atual !== 'conectando') return atual
      if (evento.resultado === 'negado') return 'sem_permissao'
      if (evento.resultado === 'sem_microfone') return 'sem_microfone'
      return atual === 'pedindo_permissao' ? 'conectando' : atual

    case 'conversa':
      if (atual === null || !EM_CONVERSA.has(atual)) return atual
      if (evento.estado === 'ouvindo') return 'ouvindo'
      if (evento.estado === 'falando') return 'falando'
      if (evento.estado === 'conectando') return 'conectando'
      if (evento.estado === 'parada') return 'encerrado'
      // `encerrando` é passagem: o fim chega pelo `encerrar`.
      return atual

    case 'encerrar':
      // Sem permissão continua sendo a explicação na tela depois de fechar.
      if (atual === 'sem_permissao' || atual === 'sem_microfone') return atual
      return atual === null ? null : 'encerrado'
  }
}

/**
 * Traduz o erro do navegador (ou do SDK, que repassa o do navegador) para a
 * permissão. `null` quando o erro não é de microfone.
 */
export function permissaoDoErro(erro: unknown): Exclude<PermissaoDoMicrofone, 'liberado'> | null {
  const nome =
    typeof erro === 'object' && erro !== null && 'name' in erro ? String(erro.name) : ''
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'negado'
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'sem_microfone'
  return null
}

/**
 * O microfone de verdade. Pede o áudio e solta as faixas em seguida: o que
 * interessa aqui é a permissão, e quem captura durante a conversa é o SDK.
 * Segurar a faixa deixaria o indicador de microfone do sistema aceso à toa.
 */
export function criarMicrofoneDoNavegador(
  midia: Pick<MediaDevices, 'getUserMedia'> | null = globalThis.navigator?.mediaDevices ?? null,
): MicrofoneDoEnsaio {
  return {
    async pedir() {
      if (!midia) return 'sem_microfone'
      try {
        const fluxo = await midia.getUserMedia({ audio: true })
        for (const faixa of fluxo.getTracks()) faixa.stop()
        return 'liberado'
      } catch (erro) {
        return permissaoDoErro(erro) ?? 'negado'
      }
    },
  }
}
