import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import { reunioes as copy } from '@/copy/reunioes'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeMarcarDesfecho } from '@/equipe/papeis'
import { MODALIDADES } from '@/especialistas/tipos'
import {
  BUSCA_LIMPA,
  chaveDaBusca,
  dataDoDia,
  especialistasDaAgenda,
  PERIODO_PADRAO,
  PERIODOS,
  recorteDaBusca,
  relogioDaReuniao,
  reunioesPorDia,
  TETO_DA_LISTA,
  type BuscaDeReunioes,
  type SemanaDaAgenda,
  type VisaoDasReunioes,
} from '@/reunioes/consulta'
import { useServicoDeReunioes } from '@/reunioes/contexto'
import { aguardaApuracao } from '@/reunioes/desfecho'
import { MarcacaoDoDesfecho } from '@/reunioes/marcacao-do-desfecho'
import { marcasDaReuniao } from '@/reunioes/marcas'
import {
  ESTADOS_DA_REUNIAO,
  type CargaDeReunioes,
  type EspecialistaDaAgenda,
  type EstadoDaReuniao,
  type PaginaDeReunioes,
  type ReuniaoDaLista,
} from '@/reunioes/tipos'
import { estadoDasReunioes } from '@/utilidades/vazio-das-reunioes'

const TOM_DO_ESTADO: Record<EstadoDaReuniao, TomDoSelo> = {
  scheduled: 'informacao',
  confirmed: 'positivo',
  rescheduled: 'neutro',
  canceled: 'neutro',
  attended: 'positivo',
  no_show: 'perigo',
}

/**
 * `/reunioes`: a agenda da semana por especialista e a lista filtrável
 * (US-179, RF-510).
 *
 * O recorte inteiro viaja na barra de endereço, e o que o serviço recebe se
 * monta dentro do `queryFn` por `recorteDaBusca`, no fuso da conta: é ele que
 * tira o ensaio (T-16) e decide onde a semana começa. O fuso vem de uma carga
 * própria, feita uma vez, junto com os especialistas do seletor.
 */
