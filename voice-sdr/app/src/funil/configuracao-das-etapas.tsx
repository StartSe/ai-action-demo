import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Seletor } from '@/componentes/seletor'
import { funil as copy } from '@/copy/funil'
import type { Membro } from '@/equipe/tipos'
import {
  chaveDoRotulo,
  corDaEtapa,
  CORES_DA_ETAPA,
  FUNDO_DA_COR,
  listaReordenada,
  paraCor,
  paraPedido,
  proximaPosicao,
  type CorDaEtapa,
} from '@/funil/etapas'
import { useServicoDeLeads } from '@/leads/contexto'
import type {
  CargaDaConfiguracao,
  ConfiguracaoDasEtapas as Configuracao,
  EtapaConfigurada,
  EtapaPedida,
} from '@/leads/tipos'

/** A chave da configuração. Fora de `['funil', …]`, que é a do quadro. */
const CHAVE_DA_CONFIGURACAO = ['etapas-do-funil'] as const

type Aviso = { tom: 'status' | 'erro'; texto: string }

interface Props {
  /** Só quem administra recebe os controles (`podeConfigurarEtapas`). */
  podeConfigurar: boolean
  /** Para a negativa dizer a quem pedir acesso. */
  administradores: readonly Membro[]
}

/**
 * A configuração das etapas, dentro da própria `/funil` (US-146, RF-207).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **A chave aparece ao lado do rótulo, e uma frase diz que é ela que a
 *    automação usa.** É o que evita alguém renomear achando que muda o que a
 *    Sarah faz com a etapa.
 * 2. **A tela desenha a lista que o servidor devolveu, nunca a pedida.** Toda
 *    escrita manda a lista inteira numa chamada, e o que volta é a
 *    configuração relida; recusa (posição duplicada, por exemplo) relê do
 *    banco, para a ordem na tela nunca ser a que não foi gravada.
 * 3. **Quem não administra vê as etapas e as chaves, sem controle nenhum**, com
 *    a negativa e a quem pedir acesso.
 */
