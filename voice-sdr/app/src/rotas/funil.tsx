import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type DragEvent } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Selo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import { funil as copy } from '@/copy/funil'
import { ORIGEM_EM_PORTUGUES, TEMPERATURA_EM_PORTUGUES, leads as copyDeLeads } from '@/copy/leads'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeConfigurarEtapas, podeMoverNoFunil, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { destinosDoCartao, movidoPelaSarah } from '@/funil/cartao'
import { ConfiguracaoDasEtapas } from '@/funil/configuracao-das-etapas'
import { corDaEtapa, FUNDO_DA_COR } from '@/funil/etapas'
import {
  inicioDaAtividade,
  ORIGENS,
  PERIODOS_DE_ATIVIDADE,
  type PeriodoDeAtividade,
} from '@/leads/consulta'
import { useServicoDeLeads } from '@/leads/contexto'
import type {
  ColunaDoFunil,
  EtapaDoFunil,
  LeadDoFunil,
  Origem,
} from '@/leads/tipos'
import { formatarInstante } from '@/utilidades/datas'

// A mesma chave de `/config/equipe`: o papel de quem olha é o mesmo recurso.
const CHAVE_DA_EQUIPE = ['equipe'] as const

interface FiltroDoQuadro {
  periodo: PeriodoDeAtividade
  origem: Origem | ''
}

const FILTRO_ABERTO: FiltroDoQuadro = { periodo: 'tudo', origem: '' }

/** O que a última mudança pedida disse. `status` é resultado; `erro`, recusa. */
type Aviso = { tom: 'status' | 'erro'; texto: string }

/**
 * `/funil`: onde cada lead está, e o lugar de mudá-lo de etapa (US-250,
 * US-145, RF-201, RF-202, RF-205, RF-206).
 *
 * Seis decisões explicam o desenho:
 *
 * 1. **Quem não tem etapa não vira coluna.** Ele não está no funil, e uma
 *    coluna "sem etapa" fingiria que está — e entraria no total, fazendo o
 *    número do funil contar quem está fora dele. A tela o conta à parte e
 *    oferece a lista.
 * 2. **A coluna é um cartão de leitura rápida, e não uma tabela vertical.**
 *    Mostra os mais recentes, diz quantos há e pede filtro mais estreito
 *    quando passa do teto; a lista inteira de uma etapa se vê em `/leads`.
 * 3. **Mover é pelo teclado primeiro.** Cada cartão tem um seletor de destino
 *    (RNF-15); arrastar é o atalho de quem usa mouse e chama o mesmo caminho.
 *    Os dois terminam em `mover_lead_de_etapa` com a chave da etapa, nunca o
 *    rótulo (RF-203).
 * 4. **O sinal da Sarah é a última mudança, e só ela** (`funil/cartao.ts`).
 * 5. **Quem só observa vê o quadro sem controle nenhum**, com a negativa e a
 *    quem pedir acesso. Esconder o quadro tiraria dele a resposta para "onde
 *    está cada lead", que é dele também.
 * 6. **A configuração das etapas mora aqui, atrás de um botão** (US-146,
 *    RF-207), e não numa tela de configuração à parte: quem renomeia uma
 *    coluna quer ver o quadro mudar. Toda escrita dela invalida o quadro.
 */
