import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import {
  leads as copy,
  ORDENACAO_EM_PORTUGUES,
  ORIGEM_EM_PORTUGUES,
  TEMPERATURA_EM_PORTUGUES,
} from '@/copy/leads'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeOperarLeads, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import {
  acaoHabilitada,
  acoesOferecidas,
  alternarSelecao,
  loteInteiro,
  podarSelecao,
  resumoDoLote,
  rotuloDoLead,
  tudoSelecionado,
  type AcaoEmLote,
} from '@/leads/acoes'
import {
  bloqueadoDaBusca,
  bloqueioDaBusca,
  bloqueioEscolhido,
  BUSCA_LIMPA,
  chaveDaBusca,
  estadoDaLista,
  ORIGENS,
  ordenacaoDaBusca,
  PERIODOS_DE_ATIVIDADE,
  recorteDaBusca,
  RECORTES_DE_BLOQUEIO,
  TEMPERATURAS,
  type BuscaDeLeads,
} from '@/leads/consulta'
import { useServicoDeLeads } from '@/leads/contexto'
import type {
  CargaDeLeads,
  EtapaDoFunil,
  LeadDaLista,
  RespostaDoLote,
  Temperatura,
} from '@/leads/tipos'
import { ORDENACOES } from '@compartilhado/recorte-de-leads.ts'
import { formatarInstante } from '@/utilidades/datas'
import { baixarTexto } from '@/utilidades/download'

const TOM_DA_TEMPERATURA: Record<Temperatura, TomDoSelo> = {
  quente: 'acento',
  morno: 'atencao',
  frio: 'neutro',
}

export function TelaDeLeads() {
  const servico = useServicoDeLeads()
  const servicoDeEquipe = useServicoDeEquipe()
  const busca = useSearch({ from: '/aplicacao/leads' })
  const navegar = useNavigate()

  // A seleção mora aqui, e não na lista: trocar um filtro troca a chave da
  // consulta, a lista volta a `isPending` e o componente dela é desmontado —
  // estado guardado lá dentro sumiria a cada filtro. Aqui ele sobrevive, e
  // quem o poda pelo que está à vista é a lista.
  const [selecionados, definirSelecionados] = useState<string[]>([])

  const consulta = useQuery({
    queryKey: chaveDaBusca(busca),
    // O recorte se monta aqui dentro, e não fora, porque ele carrega o
    // instante da última atividade: calculá-lo no corpo do componente ligaria
    // o resultado ao desenho, e não ao momento em que a consulta sai.
    queryFn: (): Promise<CargaDeLeads> => {
      const leitura = recorteDaBusca(busca)
      if (!leitura.ok) {
        return Promise.resolve({ ok: false, motivo: 'filtro-invalido' })
      }
      return servico.listar(leitura.recorte)
    },
  })

  // O papel de quem olha vem da mesma carga da tela de equipe, e por isso da
  // mesma chave: é o mesmo recurso, e quem já abriu a equipe não busca de novo.
  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  const carga = consulta.data
  const cargaDaEquipe = equipe.data

  // Equipe que não carregou não libera escrita. A política é quem decide de
  // verdade, e oferecer o botão para descobrir que ela nega seria trocar uma
  // negativa explicada por uma recusa no meio do caminho.
  const podeEscrever = cargaDaEquipe?.ok
    ? podeOperarLeads(cargaDaEquipe.equipe.papelDoUsuario)
    : false
  const membros = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.membros : []

  // A busca nova sai da **corrente**, e não da que este desenho leu: dois
  // filtros trocados antes de o primeiro chegar à tela apagariam um ao outro.
  function trocar(mudanca: Partial<BuscaDeLeads>) {
    void navegar({
      to: '/leads',
      search: (atual: BuscaDeLeads) => ({ ...atual, ...mudanca }),
    })
  }

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      <Filtros
        busca={busca}
        etapas={carga?.ok ? carga.pagina.etapas : []}
        aoTrocar={trocar}
        aoLimpar={() => void navegar({ to: '/leads', search: BUSCA_LIMPA })}
      />

      {consulta.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga?.ok ? (
        <CaixaDeErro>
          {copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      ) : (
        <Lista
          pagina={carga.pagina}
          busca={busca}
          podeEscrever={podeEscrever}
          membros={membros}
          selecionados={selecionados}
          aoSelecionar={definirSelecionados}
          aoMudar={() => void consulta.refetch()}
        />
      )}
    </AreaDeTrabalho>
  )
}