export function TelaDeReunioes() {
  const servico = useServicoDeReunioes()
  const servicoDeEquipe = useServicoDeEquipe()
  const cliente = useQueryClient()
  const busca = useSearch({ from: '/aplicacao/reunioes' })
  const navegar = useNavigate()
  const [agora] = useState(() => Date.now())

  // O papel vem da mesma carga da tela de equipe. Equipe que não carregou não
  // libera a marcação do desfecho: quem recusa é o RPC, e a tela só evita
  // oferecer o que ele nega.
  const equipe = useQuery({ queryKey: ['equipe'], queryFn: () => servicoDeEquipe.carregar() })
  const podeMarcar = equipe.data?.ok === true && podeMarcarDesfecho(equipe.data.equipe.papelDoUsuario)

  const contexto = useQuery({
    queryKey: ['reunioes', 'contexto'],
    queryFn: () => servico.carregarContexto(),
  })
  const lido = contexto.data?.ok ? contexto.data : null
  const fusoDaConta = lido?.fusoDaConta ?? ''

  const consulta = useQuery({
    queryKey: chaveDaBusca(busca, fusoDaConta),
    enabled: lido !== null,
    queryFn: async (): Promise<{ carga: CargaDeReunioes; semana: SemanaDaAgenda | null }> => {
      const leitura = recorteDaBusca(busca, fusoDaConta)
      if (!leitura.ok) return { carga: { ok: false, motivo: 'filtro-invalido' }, semana: null }
      return { carga: await servico.listarReunioes(leitura.recorte), semana: leitura.semana }
    },
  })

  // A busca nova sai da corrente, e não da que este desenho leu: dois filtros
  // trocados antes de o primeiro chegar à tela apagariam um ao outro.
  function trocar(mudanca: Partial<BuscaDeReunioes>) {
    void navegar({
      to: '/reunioes',
      search: (atual: BuscaDeReunioes) => ({ ...atual, ...mudanca }),
    })
  }

  // O deslocamento também sai da busca corrente: "esta semana" seguido de
  // "semana anterior" antes do desenho partiria da semana que já ficou.
  function moverSemana(passo: number | 'atual') {
    void navegar({
      to: '/reunioes',
      search: (atual: BuscaDeReunioes) => {
        const destino = passo === 'atual' ? 0 : (Number(atual.semana ?? 0) || 0) + passo
        return { ...atual, semana: destino === 0 ? undefined : String(destino) }
      },
    })
  }

  const visao: VisaoDasReunioes = busca.vista === 'lista' ? 'lista' : 'agenda'

  function conteudo() {
    if (contexto.isPending) return <Carregando texto={copy.carregando} />
    if (!contexto.data?.ok) {
      return <CaixaDeErro>{copy.falhas[contexto.data?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
    }
    if (consulta.isPending) return <Carregando texto={copy.carregando} />
    const resposta = consulta.data
    if (!resposta) return <CaixaDeErro>{copy.falhas['falha-de-comunicacao']}</CaixaDeErro>
    if (!resposta.carga.ok) return <CaixaDeErro>{copy.falhas[resposta.carga.motivo]}</CaixaDeErro>
    return (
      <Resultado
        pagina={resposta.carga.pagina}
        semana={resposta.semana}
        especialistas={contexto.data.especialistas}
        especialistaId={busca.especialista}
        fusoDaConta={contexto.data.fusoDaConta}
        desfecho={{
          podeMarcar,
          agora,
          aoMarcar: () => void cliente.invalidateQueries({ queryKey: ['reunioes'] }),
        }}
      />
    )
  }

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.apoio}>
      <EscolhaDaVisao visao={visao} aoTrocar={(nova) => trocar({ vista: nova === 'agenda' ? undefined : nova })} />
      <Filtros
        busca={busca}
        visao={visao}
        especialistas={lido?.especialistas ?? []}
        aoTrocar={trocar}
        aoMoverSemana={moverSemana}
        aoLimpar={() => void navegar({ to: '/reunioes', search: { ...BUSCA_LIMPA, vista: busca.vista } })}
      />
      {conteudo()}
    </AreaDeTrabalho>
  )
}

function EscolhaDaVisao({
  visao,
  aoTrocar,
}: {
  visao: VisaoDasReunioes
  aoTrocar: (visao: VisaoDasReunioes) => void
}) {
  return (
    <div role="group" aria-label={copy.visoes.rotulo} className="mb-4 flex gap-2">
      {(['agenda', 'lista'] as const).map((opcao) => (
        <button
          key={opcao}
          type="button"
          aria-pressed={visao === opcao}
          onClick={() => aoTrocar(opcao)}
          className={visao === opcao ? 'botao-primario' : 'botao-secundario'}
        >
          {copy.visoes[opcao]}
        </button>
      ))}
    </div>
  )
}

/** O que a coluna do desfecho precisa: quem pode marcar, o instante da montagem e a releitura. */
type DesfechoDaLista = {
  podeMarcar: boolean
  agora: number
  aoMarcar: () => void
}

type ResultadoProps = {
  pagina: PaginaDeReunioes
  semana: SemanaDaAgenda | null
  especialistas: readonly EspecialistaDaAgenda[]
  especialistaId: string | undefined
  fusoDaConta: string
  desfecho: DesfechoDaLista
}

