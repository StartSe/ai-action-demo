import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { ligacaoAoLeadNovo as copy } from '@/copy/ligacao-ao-lead-novo'
import { useServicoDeDiscagem } from '@/discagem/contexto'
import type {
  LigacaoAoLeadNovo as Configuracao,
  MotivoDeFalhaDaDiscagem,
} from '@/discagem/tipos'

/** A chave desta leitura. O fecho do tutorial e /config/discagem leem a mesma. */
const CHAVE = ['ligacao-ao-lead-novo'] as const
/** A mesma chave de `EstadoDoPortao`: é a mesma leitura de `estado_do_portao`. */
const CHAVE_DO_PORTAO = ['portao-de-lead-real'] as const

/**
 * A ligação ao lead novo (D-03, RF-610) em /config/discagem: o interruptor, o
 * prazo e o motivo, com o que acontece, a janela e o custo escritos antes do
 * botão. A escrita é `definir_ligacao_ao_lead_novo`, e a guarda continua
 * decidindo cada ligação: janela, freio, tetos e o portão de lead real.
 */
export function LigacaoAoLeadNovo() {
  const servico = useServicoDeDiscagem()
  const consulta = useQuery({ queryKey: CHAVE, queryFn: () => servico.ligacaoAoLeadNovo() })
  const portao = useQuery({ queryKey: CHAVE_DO_PORTAO, queryFn: () => servico.portao() })

  const carga = consulta.data
  const portaoFechado = portao.data?.ok === true && portao.data.portao.falta.length > 0

  return (
    <Painel
      id="ligacao-ao-lead-novo"
      rotulo={copy.titulo}
      titulo={copy.titulo}
      apoio={copy.apoio}
      estado={
        carga?.ok && carga.configuracao ? (
          <Selo tom={carga.configuracao.ligada ? 'positivo' : 'neutro'}>
            {carga.configuracao.ligada ? copy.ligada : copy.desligada}
          </Selo>
        ) : null
      }
    >
      <div className="flex flex-col gap-2 text-[13px] text-texto-apoio">
        <p className="m-0">{copy.comoFunciona}</p>
        <p className="m-0">{copy.janela}</p>
        <p className="m-0">{copy.custo}</p>
        {portaoFechado ? <p className="m-0 font-semibold text-atencao">{copy.portaoFechado}</p> : null}
      </div>

      {consulta.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga?.ok ? (
        <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      ) : !carga.configuracao ? (
        <p className="mt-4 mb-0 text-[13px] text-texto-apoio">{copy.semConfiguracao}</p>
      ) : (
        <Formulario
          // Remonta com o que o servidor gravou, sem sincronizar por efeito.
          key={`${carga.configuracao.ligada}-${carga.configuracao.prazoMinutos}`}
          gravada={carga.configuracao}
          aoGravar={async () => {
            await consulta.refetch()
          }}
        />
      )}
    </Painel>
  )
}

function Formulario({
  gravada,
  aoGravar,
}: {
  gravada: Configuracao
  aoGravar: () => Promise<void>
}) {
  const servico = useServicoDeDiscagem()
  const [ligada, definirLigada] = useState(gravada.ligada)
  const [prazo, definirPrazo] = useState(String(gravada.prazoMinutos))
  const [motivo, definirMotivo] = useState('')
  const [salvando, definirSalvando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaDiscagem | null>(null)
  const [salva, definirSalva] = useState<boolean | null>(null)

  const minutos = Number(prazo)
  const prazoValido = /^\d+$/.test(prazo.trim()) && minutos >= 1 && minutos <= 1440
  const mudou = ligada !== gravada.ligada || (prazoValido && minutos !== gravada.prazoMinutos)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    definirSalvando(true)
    definirFalha(null)
    definirSalva(null)
    const resultado = await servico.salvarLigacaoAoLeadNovo(
      { ligada, prazoMinutos: minutos },
      motivo.trim(),
    )
    definirSalvando(false)
    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }
    definirSalva(resultado.configuracao.ligada)
    await aoGravar()
  }

  return (
    <form onSubmit={(evento) => void enviar(evento)} className="mt-5 flex flex-col gap-4">
      <label className="flex items-center gap-2.5 text-[13.5px] font-semibold">
        <input
          type="checkbox"
          checked={ligada}
          disabled={salvando}
          onChange={(evento) => definirLigada(evento.target.checked)}
        />
        {copy.interruptor}
      </label>

      <CampoDeTexto
        rotulo={copy.prazo.rotulo}
        exemplo={copy.prazo.exemplo}
        apoio={copy.prazo.apoio}
        erro={prazoValido ? undefined : copy.prazo.erro}
        inputMode="numeric"
        value={prazo}
        disabled={salvando}
        onChange={(evento) => definirPrazo(evento.target.value)}
      />

      <CampoDeTexto
        rotulo={copy.motivo.rotulo}
        exemplo={copy.motivo.exemplo}
        apoio={copy.motivo.apoio}
        value={motivo}
        disabled={salvando}
        onChange={(evento) => definirMotivo(evento.target.value)}
      />

      {falha ? (
        <p role="alert" className="m-0 text-[13px] text-perigo">
          {copy.falhas[falha]}
        </p>
      ) : null}
      {salva !== null && !falha ? (
        <p role="status" className="m-0 text-[13px] font-semibold text-positivo">
          {copy.salva(salva)}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          className="botao-primario"
          disabled={salvando || !mudou || !prazoValido || motivo.trim() === ''}
        >
          {salvando ? copy.salvando : copy.salvar}
        </button>
      </div>
    </form>
  )
}

/**
 * A oferta do fecho do tutorial: opcional, um clique, com o custo dito. Grava
 * pelo mesmo RPC, com o motivo do tutorial na trilha; ligada, só aponta para
 * Discagem, onde se desliga e se muda o prazo.
 */
export function OfertaDaLigacaoAoLeadNovo() {
  const servico = useServicoDeDiscagem()
  const consulta = useQuery({ queryKey: CHAVE, queryFn: () => servico.ligacaoAoLeadNovo() })
  const [salvando, definirSalvando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaDiscagem | null>(null)

  const carga = consulta.data
  if (!carga?.ok || !carga.configuracao) return null
  const configuracao = carga.configuracao

  async function ligar() {
    definirSalvando(true)
    definirFalha(null)
    const resultado = await servico.salvarLigacaoAoLeadNovo(
      { ligada: true, prazoMinutos: configuracao.prazoMinutos },
      copy.motivo.padraoDoTutorial,
    )
    definirSalvando(false)
    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }
    await consulta.refetch()
  }

  return (
    <div role="group" aria-label={copy.titulo} className="bloco-secundario flex flex-col gap-2 px-4 py-3.5">
      <p className="m-0 text-[13.5px] font-semibold text-texto-principal">{copy.tutorial.titulo}</p>
      {configuracao.ligada ? (
        <p role="status" className="m-0 text-[13px] text-positivo">
          {copy.tutorial.ligada}
        </p>
      ) : (
        <>
          <p className="m-0 text-[13px] text-texto-apoio">{copy.tutorial.explicacao}</p>
          {falha ? (
            <p role="alert" className="m-0 text-[13px] text-perigo">
              {copy.falhas[falha]}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              className="botao-secundario"
              disabled={salvando}
              onClick={() => void ligar()}
            >
              {salvando ? copy.salvando : copy.ligar}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
