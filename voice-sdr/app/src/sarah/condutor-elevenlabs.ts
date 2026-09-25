// O condutor da conversa sobre o SDK do provedor de voz (US-247).
//
// É a única peça do ensaio que **só roda no navegador**: ela pede microfone,
// abre a conexão com a URL assinada e toca o áudio que volta. Por isso está
// atrás de `CondutorDeConversa` — a tela fala com o contrato, e o que não se
// verifica sem navegador fica confinado neste arquivo.
//
// **A URL ASSINADA EXIGE WEBSOCKET.** O SDK aceita `signedUrl` apenas com
// `connectionType: "websocket"`; o WebRTC pede outro tipo de credencial
// (`conversationToken`), que a borda não emite. Os dois modos do ensaio — voz
// e texto — correm sobre o mesmo WebSocket, e quem os separa é `textOnly`: com
// ele ligado o SDK não pede microfone nenhum.
//
// **A URL ASSINADA JÁ CARREGA O AGENTE.** Nenhum identificador de agente é
// passado aqui: ele vem dentro da assinatura que a borda pediu, contra a
// publicação daquele propósito (T-16). Um agente passado por fora abriria
// caminho para ensaiar contra outro que não o publicado.
//
// **O QUE A ESCADA LOCAL NÃO VÊ, E FICA PARA O DEGRAU 3:** que o SDK conecte
// com a URL assinada, que o microfone abra, que o áudio toque, e que os nomes
// dos eventos ainda sejam estes na versão instalada. Tudo o mais — os estados
// da tela, a ordem dos passos, o que acontece quando a conversa cai — se prova
// em jsdom com o dublê.

import { Conversation } from '@elevenlabs/client'

import type {
  AberturaDaConversa,
  CondutorDeConversa,
  ConversaEmCurso,
  OuvintesDaConversa,
} from '@/sarah/ensaio'

/** O condutor de verdade. O teste usa outro; ver o cabeçalho. */
export function criarCondutorDaElevenLabs(): CondutorDeConversa {
  return {
    async abrir(
      abertura: AberturaDaConversa,
      ouvintes: OuvintesDaConversa,
    ): Promise<ConversaEmCurso> {
      ouvintes.aoEstado('conectando')

      const conversa = await Conversation.startSession({
        signedUrl: abertura.urlAssinada,
        connectionType: 'websocket',
        // Sem microfone no modo texto: pedir permissão que a conversa não usa
        // faz o navegador perguntar por nada e assusta quem só queria digitar.
        textOnly: abertura.modo === 'text',
        dynamicVariables: abertura.variaveis,
        // A primeira fala com o lead dentro, quando a borda a montou. A
        // sobreposição está liberada na publicação, a mesma do webhook de início.
        ...(abertura.primeiraFala
          ? { overrides: { agent: { firstMessage: abertura.primeiraFala } } }
          : {}),

        onMessage: ({ message, source }) => {
          if (typeof message !== 'string' || message.trim() === '') return
          // O provedor chama o outro lado de `user`; aqui ele é `lead`, que é
          // o vocabulário de `calls.transcript` e o que `call-review` lê.
          ouvintes.aoTurno({ quem: source === 'ai' ? 'agent' : 'lead', texto: message })
        },

        onModeChange: ({ mode }) => {
          ouvintes.aoEstado(mode === 'speaking' ? 'falando' : 'ouvindo')
        },

        onDisconnect: () => {
          ouvintes.aoEstado('parada')
        },

        onError: (mensagem) => {
          // Cair não é encerrar: a tela fecha o ensaio assim mesmo, senão a
          // linha fica aberta para sempre no banco.
          ouvintes.aoCair(typeof mensagem === 'string' ? mensagem : 'a conversa caiu')
        },
      })

      return {
        identificador() {
          const id = conversa.getId()
          return typeof id === 'string' && id !== '' ? id : null
        },
        async dizer(texto: string) {
          conversa.sendUserMessage(texto)
        },
        sinalizarAtividade() {
          // Segura o agente por alguns segundos: é o que o provedor oferece
          // para "a pessoa está digitando".
          conversa.sendUserActivity()
        },
        async encerrar() {
          ouvintes.aoEstado('encerrando')
          await conversa.endSession()
        },
      }
    },
  }
}