function Resultado({ pagina, semana, especialistas, especialistaId, fusoDaConta, desfecho }: ResultadoProps) {
  const estado = estadoDasReunioes(pagina.reunioes.length, pagina.contaTemReuniao)

  if (estado === 'nenhuma-reuniao') {
    return (
      <EstadoVazio
        titulo={copy.vazio.titulo}
        explicacao={copy.vazio.explicacao}
        acao={{ rotulo: copy.vazio.acao, endereco: '/especialistas' }}
      />
    )
  }

  if (estado === 'recorte-vazio') {
    return <EstadoVazio titulo={copy.vazioComFiltro.titulo} explicacao={copy.vazioComFiltro.explicacao} />
  }

  return (
    <>
      <p className="mt-0 mb-3 text-[12.5px] text-texto-apoio">{copy.agenda.fusoDaConta(fusoDaConta)}</p>
      {semana ? (
        <Agenda
          reunioes={pagina.reunioes}
          semana={semana}
          especialistas={especialistasDaAgenda(especialistas, pagina.reunioes, especialistaId)}
          fusoDaConta={fusoDaConta}
        />
      ) : (
        <TabelaDensa
          rotulo={copy.tabela.rotulo}
          colunas={colunasDaLista(fusoDaConta, desfecho)}
          linhas={pagina.reunioes}
          chaveDaLinha={(reuniao) => reuniao.id}
        />
      )}
      {pagina.truncada ? (
        <p role="status" className="mt-3 mb-0 text-[12.5px] text-texto-apoio">
          {copy.teto(TETO_DA_LISTA)}
        </p>
      ) : null}
    </>
  )
}

/**
 * O horário no fuso da conta e, quando o especialista está em outro, o dele
 * ao lado: quem liga para o especialista precisa das duas horas.
 */
function Horario({
  reuniao,
  fusoDaConta,
  comDia,
}: {
  reuniao: ReuniaoDaLista
  fusoDaConta: string
  comDia: boolean
}) {
  const daConta = relogioDaReuniao(reuniao.inicio, fusoDaConta)
  const outroFuso = reuniao.especialista.fuso !== fusoDaConta
  return (
    <>
      <span className="val">{comDia ? copy.horario(daConta) : copy.hora(daConta)}</span>
      {outroFuso ? (
        <span className="val ml-1.5 text-[12px] text-texto-apoio">
          ({copy.horaDoEspecialista(relogioDaReuniao(reuniao.inicio, reuniao.especialista.fuso), reuniao.especialista.fuso)})
        </span>
      ) : null}
    </>
  )
}