const CHAVE_DA_EQUIPE = ['equipe'] as const

/** As três ações que escrevem em lote e têm frase de resultado própria. */
type AcaoDeLote = 'bloquear' | 'desbloquear' | 'excluir'

/**
 * O que a tela tem a dizer depois de uma ação. Fica em `role="status"`: lote
 * parcial é resultado, e anunciá-lo como alerta ensinaria a ler recusa da
 * política como falha do sistema.
 */
type Relato = {
  tom: 'ok' | 'erro'
  texto: string
  /** Quem a política recusou, nomeado. Vazio quando o lote passou inteiro. */
  recusados?: string[]
}

type ListaProps = {
  pagina: Extract<CargaDeLeads, { ok: true }>['pagina']
  busca: BuscaDeLeads
  podeEscrever: boolean
  membros: Membro[]
  selecionados: string[]
  aoSelecionar: (selecao: string[]) => void
  aoMudar: () => void
}

function Lista({
  pagina,
  busca,
  podeEscrever,
  membros,
  selecionados,
  aoSelecionar,
  aoMudar,
}: ListaProps) {
  const servico = useServicoDeLeads()
  const [dialogo, definirDialogo] = useState<AcaoEmLote | null>(null)
  const [relato, definirRelato] = useState<Relato | null>(null)
  const [emCurso, definirEmCurso] = useState(false)

  const estado = estadoDaLista(pagina.leads.length, busca)

  // A seleção se poda no desenho, e não por efeito: filtro novo devolve outras
  // linhas, e um id que saiu da tela não pode continuar contando na barra. O
  // lint desta base recusa sincronizar estado por `useEffect` + `setState`, e
  // derivar é mais simples de qualquer jeito.
  const selecao = podarSelecao(selecionados, pagina.leads)
  const marcados = pagina.leads.filter((lead) => selecao.includes(lead.id))

  function relatarLote(acao: AcaoDeLote, resposta: RespostaDoLote) {
    if (!resposta.ok) {
      definirRelato({ tom: 'erro', texto: copy.falhasDaEscrita[resposta.motivo] })
      return
    }

    const resumo = resumoDoLote(marcados, resposta.resultado)
    definirRelato({
      tom: 'ok',
      texto: copy.resultados[acao](resumo.feitos, resumo.total),
      ...(loteInteiro(resumo) ? {} : { recusados: resumo.recusados }),
    })
    aoSelecionar([])
    aoMudar()
  }

  async function agir(acao: AcaoDeLote, motivo?: string) {
    definirEmCurso(true)
    const ids = selecao
    const resposta =
      acao === 'bloquear'
        ? await servico.bloquear(ids, motivo ?? '')
        : acao === 'desbloquear'
          ? await servico.desbloquear(ids)
          : await servico.excluir(ids)
    definirEmCurso(false)
    definirDialogo(null)
    relatarLote(acao, resposta)
  }

  async function mesclar(destinoId: string) {
    const origemId = selecao.find((id) => id !== destinoId)
    if (!origemId) return

    definirEmCurso(true)
    const resposta = await servico.mesclar(origemId, destinoId)
    definirEmCurso(false)
    definirDialogo(null)

    if (!resposta.ok) {
      definirRelato({
        tom: 'erro',
        texto: copy.falhasDaMesclagem[resposta.motivo],
      })
      return
    }

    definirRelato({ tom: 'ok', texto: copy.resultados.mesclado })
    aoSelecionar([])
    aoMudar()
  }

  /**
   * Exportar age sobre o recorte à vista, e não sobre a seleção: é o recorte
   * que `lead-export` recebe, e é o que garante que a planilha tenha as linhas
   * da tela. Por isso também não recarrega a lista — nada mudou nela.
   */
  async function exportar() {
    const leitura = recorteDaBusca(busca)
    if (!leitura.ok) {
      definirRelato({
        tom: 'erro',
        texto: copy.falhasDaExportacao['filtro-invalido'],
      })
      return
    }

    definirEmCurso(true)
    const resposta = await servico.exportar(leitura.recorte)
    definirEmCurso(false)

    if (!resposta.ok) {
      definirRelato({
        tom: 'erro',
        texto: copy.falhasDaExportacao[resposta.motivo],
      })
      return
    }

    const { nome, conteudo, linhas, foraDoArquivo } = resposta.arquivo
    if (!baixarTexto(nome, conteudo)) {
      definirRelato({ tom: 'erro', texto: copy.exportacao.semDownload })
      return
    }

    const pronta = copy.exportacao.pronta(linhas)
    definirRelato({
      tom: 'ok',
      texto:
        foraDoArquivo > 0
          ? `${pronta} ${copy.exportacao.fora(foraDoArquivo)}`
          : pronta,
    })
  }

  function acionar(acao: AcaoEmLote) {
    definirRelato(null)
    if (acao === 'exportar') {
      void exportar()
      return
    }
    if (acao === 'desbloquear') {
      void agir('desbloquear')
      return
    }
    // Bloquear pede o motivo, excluir pede confirmação e mesclar pergunta quem
    // permanece: os três passam pelo diálogo.
    definirDialogo(acao)
  }

  if (estado === 'conta-sem-lead') {
    return (
      <EstadoVazio
        titulo={copy.vazio.titulo}
        explicacao={copy.vazio.explicacao}
        acao={{ rotulo: copy.vazio.acao, endereco: '/leads/importar' }}
      />
    )
  }

  if (estado === 'recorte-sem-resultado') {
    return (
      <EstadoVazio
        titulo={copy.vazioComFiltro.titulo}
        explicacao={copy.vazioComFiltro.explicacao}
      />
    )
  }

  return (
    <>
      {podeEscrever ? null : <NegativaDeEscrita membros={membros} />}

      <BarraDeAcoes
        selecionados={selecao.length}
        podeEscrever={podeEscrever}
        emCurso={emCurso}
        aoAcionar={acionar}
      />

      {relato ? <RelatoDaAcao relato={relato} /> : null}

      <TabelaDensa
        rotulo={copy.tabela.rotulo}
        colunas={COLUNAS}
        linhas={pagina.leads}
        chaveDaLinha={(lead) => lead.id}
        selecao={{
          rotuloDeTudo: copy.lote.selecionarTudo,
          rotuloDaLinha: (lead) => copy.lote.selecionarLead(rotuloDoLead(lead)),
          selecionada: (lead) => selecao.includes(lead.id),
          tudoSelecionado: tudoSelecionado(selecao, pagina.leads),
          aoAlternar: (lead) => aoSelecionar(alternarSelecao(selecao, lead.id)),
          aoAlternarTudo: () =>
            aoSelecionar(
              tudoSelecionado(selecao, pagina.leads)
                ? []
                : pagina.leads.map((lead) => lead.id),
            ),
        }}
      />

      {pagina.truncada ? (
        <p role="status" className="mt-3 mb-0 text-[12.5px] text-texto-apoio">
          {copy.truncada}
        </p>
      ) : null}

      {dialogo === 'bloquear' ? (
        <DialogoDeBloqueio
          ocupado={emCurso}
          aoConfirmar={(motivo) => void agir('bloquear', motivo)}
          aoCancelar={() => definirDialogo(null)}
        />
      ) : null}

      {dialogo === 'excluir' ? (
        <Dialogo
          titulo={copy.exclusao.titulo}
          explicacao={copy.exclusao.aviso(selecao.length)}
          confirmar={copy.exclusao.confirmar}
          tom="perigo"
          cancelar={copy.cancelar}
          ocupado={emCurso}
          aoConfirmar={() => void agir('excluir')}
          aoCancelar={() => definirDialogo(null)}
        />
      ) : null}

      {dialogo === 'mesclar' ? (
        <DialogoDeMesclagem
          leads={marcados}
          ocupado={emCurso}
          aoConfirmar={(destinoId) => void mesclar(destinoId)}
          aoCancelar={() => definirDialogo(null)}
        />
      ) : null}
    </>
  )
}

