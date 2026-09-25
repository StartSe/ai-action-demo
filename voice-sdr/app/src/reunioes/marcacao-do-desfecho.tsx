import { useState } from 'react'

import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Dialogo } from '@/componentes/dialogo'
import { reunioes } from '@/copy/reunioes'
import { useServicoDeReunioes } from '@/reunioes/contexto'
import { pedeMotivo, problemaDoPedido } from '@/reunioes/desfecho'
import {
  DESFECHOS_MANUAIS,
  type DesfechoManual,
  type MotivoDeRecusaDoDesfecho,
  type ReuniaoDaLista,
} from '@/reunioes/tipos'

const copy = reunioes.desfecho

type Passo = 'fechado' | 'confirmando-troca' | 'escolhendo'

type MarcacaoDoDesfechoProps = {
  reuniao: Pick<ReuniaoDaLista, 'id' | 'estado' | 'apuracao'> & { lead: { nome: string } }
  /** Depois de gravar: quem desenha a reunião lê de novo. */
  aoMarcar: () => void
}

/**
 * O botão "Marcar desfecho" e os dois diálogos dele (US-181, RF-512).
 *
 * Reunião já apurada passa primeiro pela confirmação da troca, e só então
 * pela escolha; a escolha manda `sobrescrever` só quando a pessoa confirmou.
 * Se outra pessoa apurou no meio, o RPC devolve `ja-apurada` e a tela volta à
 * confirmação, em vez de sobrescrever em silêncio.
 */
export function MarcacaoDoDesfecho({ reuniao, aoMarcar }: MarcacaoDoDesfechoProps) {
  const servico = useServicoDeReunioes()
  const [passo, setPasso] = useState<Passo>('fechado')
  const [confirmouTroca, setConfirmouTroca] = useState(false)
  const [desfecho, setDesfecho] = useState<DesfechoManual>('attended')
  const [motivo, setMotivo] = useState('')
  const [recusa, setRecusa] = useState<MotivoDeRecusaDoDesfecho | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const jaApurada = reuniao.apuracao === 'attested'
  const faltaMotivo = problemaDoPedido({ desfecho, motivo }) !== null
  const nome = reuniao.lead.nome || reunioes.ficha.leadSemNome

  function abrir() {
    setRecusa(null)
    setConfirmouTroca(false)
    setPasso(jaApurada ? 'confirmando-troca' : 'escolhendo')
  }

  function fechar() {
    setPasso('fechado')
    setMotivo('')
    setRecusa(null)
  }

  async function marcar() {
    if (faltaMotivo) {
      setRecusa('motivo-obrigatorio')
      return
    }
    setOcupado(true)
    const resultado = await servico.marcarDesfecho({
      reuniaoId: reuniao.id,
      desfecho,
      motivo: motivo.trim() || null,
      sobrescrever: confirmouTroca,
    })
    setOcupado(false)
    if (resultado.ok) {
      fechar()
      aoMarcar()
      return
    }
    if (resultado.motivo === 'ja-apurada') {
      setConfirmouTroca(false)
      setRecusa('ja-apurada')
      setPasso('confirmando-troca')
      return
    }
    setRecusa(resultado.motivo)
  }

  return (
    <>
      <button type="button" className="botao-secundario" onClick={abrir}>
        {copy.marcar}
      </button>

      {passo === 'confirmando-troca' ? (
        <Dialogo
          titulo={copy.troca.titulo}
          explicacao={
            <>
              {recusa === 'ja-apurada' ? <p className="m-0 mb-1.5">{copy.recusas['ja-apurada']}</p> : null}
              <p className="m-0">{copy.troca.explicacao(reunioes.estados[reuniao.estado])}</p>
            </>
          }
          confirmar={copy.troca.confirmar}
          cancelar={copy.troca.cancelar}
          aoConfirmar={() => {
            setRecusa(null)
            setConfirmouTroca(true)
            setPasso('escolhendo')
          }}
          aoCancelar={fechar}
        />
      ) : null}

      {passo === 'escolhendo' ? (
        <Dialogo
          titulo={copy.escolha.titulo}
          explicacao={copy.escolha.explicacao(nome)}
          confirmar={copy.escolha.confirmar}
          cancelar={copy.escolha.cancelar}
          ocupado={ocupado}
          aoConfirmar={() => void marcar()}
          aoCancelar={fechar}
        >
          <div className="flex flex-col gap-4">
            <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
              <legend className="mb-1.5 text-[13px] font-semibold">{copy.escolha.rotulo}</legend>
              {DESFECHOS_MANUAIS.map((opcao) => (
                <label key={opcao} className="flex items-start gap-2.5 text-[13.5px]">
                  <input
                    type="radio"
                    name={`desfecho-${reuniao.id}`}
                    value={opcao}
                    checked={desfecho === opcao}
                    onChange={() => {
                      setDesfecho(opcao)
                      setRecusa(null)
                    }}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold text-texto-principal">{copy.escolha.opcoes[opcao]}</span>
                    <span className="text-[12.5px] text-texto-apoio">{copy.escolha.explicacoes[opcao]}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <CampoDeTextoLongo
              rotulo={copy.escolha.motivo}
              exemplo={pedeMotivo(desfecho) ? copy.escolha.exemploDoMotivo : undefined}
              apoio={copy.escolha.apoioDoMotivo}
              erro={recusa === 'motivo-obrigatorio' ? copy.recusas['motivo-obrigatorio'] : undefined}
              rows={3}
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                if (recusa === 'motivo-obrigatorio') setRecusa(null)
              }}
            />

            {recusa && recusa !== 'motivo-obrigatorio' ? (
              <p role="alert" className="m-0 text-[13px] text-perigo">
                {copy.recusas[recusa]}
              </p>
            ) : null}
          </div>
        </Dialogo>
      ) : null}
    </>
  )
}