function Agenda({
  reunioes,
  semana,
  especialistas,
  fusoDaConta,
}: {
  reunioes: readonly ReuniaoDaLista[]
  semana: SemanaDaAgenda
  especialistas: readonly EspecialistaDaAgenda[]
  fusoDaConta: string
}) {
  if (especialistas.length === 0) {
    return <p className="text-[13.5px] text-texto-apoio">{copy.agenda.semEspecialista}</p>
  }

  const porEspecialista = new Map(
    especialistas.map((especialista) => [
      especialista.id,
      reunioesPorDia(reunioes, especialista.id, semana, fusoDaConta),
    ]),
  )

  const colunas: ColunaDensa<EspecialistaDaAgenda>[] = [
    {
      titulo: copy.agenda.especialista,
      classe: 'font-medium text-texto-principal',
      conteudo: (especialista) => (
        <span className="flex flex-col gap-0.5">
          <span>{especialista.ativo ? especialista.nome : copy.filtros.inativo(especialista.nome)}</span>
          {especialista.fuso !== fusoDaConta ? (
            <span className="text-[12px] font-normal text-texto-apoio">
              {copy.agenda.fusoDoEspecialista(especialista.fuso)}
            </span>
          ) : null}
        </span>
      ),
    },
    ...semana.dias.map(
      (diaCivil, indice): ColunaDensa<EspecialistaDaAgenda> => ({
        titulo: copy.agenda.dia(dataDoDia(diaCivil)),
        classe: 'align-top text-[12.5px]',
        conteudo: (especialista) => {
          const doDia = porEspecialista.get(especialista.id)?.[indice] ?? []
          if (doDia.length === 0) return <span className="text-texto-apoio">{copy.agenda.diaLivre}</span>
          return (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {doDia.map((reuniao) => (
                <li key={reuniao.id}>
                  <Horario reuniao={reuniao} fusoDaConta={fusoDaConta} comDia={false} />
                  <span className="ml-1.5 text-texto-secundario">
                    <LinkDaFicha reuniao={reuniao} />
                  </span>
                  {marcasDaReuniao(reuniao).length > 0 ? (
                    <span className="ml-1.5">
                      <Selo tom="atencao">{copy.marcas[marcasDaReuniao(reuniao)[0]!].rotulo}</Selo>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        },
      }),
    ),
  ]

  return (
    <TabelaDensa
      rotulo={copy.agenda.rotulo}
      colunas={colunas}
      linhas={especialistas}
      chaveDaLinha={(especialista) => especialista.id}
    />
  )
}

function LinkDaFicha({ reuniao }: { reuniao: ReuniaoDaLista }) {
  return (
    <Link
      to="/reunioes/$id"
      params={{ id: reuniao.id }}
      className="text-inherit no-underline hover:text-menta-2 hover:underline"
    >
      {reuniao.lead.nome}
    </Link>
  )
}

function Pendencias({ reuniao }: { reuniao: ReuniaoDaLista }) {
  const marcas = marcasDaReuniao(reuniao)
  if (marcas.length === 0) return <span className="text-texto-apoio">{copy.tabela.semPendencia}</span>
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {marcas.map((marca) => (
        <li key={marca} className="flex flex-col items-start gap-0.5">
          <Selo tom="atencao">{copy.marcas[marca].rotulo}</Selo>
          <span className="text-[12px] text-texto-apoio">{copy.marcas[marca].oQueFazer}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * O desfecho na lista: a apurada diz como foi apurada, e a que passou do fim
 * sem ninguém marcar diz "não apurada", nunca falta (RF-516).
 */
function Desfecho({ reuniao, desfecho }: { reuniao: ReuniaoDaLista; desfecho: DesfechoDaLista }) {
  const rotulo =
    reuniao.apuracao === 'attested'
      ? copy.apuracoes.attested
      : aguardaApuracao(reuniao, desfecho.agora)
        ? copy.apuracoes.pending
        : null
  return (
    <div className="flex flex-col items-start gap-1.5">
      {rotulo ? <span className="text-[12.5px] text-texto-apoio">{rotulo}</span> : null}
      {desfecho.podeMarcar ? <MarcacaoDoDesfecho reuniao={reuniao} aoMarcar={desfecho.aoMarcar} /> : null}
    </div>
  )
}

function colunasDaLista(fusoDaConta: string, desfecho: DesfechoDaLista): readonly ColunaDensa<ReuniaoDaLista>[] {
  return [
    {
      titulo: copy.tabela.colunas.horario,
      classe: 'text-[12.5px] whitespace-nowrap text-texto-secundario',
      conteudo: (reuniao) => <Horario reuniao={reuniao} fusoDaConta={fusoDaConta} comDia />,
    },
    {
      titulo: copy.tabela.colunas.lead,
      classe: 'font-medium text-texto-principal',
      conteudo: (reuniao) => <LinkDaFicha reuniao={reuniao} />,
    },
    {
      titulo: copy.tabela.colunas.especialista,
      classe: 'text-texto-secundario',
      conteudo: (reuniao) => reuniao.especialista.nome,
    },
    {
      titulo: copy.tabela.colunas.modalidade,
      classe: 'text-texto-secundario',
      conteudo: (reuniao) => copy.modalidades[reuniao.modalidade],
    },
    {
      titulo: copy.tabela.colunas.estado,
      conteudo: (reuniao) => <Selo tom={TOM_DO_ESTADO[reuniao.estado]}>{copy.estados[reuniao.estado]}</Selo>,
    },
    {
      titulo: copy.tabela.colunas.origem,
      classe: 'text-texto-secundario',
      conteudo: (reuniao) =>
        reuniao.chamadaDaMarcacao ? (
          <Link
            to="/chamadas/$id"
            params={{ id: reuniao.chamadaDaMarcacao }}
            className="text-texto-principal no-underline hover:text-menta-2 hover:underline"
          >
            {copy.tabela.marcadaNaLigacao}
          </Link>
        ) : (
          copy.tabela.marcadaManualmente
        ),
    },
    {
      titulo: copy.tabela.colunas.pendencias,
      conteudo: (reuniao) => <Pendencias reuniao={reuniao} />,
    },
    {
      titulo: copy.tabela.colunas.desfecho,
      conteudo: (reuniao) => <Desfecho reuniao={reuniao} desfecho={desfecho} />,
    },
  ]
}

type FiltrosProps = {
  busca: BuscaDeReunioes
  visao: VisaoDasReunioes
  especialistas: readonly EspecialistaDaAgenda[]
  aoTrocar: (mudanca: Partial<BuscaDeReunioes>) => void
  aoMoverSemana: (passo: number | 'atual') => void
  aoLimpar: () => void
}

function Filtros({ busca, visao, especialistas, aoTrocar, aoMoverSemana, aoLimpar }: FiltrosProps) {
  const semana = Number(busca.semana ?? 0) || 0

  return (
    <section aria-label={copy.filtros.titulo} className="bloco-secundario mb-5 flex flex-wrap items-end gap-4">
      <Seletor
        rotulo={copy.filtros.especialista}
        valor={busca.especialista ?? ''}
        aoTrocar={(valor) => aoTrocar({ especialista: valor || undefined })}
      >
        <option value="">{copy.filtros.todosOsEspecialistas}</option>
        {especialistas.map((especialista) => (
          <option key={especialista.id} value={especialista.id}>
            {especialista.ativo ? especialista.nome : copy.filtros.inativo(especialista.nome)}
          </option>
        ))}
      </Seletor>

      {visao === 'lista' ? (
        <Seletor
          rotulo={copy.filtros.periodo}
          valor={busca.periodo ?? PERIODO_PADRAO}
          aoTrocar={(valor) => aoTrocar({ periodo: valor === PERIODO_PADRAO ? undefined : valor })}
        >
          {PERIODOS.map((periodo) => (
            <option key={periodo} value={periodo}>
              {copy.periodos[periodo]}
            </option>
          ))}
        </Seletor>
      ) : (
        <div role="group" aria-label={copy.semana.rotulo} className="flex gap-2">
          <button type="button" className="botao-secundario" onClick={() => aoMoverSemana(-1)}>
            {copy.semana.anterior}
          </button>
          <button
            type="button"
            className="botao-secundario"
            aria-pressed={semana === 0}
            onClick={() => aoMoverSemana('atual')}
          >
            {copy.semana.atual}
          </button>
          <button type="button" className="botao-secundario" onClick={() => aoMoverSemana(1)}>
            {copy.semana.proxima}
          </button>
        </div>
      )}

      <Seletor
        rotulo={copy.filtros.estado}
        valor={busca.estado ?? ''}
        aoTrocar={(valor) => aoTrocar({ estado: valor || undefined })}
      >
        <option value="">{copy.filtros.todosOsEstados}</option>
        {ESTADOS_DA_REUNIAO.map((estado) => (
          <option key={estado} value={estado}>
            {copy.estados[estado]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.modalidade}
        valor={busca.modalidade ?? ''}
        aoTrocar={(valor) => aoTrocar({ modalidade: valor || undefined })}
      >
        <option value="">{copy.filtros.todasAsModalidades}</option>
        {MODALIDADES.map((modalidade) => (
          <option key={modalidade} value={modalidade}>
            {copy.modalidades[modalidade]}
          </option>
        ))}
      </Seletor>

      <button type="button" onClick={aoLimpar} className="botao-link mb-2.5">
        {copy.filtros.limpar}
      </button>
    </section>
  )
}