/**
 * A negativa de quem só lê: o motivo, o que continua à mão e a quem pedir
 * acesso. É o padrão de `config-discagem.tsx`, em faixa e não em tela cheia —
 * aqui a lista continua sendo o conteúdo, e é ela que o viewer veio ver.
 */
function NegativaDeEscrita({ membros }: { membros: Membro[] }) {
  const administradores = quemConcedeAcesso(membros)

  return (
    <div className="mb-4">
      <CaixaDeErro tom="atencao">
        <p className="m-0 font-medium">{copy.lote.negativa.aviso}</p>
        {administradores.length ? (
          <>
            <p className="mt-3 mb-1.5">{copy.lote.negativa.pedirAcesso}</p>
            <ul
              aria-label={copy.lote.negativa.pedirAcesso}
              className="m-0 flex list-none flex-col gap-1 p-0"
            >
              {administradores.map((membro) => (
                <li key={membro.usuarioId}>
                  {membro.nome}{' '}
                  <span className="val text-[12.5px]">{membro.email}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 mb-0">{copy.lote.negativa.semAdministrador}</p>
        )}
      </CaixaDeErro>
    </div>
  )
}

type BarraDeAcoesProps = {
  selecionados: number
  podeEscrever: boolean
  emCurso: boolean
  aoAcionar: (acao: AcaoEmLote) => void
}

function BarraDeAcoes({
  selecionados,
  podeEscrever,
  emCurso,
  aoAcionar,
}: BarraDeAcoesProps) {
  return (
    <section
      aria-label={copy.lote.rotulo}
      className={`bloco-secundario mb-4 flex flex-wrap items-center gap-3 ${
        selecionados > 0 ? 'border-acento/35 bg-acento-repouso' : ''
      }`}
    >
      <p
        className={`m-0 mr-1 text-[13px] font-bold ${
          selecionados > 0 ? 'text-acento-tinta' : 'text-texto-secundario'
        }`}
      >
        {copy.lote.selecionados(selecionados)}
      </p>

      {acoesOferecidas(selecionados).map((acao) => (
        <button
          key={acao}
          type="button"
          disabled={emCurso || !acaoHabilitada(acao, { selecionados, podeEscrever })}
          onClick={() => aoAcionar(acao)}
          className={`${
            acao === 'excluir' ? 'botao-perigo' : 'botao-secundario'
          } px-3.5 py-1.5 text-[13px]`}
        >
          {copy.lote.acoes[acao]}
        </button>
      ))}

      {emCurso ? (
        <span className="flex items-center gap-2 text-[12.5px] text-texto-apoio">
          <span aria-hidden="true" className="giro size-4! border-2!" />
          {copy.lote.emCurso}
        </span>
      ) : null}
    </section>
  )
}

function RelatoDaAcao({ relato }: { relato: Relato }) {
  return (
    <div
      role="status"
      className={`mb-4 rounded-controle border px-4 py-3 text-[13.5px] ${
        relato.tom === 'erro'
          ? 'border-perigo-borda bg-perigo-fundo text-perigo'
          : 'border-informacao-borda bg-informacao-fundo text-texto-principal'
      }`}
    >
      <p className="m-0">{relato.texto}</p>
      {relato.recusados?.length ? (
        <>
          <p className="mt-2.5 mb-1.5">{copy.resultados.recusados}</p>
          <ul
            aria-label={copy.resultados.recusados}
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {relato.recusados.map((nome) => (
              <li key={nome}>{nome}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

type DialogoDeBloqueioProps = {
  ocupado: boolean
  aoConfirmar: (motivo: string) => void
  aoCancelar: () => void
}

/**
 * O motivo é obrigatório porque o banco o exige: o check de `leads` amarra
 * `blocked_at` e `blocked_reason`, e bloqueio sem motivo escrito não diz nada
 * a quem for revisar a lista de exceções (RF-008).
 */
function DialogoDeBloqueio({
  ocupado,
  aoConfirmar,
  aoCancelar,
}: DialogoDeBloqueioProps) {
  const [motivo, definirMotivo] = useState('')
  const [erro, definirErro] = useState<string>()

  function confirmar() {
    const escrito = motivo.trim()
    if (!escrito) {
      definirErro(copy.bloqueio.motivoObrigatorio)
      return
    }
    aoConfirmar(escrito)
  }

  return (
    <Dialogo
      titulo={copy.bloqueio.titulo}
      explicacao={copy.bloqueio.explicacao}
      confirmar={copy.bloqueio.confirmar}
      cancelar={copy.cancelar}
      ocupado={ocupado}
      aoConfirmar={confirmar}
      aoCancelar={aoCancelar}
    >
      <CampoDeTexto
        rotulo={copy.bloqueio.motivo}
        exemplo={copy.bloqueio.motivoExemplo}
        name="motivo"
        value={motivo}
        erro={erro}
        onChange={(evento) => definirMotivo(evento.target.value)}
      />
    </Dialogo>
  )
}

type DialogoDeMesclagemProps = {
  leads: LeadDaLista[]
  ocupado: boolean
  aoConfirmar: (destinoId: string) => void
  aoCancelar: () => void
}

/**
 * Mesclar é escolher quem permanece, e a escolha é de quem clicou: o RPC
 * `lead_merge` grava `merged_into_id` na origem e preenche no destino o que
 * estava vazio, o que não é reversível pela tela. Decidir por ordem de seleção
 * seria decidir por acaso.
 */
function DialogoDeMesclagem({
  leads,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: DialogoDeMesclagemProps) {
  const primeiro = leads[0]
  const [destino, definirDestino] = useState(primeiro?.id ?? '')

  if (!primeiro) return null

  return (
    <Dialogo
      titulo={copy.mesclagem.titulo}
      explicacao={copy.mesclagem.explicacao}
      confirmar={copy.mesclagem.confirmar}
      cancelar={copy.cancelar}
      ocupado={ocupado}
      aoConfirmar={() => aoConfirmar(destino)}
      aoCancelar={aoCancelar}
    >
      <Seletor
        rotulo={copy.mesclagem.escolha}
        valor={destino}
        aoTrocar={definirDestino}
      >
        {leads.map((lead) => (
          <option key={lead.id} value={lead.id}>
            {rotuloDoLead(lead)}
          </option>
        ))}
      </Seletor>
    </Dialogo>
  )
}

const COLUNAS: readonly ColunaDensa<LeadDaLista>[] = [
  {
    titulo: copy.tabela.colunas.nome,
    classe: 'font-medium text-texto-principal',
    conteudo: (lead) => (
      <span className="flex flex-wrap items-center gap-2">
        <Link to="/leads/$id" params={{ id: lead.id }} className="text-texto-principal">
          {lead.nome || copy.tabela.semNome}
        </Link>
        {lead.bloqueado ? <Selo tom="perigo">{copy.tabela.bloqueado}</Selo> : null}
      </span>
    ),
  },
  {
    titulo: copy.tabela.colunas.telefone,
    // Telefone é dado que se lê como valor, e por isso vai na fonte de valor.
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-secundario',
    conteudo: (lead) => lead.telefone,
  },
  {
    titulo: copy.tabela.colunas.empresa,
    classe: 'text-texto-secundario',
    conteudo: (lead) => lead.empresa,
  },
  {
    titulo: copy.tabela.colunas.lugar,
    classe: 'text-texto-secundario',
    conteudo: (lead) => lugarDoLead(lead),
  },
  {
    titulo: copy.tabela.colunas.etapa,
    classe: 'text-texto-secundario',
    conteudo: (lead) => lead.etapa?.rotulo ?? copy.tabela.semEtapa,
  },
  {
    titulo: copy.tabela.colunas.temperatura,
    conteudo: (lead) =>
      lead.temperatura ? (
        <Selo tom={TOM_DA_TEMPERATURA[lead.temperatura]}>
          {TEMPERATURA_EM_PORTUGUES[lead.temperatura]}
        </Selo>
      ) : (
        copy.tabela.semTemperatura
      ),
  },
  {
    titulo: copy.tabela.colunas.atividade,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-apoio',
    conteudo: (lead) =>
      lead.ultimaAtividade
        ? formatarInstante(lead.ultimaAtividade)
        : copy.tabela.semAtividade,
  },
]

/** Cidade e estado numa coluna só, porque um sem o outro não localiza nada. */
function lugarDoLead(lead: LeadDaLista): string {
  return [lead.cidade, lead.estado].filter(Boolean).join(', ')
}

type FiltrosProps = {
  busca: BuscaDeLeads
  etapas: EtapaDoFunil[]
  aoTrocar: (mudanca: Partial<BuscaDeLeads>) => void
  aoLimpar: () => void
}

function Filtros({ busca, etapas, aoTrocar, aoLimpar }: FiltrosProps) {
  return (
    <section
      aria-label={copy.filtros.titulo}
      className="bloco-secundario mb-5 flex flex-wrap items-end gap-4"
    >
      <CampoDeBusca
        // O termo da barra de endereço remonta o campo: é o que faz "Limpar
        // filtros" esvaziar o que está escrito sem sincronizar estado por
        // efeito, que o lint desta base recusa.
        key={busca.termo ?? ''}
        termo={busca.termo ?? ''}
        aoBuscar={(termo) => aoTrocar({ termo: termo || undefined })}
      />

      <Seletor
        rotulo={copy.filtros.etapa}
        valor={busca.etapa ?? ''}
        aoTrocar={(valor) => aoTrocar({ etapa: valor || undefined })}
      >
        <option value="">{copy.filtros.todasAsEtapas}</option>
        {etapas.map((etapa) => (
          <option key={etapa.chave} value={etapa.chave}>
            {etapa.rotulo}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.temperatura}
        valor={busca.temperatura ?? ''}
        aoTrocar={(valor) => aoTrocar({ temperatura: valor || undefined })}
      >
        <option value="">{copy.filtros.todasAsTemperaturas}</option>
        {TEMPERATURAS.map((temperatura) => (
          <option key={temperatura} value={temperatura}>
            {TEMPERATURA_EM_PORTUGUES[temperatura]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.origem}
        valor={busca.origem ?? ''}
        aoTrocar={(valor) => aoTrocar({ origem: valor || undefined })}
      >
        <option value="">{copy.filtros.todasAsOrigens}</option>
        {ORIGENS.map((origem) => (
          <option key={origem} value={origem}>
            {ORIGEM_EM_PORTUGUES[origem]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.atividade}
        valor={busca.atividade ?? 'tudo'}
        aoTrocar={(valor) =>
          aoTrocar({ atividade: valor === 'tudo' ? undefined : valor })
        }
      >
        {PERIODOS_DE_ATIVIDADE.map((periodo) => (
          <option key={periodo} value={periodo}>
            {copy.atividades[periodo]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.bloqueio}
        valor={bloqueioDaBusca(busca.bloqueado)}
        aoTrocar={(valor) =>
          aoTrocar({ bloqueado: bloqueadoDaBusca(bloqueioEscolhido(valor)) })
        }
      >
        {RECORTES_DE_BLOQUEIO.map((recorte) => (
          <option key={recorte} value={recorte}>
            {copy.bloqueios[recorte]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.ordenacao}
        valor={ordenacaoDaBusca(busca.ordenacao)}
        aoTrocar={(valor) => aoTrocar({ ordenacao: valor })}
      >
        {ORDENACOES.map((ordenacao) => (
          <option key={ordenacao} value={ordenacao}>
            {ORDENACAO_EM_PORTUGUES[ordenacao]}
          </option>
        ))}
      </Seletor>

      <button type="button" onClick={aoLimpar} className="botao-link mb-2.5">
        {copy.filtros.limpar}
      </button>
    </section>
  )
}

type CampoDeBuscaProps = {
  termo: string
  aoBuscar: (termo: string) => void
}

/**
 * A busca é por envio, e não por tecla: cada letra digitada seria uma consulta
 * ao servidor e um endereço novo no histórico do navegador.
 */
function CampoDeBusca({ termo, aoBuscar }: CampoDeBuscaProps) {
  const [texto, definirTexto] = useState(termo)

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    aoBuscar(texto.trim())
  }

  return (
    <form onSubmit={enviar} className="flex min-w-[220px] flex-col gap-1.5">
      <label
        htmlFor="busca-de-leads"
        className="text-[13px] font-semibold text-texto-secundario"
      >
        {copy.filtros.termo}
      </label>
      <input
        id="busca-de-leads"
        type="search"
        value={texto}
        placeholder={copy.filtros.termoExplicacao}
        onChange={(evento) => definirTexto(evento.target.value)}
        className="campo py-2 text-[13.5px]"
      />
    </form>
  )
}
