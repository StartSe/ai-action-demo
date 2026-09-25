import { useState } from 'react'

import type { ServicoDeChamadas } from '@/chamadas/tipos'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { ficha as copy } from '@/copy/chamadas'

type FaseDoReprodutor =
  | { fase: 'parado'; aviso: string | null }
  | { fase: 'abrindo' }
  | { fase: 'tocando'; url: string }
  | { fase: 'expurgada'; mensagem: string }

/**
 * O reprodutor sobre a URL assinada de `call-audio`, o mesmo na ficha da
 * chamada e na fila. Enquanto ninguém toca, é só o botão: a URL vale cinco
 * minutos e nasce no clique, e a tela nunca a guarda. Endereço vencido (erro do
 * `<audio>`) volta ao botão, com o aviso, para pedir outro.
 */
export function ReprodutorDeGravacao({
  chamadaId,
  servico,
}: {
  chamadaId: string
  servico: ServicoDeChamadas
}) {
  const [estado, definirEstado] = useState<FaseDoReprodutor>({ fase: 'parado', aviso: null })

  async function ouvir() {
    definirEstado({ fase: 'abrindo' })
    try {
      const resposta = await servico.pedirAudio(chamadaId)
      if (resposta.ok) {
        definirEstado({ fase: 'tocando', url: resposta.url })
      } else if (resposta.motivo === 'gravacao_expurgada') {
        definirEstado({ fase: 'expurgada', mensagem: resposta.mensagem })
      } else {
        definirEstado({ fase: 'parado', aviso: resposta.mensagem || copy.gravacao.semResposta })
      }
    } catch {
      definirEstado({ fase: 'parado', aviso: copy.gravacao.semResposta })
    }
  }

  if (estado.fase === 'expurgada') {
    return <p className="m-0 text-[13.5px] text-texto-apoio">{estado.mensagem}</p>
  }

  if (estado.fase === 'tocando') {
    return (
      <audio
        controls
        autoPlay
        src={estado.url}
        aria-label={copy.gravacao.reprodutor}
        className="w-full rounded-controle [color-scheme:dark]"
        onError={() => definirEstado({ fase: 'parado', aviso: copy.gravacao.enderecoVencido })}
      />
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {estado.fase === 'parado' && estado.aviso ? (
        <CaixaDeErro tom="atencao">{estado.aviso}</CaixaDeErro>
      ) : null}
      {/* Ouvir não muda nada na conta: é o botão secundário, e o carmim fica
          para a ação da tela. O triângulo e a onda são decorativos. */}
      <button
        type="button"
        className="botao-secundario"
        disabled={estado.fase === 'abrindo'}
        onClick={() => void ouvir()}
      >
        {estado.fase === 'abrindo' ? (
          <span aria-hidden="true" className="giro size-4! border-2!" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-menta-2">
            <path d="M4 2.5v11l9-5.5z" />
          </svg>
        )}
        {estado.fase === 'abrindo' ? copy.gravacao.abrindo : copy.gravacao.ouvir}
      </button>
    </div>
  )
}