export function ConfiguracaoDasEtapas({ podeConfigurar, administradores }: Props) {
  const servico = useServicoDeLeads()
  const clienteDeConsulta = useQueryClient()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [gravando, setGravando] = useState(false)
  const [aApagar, setAApagar] = useState<EtapaConfigurada | null>(null)

  const consulta = useQuery({
    queryKey: CHAVE_DA_CONFIGURACAO,
    queryFn: () => servico.carregarConfiguracaoDasEtapas(),
  })
  const carga = consulta.data

  /** O que vem depois de toda escrita: a configuração do banco, e o quadro relido. */
  async function depoisDeGravar(configuracao: Configuracao | null) {
    if (configuracao) {
      const relida: CargaDaConfiguracao = { ok: true, configuracao }
      clienteDeConsulta.setQueryData(CHAVE_DA_CONFIGURACAO, relida)
    } else {
      await consulta.refetch()
    }
    await clienteDeConsulta.invalidateQueries({ queryKey: ['funil'] })
  }

  async function gravar(
    configuracao: Configuracao,
    etapas: readonly EtapaPedida[],
    feito: string,
  ) {
    if (!podeConfigurar || gravando) return
    setGravando(true)
    const resposta = await servico.configurarEtapas(configuracao.funilId, etapas)
    setGravando(false)
    if (resposta.ok) {
      setAviso({ tom: 'status', texto: feito })
      await depoisDeGravar(resposta.configuracao)
    } else {
      setAviso({ tom: 'erro', texto: copy.etapas.falhas[resposta.motivo] })
      await depoisDeGravar(null)
    }
  }

  async function apagar(etapa: EtapaConfigurada) {
    if (!podeConfigurar || gravando) return
    setGravando(true)
    const resposta = await servico.apagarEtapa(etapa.id)
    setGravando(false)
    setAApagar(null)
    setAviso(
      resposta.ok
        ? { tom: 'status', texto: copy.etapas.feito.apagada(etapa.rotulo) }
        : { tom: 'erro', texto: copy.etapas.falhasDaExclusao[resposta.motivo] },
    )
    await depoisDeGravar(null)
  }

  return (
    <section
      aria-label={copy.etapas.titulo}
      className="cartao mb-4 flex flex-col gap-3 px-5 py-4"
    >
      <h2 className="titulo-de-secao m-0">{copy.etapas.titulo}</h2>
      <p className="m-0 text-[13.5px] text-texto-apoio">{copy.etapas.chaveExplicada}</p>

      {!podeConfigurar ? (
        <NegativaPorPapel aviso={copy.etapas.negativa} administradores={administradores} />
      ) : null}

      {aviso?.tom === 'erro' ? <CaixaDeErro>{aviso.texto}</CaixaDeErro> : null}
      {aviso?.tom === 'status' ? (
        <p role="status" className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">
          {aviso.texto}
        </p>
      ) : null}

      {consulta.isPending ? <Carregando texto={copy.etapas.carregando} /> : null}
      {carga?.ok === false ? <CaixaDeErro>{copy.etapas.falha}</CaixaDeErro> : null}

      {carga?.ok && carga.configuracao.etapas.length === 0 ? (
        <p className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">
          {podeConfigurar ? copy.etapas.vazio : copy.etapas.vazioEmLeitura}
        </p>
      ) : null}

      {carga?.ok && carga.configuracao.etapas.length > 0 ? (
        <ol aria-label={copy.etapas.lista} className="m-0 flex list-none flex-col gap-2 p-0">
          {carga.configuracao.etapas.map((etapa, indice, todas) => (
            <LinhaDaEtapa
              // O rótulo na chave remonta o campo quando o banco devolve outro.
              key={`${etapa.id}:${etapa.rotulo}`}
              etapa={etapa}
              primeira={indice === 0}
              ultima={indice === todas.length - 1}
              podeConfigurar={podeConfigurar}
              ocupado={gravando}
              aoRenomear={(rotulo) =>
                void gravar(
                  carga.configuracao,
                  [paraPedido(etapa, { rotulo })],
                  copy.etapas.feito.renomeada(rotulo),
                )
              }
              aoColorir={(cor) =>
                void gravar(
                  carga.configuracao,
                  [paraPedido(etapa, { cor })],
                  copy.etapas.feito.colorida(etapa.rotulo),
                )
              }
              aoMover={(sentido) => {
                const lista = listaReordenada(todas, etapa.id, sentido)
                if (lista) void gravar(carga.configuracao, lista, copy.etapas.feito.reordenada)
              }}
              aoApagar={() => setAApagar(etapa)}
            />
          ))}
        </ol>
      ) : null}

      {podeConfigurar && carga?.ok ? (
        <NovaEtapa
          ocupado={gravando}
          aoCriar={(rotulo, chave, cor) =>
            void gravar(
              carga.configuracao,
              [{ chave, rotulo, cor, posicao: proximaPosicao(carga.configuracao.etapas) }],
              copy.etapas.feito.criada(rotulo),
            )
          }
        />
      ) : null}

      {aApagar ? (
        <Dialogo
          titulo={copy.etapas.confirmacao.titulo(aApagar.rotulo)}
          explicacao={
            aApagar.leads > 0
              ? copy.etapas.confirmacao.comLeads(aApagar.leads)
              : copy.etapas.confirmacao.vazia
          }
          tom="perigo"
          confirmar={copy.etapas.confirmacao.confirmar}
          cancelar={copy.etapas.confirmacao.cancelar}
          ocupado={gravando}
          // O banco só apaga etapa vazia: oferecer o botão com leads nela
          // seria pedir uma recusa.
          podeConfirmar={aApagar.leads === 0}
          aoConfirmar={() => void apagar(aApagar)}
          aoCancelar={() => setAApagar(null)}
        />
      ) : null}
    </section>
  )
}

interface PropsDaLinha {
  etapa: EtapaConfigurada
  primeira: boolean
  ultima: boolean
  podeConfigurar: boolean
  ocupado: boolean
  aoRenomear: (rotulo: string) => void
  aoColorir: (cor: CorDaEtapa) => void
  aoMover: (sentido: -1 | 1) => void
  aoApagar: () => void
}