export function TelaDoFunil() {
  const servico = useServicoDeLeads()
  const equipe = useServicoDeEquipe()

  // O filtro mora acima do `useQuery`: chave nova volta a `isPending`, e o
  // ramo do quadro sai da árvore junto com todo estado que estivesse nele.
  const [filtro, setFiltro] = useState<FiltroDoQuadro>(FILTRO_ABERTO)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [arrastado, setArrastado] = useState<LeadDoFunil | null>(null)
  const [movendo, setMovendo] = useState(false)
  const [configurando, setConfigurando] = useState(false)

  const consulta = useQuery({
    // A chave sai do filtro, nunca do recorte: o recorte carrega o instante,
    // que muda a cada leitura do relógio.
    queryKey: ['funil', filtro.periodo, filtro.origem],
    queryFn: () =>
      servico.carregarFunil({
        origem: filtro.origem || undefined,
        atividadeDesde: inicioDaAtividade(filtro.periodo),
      }),
  })

  const consultaDaEquipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => equipe.carregar(),
  })
  const cargaDaEquipe = consultaDaEquipe.data
  // Sem papel lido, nada se oferece: controle que a política recusaria é pior
  // do que controle que chega um instante depois.
  const podeMover = cargaDaEquipe?.ok === true && podeMoverNoFunil(cargaDaEquipe.equipe.papelDoUsuario)
  const emLeitura = cargaDaEquipe?.ok === true && !podeMover
  const podeConfigurar =
    cargaDaEquipe?.ok === true && podeConfigurarEtapas(cargaDaEquipe.equipe.papelDoUsuario)

  const carga = consulta.data
  const filtrado = filtro.periodo !== 'tudo' || filtro.origem !== ''

  async function mover(lead: LeadDoFunil, etapa: EtapaDoFunil) {
    if (!podeMover || movendo) return
    const nome = lead.nome || copy.coluna.semNome
    setMovendo(true)
    const resposta = await servico.moverDeEtapa(lead.id, etapa.chave)
    setMovendo(false)

    if (!resposta.ok) {
      setAviso({ tom: 'erro', texto: copy.movimento.falhas[resposta.motivo] })
    } else {
      setAviso({
        tom: 'status',
        texto:
          resposta.resultado === 'movido'
            ? copy.movimento.movido(nome, etapa.rotulo)
            : copy.movimento.mesmaEtapa(nome, etapa.rotulo),
      })
    }
    await consulta.refetch()
  }

  function trocarFiltro(mudanca: Partial<FiltroDoQuadro>) {
    setFiltro((atual) => ({ ...atual, ...mudanca }))
  }

  return (
    <AreaDeTrabalho
      titulo={copy.titulo}
      lead={copy.apoio}
      acoes={
        <div className="flex flex-wrap items-center gap-3">
          {carga?.ok ? <Selo tom="informacao">{copy.total(carga.funil.total)}</Selo> : null}
          {cargaDaEquipe?.ok ? (
            <button
              type="button"
              className="botao-secundario"
              aria-expanded={configurando}
              onClick={() => setConfigurando((aberto) => !aberto)}
            >
              {configurando ? copy.etapas.fechar : copy.etapas.abrir}
            </button>
          ) : null}
        </div>
      }
    >
      {emLeitura ? <Negativa membros={cargaDaEquipe.equipe.membros} /> : null}

      {configurando && cargaDaEquipe?.ok ? (
        <ConfiguracaoDasEtapas
          podeConfigurar={podeConfigurar}
          administradores={quemConcedeAcesso(cargaDaEquipe.equipe.membros)}
        />
      ) : null}

      <div
        role="group"
        aria-label={copy.filtros.rotulo}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <Seletor
          rotulo={copy.filtros.atividade}
          valor={filtro.periodo}
          aoTrocar={(valor) =>
            trocarFiltro({
              periodo: PERIODOS_DE_ATIVIDADE.find((periodo) => periodo === valor) ?? 'tudo',
            })
          }
        >
          {PERIODOS_DE_ATIVIDADE.map((periodo) => (
            <option key={periodo} value={periodo}>
              {copyDeLeads.atividades[periodo]}
            </option>
          ))}
        </Seletor>

        <Seletor
          rotulo={copy.filtros.origem}
          valor={filtro.origem}
          aoTrocar={(valor) =>
            trocarFiltro({ origem: ORIGENS.find((origem) => origem === valor) ?? '' })
          }
        >
          <option value="">{copy.filtros.todasAsOrigens}</option>
          {ORIGENS.map((origem) => (
            <option key={origem} value={origem}>
              {ORIGEM_EM_PORTUGUES[origem]}
            </option>
          ))}
        </Seletor>

        {filtrado ? (
          <button
            type="button"
            className="botao-fantasma"
            onClick={() => setFiltro(FILTRO_ABERTO)}
          >
            {copy.filtros.limpar}
          </button>
        ) : null}
      </div>

      {aviso?.tom === 'erro' ? <CaixaDeErro>{aviso.texto}</CaixaDeErro> : null}
      {aviso?.tom === 'status' ? (
        <p role="status" className="bloco-secundario m-0 mb-4 px-4 py-3 text-[13.5px]">
          {aviso.texto}
        </p>
      ) : null}

      {consulta.isPending ? <Carregando texto={copy.carregando} /> : null}
      {carga?.ok === false ? <CaixaDeErro>{copy.falha}</CaixaDeErro> : null}

      {carga?.ok && !filtrado && carga.funil.total === 0 && carga.funil.semEtapa === 0 ? (
        <EstadoVazio
          titulo={copy.vazio.titulo}
          explicacao={copy.vazio.explicacao}
          acao={{ rotulo: copy.vazio.acao, endereco: '/leads/importar' }}
        />
      ) : null}

      {carga?.ok && (filtrado || carga.funil.total > 0 || carga.funil.semEtapa > 0) ? (
        <div className="flex flex-col gap-4">
          {filtrado && carga.funil.total === 0 && carga.funil.semEtapa === 0 ? (
            <p className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">{copy.recorteVazio}</p>
          ) : null}

          {carga.funil.semEtapa > 0 ? (
            <p className="bloco-secundario m-0 flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
              {copy.semEtapa(carga.funil.semEtapa)}
              <Link to="/leads" className="botao-link">
                {copy.verSemEtapa}
              </Link>
            </p>
          ) : null}

          {/* Rolagem horizontal, e não quebra de linha: as etapas têm ordem, e
              uma coluna que descesse para a linha de baixo perderia a leitura
              da esquerda para a direita que o funil significa. */}
          <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
            {carga.funil.colunas.map((coluna) => (
              <Coluna
                key={coluna.etapa.chave}
                coluna={coluna}
                etapas={carga.funil.colunas.map((atual) => atual.etapa)}
                podeMover={podeMover && !movendo}
                arrastado={arrastado}
                aoArrastar={setArrastado}
                aoMover={(lead, etapa) => void mover(lead, etapa)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </AreaDeTrabalho>
  )
}

function Negativa({ membros }: { membros: readonly Membro[] }) {
  const administradores = quemConcedeAcesso(membros)

  return (
    <div className="mb-4">
      <CaixaDeErro tom="atencao">
        <p className="m-0 font-medium">{copy.negativa.aviso}</p>
        {administradores.length ? (
          <>
            <p className="mt-3 mb-1.5">{copy.negativa.pedirAcesso}</p>
            <ul
              aria-label={copy.negativa.pedirAcesso}
              className="m-0 flex list-none flex-col gap-1 p-0"
            >
              {administradores.map((membro) => (
                <li key={membro.usuarioId}>
                  {membro.nome} <span className="val text-[12.5px]">{membro.email}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 mb-0">{copy.negativa.semAdministrador}</p>
        )}
      </CaixaDeErro>
    </div>
  )
}

interface PropsDaColuna {
  coluna: ColunaDoFunil
  etapas: readonly EtapaDoFunil[]
  podeMover: boolean
  arrastado: LeadDoFunil | null
  aoArrastar: (lead: LeadDoFunil | null) => void
  aoMover: (lead: LeadDoFunil, etapa: EtapaDoFunil) => void
}

function Coluna({ coluna, etapas, podeMover, arrastado, aoArrastar, aoMover }: PropsDaColuna) {
  // A cor gravada, ou a padrão da chave (seção 10 do design system). A cor
  // acompanha o rótulo escrito, nunca o substitui.
  const ponto = FUNDO_DA_COR[corDaEtapa(coluna.etapa.chave, coluna.etapa.cor)]

  // O lead arrastado viaja no estado da tela, e não só no `dataTransfer`: é o
  // mesmo objeto nos dois caminhos, e o `drop` não depende de o navegador
  // devolver o que o `dragstart` escreveu.
  function aoPassar(evento: DragEvent) {
    if (podeMover && arrastado) evento.preventDefault()
  }

  function aoSoltar(evento: DragEvent) {
    evento.preventDefault()
    const lead = arrastado
    aoArrastar(null)
    if (!podeMover || !lead || lead.etapa?.chave === coluna.etapa.chave) return
    aoMover(lead, coluna.etapa)
  }

  return (
    <section
      aria-label={coluna.etapa.rotulo}
      className="coluna-de-quadro flex w-[264px] shrink-0 flex-col gap-2"
      onDragOver={aoPassar}
      onDrop={aoSoltar}
    >
      <header className="flex items-center justify-between gap-2 px-0.5 pt-0.5 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${ponto}`} />
          <h2 className="m-0 truncate text-[13px] font-extrabold text-texto-principal">
            {coluna.etapa.rotulo}
          </h2>
        </div>
        <span className="val rounded-selo border border-borda-suave bg-superficie-funda px-2 py-0.5 text-[11.5px] font-bold text-texto-apoio">
          {coluna.total}
        </span>
      </header>

      {coluna.leads.length === 0 ? (
        <p className="m-0 rounded-controle border border-dashed border-borda-suave px-3 py-4 text-center text-[12.5px] text-texto-apoio">
          {copy.coluna.vazia}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {coluna.leads.map((lead) => (
            <Cartao
              key={lead.id}
              lead={lead}
              destinos={podeMover ? destinosDoCartao(etapas, lead) : []}
              podeMover={podeMover}
              aoArrastar={aoArrastar}
              aoMover={aoMover}
            />
          ))}
        </ul>
      )}

      {coluna.truncada ? (
        <p className="m-0 px-0.5 text-[12px] text-texto-apoio-claro">
          {copy.coluna.truncada(coluna.total)}
        </p>
      ) : null}

      {coluna.total > 0 ? (
        <Link
          to="/leads"
          search={{ etapa: coluna.etapa.chave }}
          className="botao-link mt-auto self-start px-0.5 pt-1"
        >
          {copy.coluna.verTodos}
        </Link>
      ) : null}
    </section>
  )
}

interface PropsDoCartao {
  lead: LeadDoFunil
  destinos: readonly EtapaDoFunil[]
  podeMover: boolean
  aoArrastar: (lead: LeadDoFunil | null) => void
  aoMover: (lead: LeadDoFunil, etapa: EtapaDoFunil) => void
}

function Cartao({ lead, destinos, podeMover, aoArrastar, aoMover }: PropsDoCartao) {
  const nome = lead.nome || copy.coluna.semNome

  return (
    <li
      className="cartao-de-quadro flex flex-col gap-0.5"
      draggable={podeMover}
      onDragStart={(evento) => {
        evento.dataTransfer?.setData('text/plain', lead.id)
        aoArrastar(lead)
      }}
      onDragEnd={() => aoArrastar(null)}
    >
      <p className="m-0 text-[13px] font-bold text-texto-principal">{nome}</p>
      {lead.empresa ? (
        <p className="m-0 text-[12px] text-texto-apoio">{lead.empresa}</p>
      ) : null}
      <p className="val m-0 mt-1 text-[12px] text-texto-apoio-claro">{lead.telefone}</p>

      <dl className="m-0 mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]">
        <dt className="text-texto-apoio">{copy.cartao.temperatura}</dt>
        <dd className="m-0 text-texto-secundario">
          {lead.temperatura
            ? TEMPERATURA_EM_PORTUGUES[lead.temperatura]
            : copy.cartao.semTemperatura}
        </dd>
        <dt className="text-texto-apoio">{copy.cartao.pontuacao}</dt>
        <dd className="val m-0 text-texto-secundario">
          {lead.pontuacao ?? copy.cartao.semPontuacao}
        </dd>
        <dt className="text-texto-apoio">{copy.cartao.atividade}</dt>
        <dd className="val m-0 text-texto-secundario">
          {lead.ultimaAtividade
            ? formatarInstante(lead.ultimaAtividade)
            : copy.cartao.semAtividade}
        </dd>
      </dl>

      {movidoPelaSarah(lead) || lead.bloqueado ? (
        <p className="m-0 mt-1.5 flex flex-wrap gap-1.5">
          {movidoPelaSarah(lead) ? (
            <Selo tom="acento">{copy.cartao.movidoPelaSarah}</Selo>
          ) : null}
          {lead.bloqueado ? <Selo tom="perigo">{copy.bloqueado}</Selo> : null}
        </p>
      ) : null}

      {podeMover && destinos.length ? (
        <select
          aria-label={copy.cartao.mover(nome)}
          value=""
          onChange={(evento) => {
            const etapa = destinos.find((atual) => atual.chave === evento.target.value)
            if (etapa) aoMover(lead, etapa)
          }}
          className="campo mt-2 cursor-pointer py-1.5 text-[12.5px]"
        >
          <option value="">{copy.cartao.moverPlaceholder}</option>
          {destinos.map((etapa) => (
            <option key={etapa.chave} value={etapa.chave}>
              {etapa.rotulo}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  )
}
