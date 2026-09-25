import { useState } from 'react'

import { useServicoDeChamadas } from '@/chamadas/contexto'
import { useOperacao } from '@/chamadas/operacao'
import type { ResultadoDoFreio } from '@/chamadas/tipos'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Dialogo } from '@/componentes/dialogo'
import { freio as copy } from '@/copy/chamadas'
import { podeAcionarFreio } from '@/equipe/papeis'
import { formatarInstante } from '@/utilidades/datas'

type Acao = 'parar' | 'retomar'

/**
 * O freio de emergência (RF-011), na barra do topo de toda tela.
 *
 * Um clique abre a confirmação de uma etapa, que diz o que vai acontecer: as
 * chamadas em curso são encerradas e nenhuma nova sai. O motivo é obrigatório
 * porque `emergency-stop` o exige e porque ele fica na trilha ao lado do nome
 * de quem parou. Puxado o freio, o botão some e o aviso de discagem pausada
 * toma o lugar dele, em toda tela, com a retomada como ação separada.
 *
 * Quem não administra a conta vê o botão desligado com a razão escrita ao
 * lado: parar a operação inteira não é ação de quem só opera, e esconder o
 * botão faria o operador procurar o freio numa emergência sem saber que ele
 * não é dele.
 */
export function BotaoDoFreio() {
  const operacao = useOperacao()
  const [aberto, definirAberto] = useState(false)

  if (!operacao.carregada || operacao.freio) return null

  const pode = operacao.papel !== null && podeAcionarFreio(operacao.papel)

  return (
    <div className="flex items-center gap-2.5">
      {pode ? null : (
        <span id="freio-so-admin" className="max-w-[46ch] text-[11.5px] text-texto-apoio max-md:hidden">
          {copy.soAdmin}
        </span>
      )}
      <button
        type="button"
        className="botao-perigo py-1.5 text-[12.5px]"
        disabled={!pode}
        aria-describedby={pode ? undefined : 'freio-so-admin'}
        onClick={() => definirAberto(true)}
      >
        {copy.acionar}
      </button>
      {aberto ? (
        <ConfirmacaoDoFreio acao="parar" aoFechar={() => definirAberto(false)} />
      ) : null}
    </div>
  )
}

/**
 * "Discagem pausada", visível em toda tela enquanto o freio estiver puxado:
 * quem pausou, quando e o motivo. Retomar é ação separada, de admin, com
 * confirmação própria.
 */
export function AvisoDeDiscagemPausada() {
  const operacao = useOperacao()
  const [aberto, definirAberto] = useState(false)

  const { freio } = operacao
  if (!freio) return null

  const pode = operacao.papel !== null && podeAcionarFreio(operacao.papel)

  return (
    <section
      role="status"
      aria-label={copy.pausada.rotulo}
      className="sem-impressao border-b border-perigo-borda bg-perigo-fundo px-8 py-3 text-perigo max-md:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex min-w-0 items-start gap-3 text-[13.5px]">
          {/* O ponto carmim parado: a operação está no freio, nada pulsa. */}
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-carmim" />
          <div className="min-w-0">
            <p className="m-0 font-bold">{copy.pausada.titulo}</p>
            <p className="m-0 text-texto-secundario">
              {copy.pausada.quem(freio.por)} {copy.pausada.quando(formatarInstante(freio.em))}.{' '}
              {copy.pausada.motivo(freio.motivo)}
            </p>
          </div>
        </div>
        <div className="ml-auto">
          {pode ? (
            <button
              type="button"
              className="botao-menta py-1.5 text-[12.5px]"
              onClick={() => definirAberto(true)}
            >
              {copy.pausada.retomar}
            </button>
          ) : (
            <p className="m-0 text-[12.5px]">{copy.pausada.soAdminRetoma}</p>
          )}
        </div>
      </div>
      {aberto ? (
        <ConfirmacaoDoFreio acao="retomar" aoFechar={() => definirAberto(false)} />
      ) : null}
    </section>
  )
}

function ConfirmacaoDoFreio({ acao, aoFechar }: { acao: Acao; aoFechar: () => void }) {
  const servico = useServicoDeChamadas()
  const operacao = useOperacao()
  const [motivo, definirMotivo] = useState('')
  const [enviando, definirEnviando] = useState(false)
  const [falha, definirFalha] = useState<string | null>(null)

  const textos = acao === 'parar' ? copy.confirmar : copy.confirmarRetomada

  async function confirmar() {
    definirEnviando(true)
    definirFalha(null)
    let resultado: ResultadoDoFreio
    try {
      resultado =
        acao === 'parar'
          ? await servico.pararDiscagem(motivo.trim())
          : await servico.retomarDiscagem(motivo.trim())
    } catch {
      resultado = { ok: false, mensagem: '' }
    }
    definirEnviando(false)
    if (!resultado.ok) {
      definirFalha(resultado.mensagem || copy.semResposta)
      return
    }
    await operacao.recarregar()
    aoFechar()
  }

  return (
    <Dialogo
      titulo={textos.titulo}
      explicacao={textos.explicacao}
      confirmar={textos.acao}
      cancelar={textos.cancelar}
      tom={acao === 'parar' ? 'perigo' : 'primario'}
      ocupado={enviando}
      podeConfirmar={motivo.trim() !== ''}
      aoConfirmar={() => {
        void confirmar()
      }}
      aoCancelar={aoFechar}
    >
      <div className="flex flex-col gap-3">
        <CampoDeTextoLongo
          rotulo={textos.motivo}
          apoio={copy.confirmar.motivoApoio}
          rows={2}
          value={motivo}
          onChange={(evento) => definirMotivo(evento.target.value)}
        />
        {falha ? <CaixaDeErro>{falha}</CaixaDeErro> : null}
      </div>
    </Dialogo>
  )
}