function LinhaDaEtapa({
  etapa,
  primeira,
  ultima,
  podeConfigurar,
  ocupado,
  aoRenomear,
  aoColorir,
  aoMover,
  aoApagar,
}: PropsDaLinha) {
  const [rotulo, setRotulo] = useState(etapa.rotulo)
  const [recusa, setRecusa] = useState<string | undefined>(undefined)
  const cor = corDaEtapa(etapa.chave, etapa.cor)

  function renomear() {
    const limpo = rotulo.trim()
    if (!limpo) {
      setRecusa(copy.etapas.rotuloVazio)
      return
    }
    setRecusa(undefined)
    // Renomear não pede confirmação: a chave não muda, e a automação não vê.
    if (limpo !== etapa.rotulo) aoRenomear(limpo)
  }

  return (
    <li className="bloco-secundario flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${FUNDO_DA_COR[cor]}`} />
        <span className="text-[13.5px] font-bold text-texto-principal">{etapa.rotulo}</span>
        <span className="text-[12px] text-texto-apoio">
          {copy.etapas.chave} <span className="val text-texto-secundario">{etapa.chave}</span>
        </span>
        <span className="val text-[12px] text-texto-apoio-claro">
          {copy.etapas.leads(etapa.leads)}
        </span>
      </div>

      {podeConfigurar ? (
        <div className="flex flex-wrap items-end gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(evento) => {
              evento.preventDefault()
              renomear()
            }}
          >
            <CampoDeTexto
              rotulo={copy.etapas.rotulo(etapa.rotulo)}
              value={rotulo}
              erro={recusa}
              onChange={(evento) => setRotulo(evento.target.value)}
            />
            <button type="submit" className="botao-secundario" disabled={ocupado}>
              {copy.etapas.renomear}
            </button>
          </form>

          <Seletor
            rotulo={copy.etapas.cor(etapa.rotulo)}
            valor={cor}
            aoTrocar={(valor) => {
              const escolhida = paraCor(valor)
              if (escolhida && escolhida !== cor) aoColorir(escolhida)
            }}
          >
            {CORES_DA_ETAPA.map((opcao) => (
              <option key={opcao} value={opcao}>
                {copy.cores[opcao]}
              </option>
            ))}
          </Seletor>

          <button
            type="button"
            className="botao-fantasma"
            aria-label={copy.etapas.subir(etapa.rotulo)}
            disabled={ocupado || primeira}
            onClick={() => aoMover(-1)}
          >
            {copy.etapas.setaSubir}
          </button>
          <button
            type="button"
            className="botao-fantasma"
            aria-label={copy.etapas.descer(etapa.rotulo)}
            disabled={ocupado || ultima}
            onClick={() => aoMover(1)}
          >
            {copy.etapas.setaDescer}
          </button>

          {etapa.canonica ? null : (
            <button
              type="button"
              className="botao-perigo"
              disabled={ocupado}
              onClick={aoApagar}
            >
              {copy.etapas.apagar(etapa.rotulo)}
            </button>
          )}
        </div>
      ) : null}

      {etapa.canonica ? (
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.etapas.canonica}</p>
      ) : null}
    </li>
  )
}

function NovaEtapa({
  ocupado,
  aoCriar,
}: {
  ocupado: boolean
  aoCriar: (rotulo: string, chave: string, cor: CorDaEtapa | null) => void
}) {
  const [rotulo, setRotulo] = useState('')
  const [cor, setCor] = useState<CorDaEtapa>('texto-desativado')
  const chave = chaveDoRotulo(rotulo)
  const escrito = rotulo.trim() !== ''

  return (
    <form
      aria-label={copy.etapas.nova.titulo}
      className="flex flex-col gap-2 border-t border-borda-suave pt-3"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!chave) return
        aoCriar(rotulo.trim(), chave, cor)
        setRotulo('')
      }}
    >
      <h3 className="m-0 text-[13px] font-extrabold text-texto-principal">
        {copy.etapas.nova.titulo}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <CampoDeTexto
          rotulo={copy.etapas.nova.rotulo}
          exemplo={copy.etapas.nova.exemplo}
          value={rotulo}
          erro={escrito && !chave ? copy.etapas.nova.semChave : undefined}
          onChange={(evento) => setRotulo(evento.target.value)}
        />
        <Seletor
          rotulo={copy.etapas.nova.cor}
          valor={cor}
          aoTrocar={(valor) => setCor(paraCor(valor) ?? 'texto-desativado')}
        >
          {CORES_DA_ETAPA.map((opcao) => (
            <option key={opcao} value={opcao}>
              {copy.cores[opcao]}
            </option>
          ))}
        </Seletor>
        <button type="submit" className="botao-primario" disabled={ocupado || !chave}>
          {copy.etapas.nova.criar}
        </button>
      </div>
      {chave ? (
        <p className="m-0 text-[12.5px] text-texto-apoio">
          {copy.etapas.nova.chave} <span className="val text-texto-secundario">{chave}</span>
        </p>
      ) : null}
    </form>
  )
}
