import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { EntregaDoConvite } from '@compartilhado/agenda/convite-de-reuniao.ts'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { reunioes } from '@/copy/reunioes'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeMarcarDesfecho } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { relogioDaReuniao } from '@/reunioes/consulta'
import { useServicoDeReunioes } from '@/reunioes/contexto'
import { MarcacaoDoDesfecho } from '@/reunioes/marcacao-do-desfecho'
import {
  estadoDoConvite,
  estadoDoEvento,
  historicoDaFicha,
  marcaDoItem,
  type EstadoDoConvite,
  type EstadoDoEvento,
  type ItemVerificado,
} from '@/reunioes/ficha'
import { blocosDoResumo, escreverChave, type BlocoDoResumo, type ItemDoResumo } from '@/reunioes/resumo-de-passagem'
import type { ApuracaoDaReuniao, EstadoDaReuniao, FichaDaReuniao, MarcacaoDoDesfecho as Marcacao } from '@/reunioes/tipos'

const copy = reunioes.ficha

const TOM_DO_ESTADO: Record<EstadoDaReuniao, TomDoSelo> = {
  scheduled: 'informacao',
  confirmed: 'positivo',
  rescheduled: 'neutro',
  canceled: 'neutro',
  attended: 'positivo',
  no_show: 'perigo',
}

const TOM_DA_APURACAO: Record<ApuracaoDaReuniao, TomDoSelo> = {
  pending: 'atencao',
  attested: 'positivo',
  unattested: 'neutro',
}

const TOM_DO_EVENTO: Record<EstadoDoEvento, TomDoSelo> = {
  criado: 'positivo',
  removendo: 'informacao',
  'sem-evento': 'atencao',
  tentando: 'informacao',
  desistiu: 'perigo',
}

const TOM_DO_CONVITE: Record<EstadoDoConvite, TomDoSelo> = {
  enviado: 'positivo',
  'sem-email': 'atencao',
  'email-nao-configurado': 'atencao',
  'na-fila': 'informacao',
  tentando: 'informacao',
  desistiu: 'perigo',
}

/**
 * `/reunioes/:id`: a ficha da reunião (US-180, RF-511).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **Não encontrada é uma só.** Reunião que não existe, de outra conta e de
 *    ensaio dão a mesma tela: a RLS e a visão `reunioes_reais` já devolvem
 *    zero linha, e distinguir os casos viraria oráculo de existência.
 * 2. **O resumo de passagem nunca aparece como JSON.** Ele não tem forma fixa;
 *    `blocosDoResumo` o parte em blocos com rótulo, e o que não se lê some.
 * 3. **Falha de entrega vem com o que fazer**, pela mesma regra das marcas da
 *    lista: só a reunião ativa pede alguma coisa de alguém.
 * 4. **O desfecho nunca é deduzido** (US-181, RF-516). Reunião que ninguém
 *    apurou diz "não apurada", inclusive depois do horário, e só muda quando
 *    alguém marca. O papel vem da carga da equipe, pela mesma chave da tela de
 *    equipe; equipe que não carregou não libera a marcação.
 */
export function TelaDaReuniao() {
  const { id } = useParams({ from: '/aplicacao/reunioes/$id' })
  const servico = useServicoDeReunioes()
  const servicoDeEquipe = useServicoDeEquipe()
  const cliente = useQueryClient()

  const consulta = useQuery({
    queryKey: ['reuniao', id],
    queryFn: () => servico.carregarFicha(id),
  })
  const equipe = useQuery({ queryKey: ['equipe'], queryFn: () => servicoDeEquipe.carregar() })

  if (consulta.isPending) {
    return (
      <Moldura>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const carga = consulta.data

  if (carga?.ok === false && carga.motivo === 'nao-encontrada') {
    return (
      <Moldura>
        <EstadoVazio
          titulo={copy.naoEncontrada.titulo}
          explicacao={copy.naoEncontrada.explicacao}
          acao={{ rotulo: copy.naoEncontrada.acao, endereco: '/reunioes' }}
        />
      </Moldura>
    )
  }

  if (!carga?.ok) {
    const motivo = carga?.motivo ?? 'falha-de-comunicacao'
    return (
      <Moldura>
        <CaixaDeErro>{copy.falhas[motivo === 'nao-encontrada' ? 'falha-de-comunicacao' : motivo]}</CaixaDeErro>
      </Moldura>
    )
  }

  const lidaDaEquipe = equipe.data?.ok ? equipe.data.equipe : null
  return (
    <Ficha
      ficha={carga.ficha}
      podeMarcar={lidaDaEquipe !== null && podeMarcarDesfecho(lidaDaEquipe.papelDoUsuario)}
      membros={lidaDaEquipe?.membros ?? []}
      aoMarcar={() => {
        void cliente.invalidateQueries({ queryKey: ['reuniao', id] })
        void cliente.invalidateQueries({ queryKey: ['reunioes'] })
      }}
    />
  )
}

function Moldura({
  titulo = copy.titulo,
  lead = copy.apoio,
  children,
}: {
  titulo?: string
  lead?: string
  children: ReactNode
}) {
  return (
    <AreaDeTrabalho
      titulo={titulo}
      lead={lead}
      acoes={
        <Link to="/reunioes" className="botao-secundario no-underline">
          {copy.voltar}
        </Link>
      }
    >
      {children}
    </AreaDeTrabalho>
  )
}

type FichaProps = {
  ficha: FichaDaReuniao
  podeMarcar: boolean
  membros: readonly Membro[]
  aoMarcar: () => void
}

function Ficha({ ficha, podeMarcar, membros, aoMarcar }: FichaProps) {
  const nome = ficha.lead.nome || copy.leadSemNome
  return (
    <Moldura titulo={copy.cabecalho(nome, ficha.especialista.nome)}>
      <div className="flex flex-col gap-5">
        <Dados ficha={ficha} nome={nome} />
        <Desfecho ficha={ficha} podeMarcar={podeMarcar} membros={membros} aoMarcar={aoMarcar} />
        <Resumo ficha={ficha} />
        <Historico ficha={ficha} />
        <Entregas ficha={ficha} />
      </div>
    </Moldura>
  )
}

function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="rotulo-de-indicador">{titulo}</dt>
      <dd className="m-0 font-semibold text-texto-principal">{children}</dd>
    </div>
  )
}

/** O intervalo no fuso dado, "qui 01/10, 14:00 a 14:30". */
function intervalo(ficha: FichaDaReuniao, fuso: string): string {
  return copy.dados.intervalo(relogioDaReuniao(ficha.inicio, fuso), relogioDaReuniao(ficha.fim, fuso))
}

function Horario({ ficha }: { ficha: FichaDaReuniao }) {
  const doEspecialista = ficha.especialista.fuso
  if (doEspecialista === ficha.fusoDoLead) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="val">{intervalo(ficha, doEspecialista)}</span>
        <span className="text-[12.5px] font-normal text-texto-apoio">{copy.dados.noFusoDosDois(doEspecialista)}</span>
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex flex-col gap-0.5">
        <span className="val">{intervalo(ficha, doEspecialista)}</span>
        <span className="text-[12.5px] font-normal text-texto-apoio">
          {copy.dados.noFusoDoEspecialista(doEspecialista)}
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="val">{intervalo(ficha, ficha.fusoDoLead)}</span>
        <span className="text-[12.5px] font-normal text-texto-apoio">{copy.dados.noFusoDoLead(ficha.fusoDoLead)}</span>
      </span>
    </span>
  )
}

function Dados({ ficha, nome }: { ficha: FichaDaReuniao; nome: string }) {
  const pedeSala = ficha.modalidade === 'video'
  return (
    <Painel
      rotulo={copy.dados.titulo}
      titulo={copy.dados.titulo}
      estado={<Selo tom={TOM_DO_ESTADO[ficha.estado]}>{reunioes.estados[ficha.estado]}</Selo>}
    >
      <dl className="m-0 grid grid-cols-3 gap-x-6 gap-y-4 max-lg:grid-cols-2 max-md:grid-cols-1">
        <Campo titulo={copy.dados.lead}>{nome}</Campo>
        {ficha.lead.empresa ? <Campo titulo={copy.dados.empresa}>{ficha.lead.empresa}</Campo> : null}
        <Campo titulo={copy.dados.email}>
          {ficha.lead.email ?? <span className="font-normal text-texto-apoio">{copy.dados.semEmail}</span>}
        </Campo>
        {ficha.lead.telefone ? (
          <Campo titulo={copy.dados.telefone}>
            <span className="val">{ficha.lead.telefone}</span>
          </Campo>
        ) : null}
        <Campo titulo={copy.dados.especialista}>{ficha.especialista.nome}</Campo>
        <Campo titulo={copy.dados.horario}>
          <Horario ficha={ficha} />
        </Campo>
        <Campo titulo={copy.dados.modalidade}>{reunioes.modalidades[ficha.modalidade]}</Campo>
        {ficha.sala || pedeSala ? (
          <Campo titulo={copy.dados.sala}>
            {ficha.sala ? (
              <a href={ficha.sala} target="_blank" rel="noreferrer" className="text-texto-principal hover:text-menta-2">
                {copy.dados.abrirSala}
              </a>
            ) : (
              <span className="font-normal text-texto-apoio">{copy.dados.semSala}</span>
            )}
          </Campo>
        ) : null}
        {ficha.estado === 'canceled' ? (
          <Campo titulo={copy.dados.motivoDoCancelamento}>
            {ficha.motivoDoCancelamento ?? (
              <span className="font-normal text-texto-apoio">{copy.dados.semMotivo}</span>
            )}
          </Campo>
        ) : null}
        {ficha.notas ? <Campo titulo={copy.dados.notas}>{ficha.notas}</Campo> : null}
      </dl>
    </Painel>
  )
}

const desfecho = reunioes.desfecho

function autorDa(marcacao: Marcacao, membros: readonly Membro[]): string {
  if (marcacao.autorId === null) return desfecho.autorDoSistema
  return membros.find((membro) => membro.usuarioId === marcacao.autorId)?.nome ?? desfecho.autorDesconhecido
}

function Desfecho({ ficha, podeMarcar, membros, aoMarcar }: FichaProps) {
  const situacao =
    ficha.apuracao === 'attested'
      ? desfecho.apurada(reunioes.estados[ficha.estado])
      : ficha.apuracao === 'pending'
        ? desfecho.naoApurada
        : desfecho.semApuracao
  return (
    <Painel
      rotulo={desfecho.titulo}
      titulo={desfecho.titulo}
      estado={<Selo tom={TOM_DA_APURACAO[ficha.apuracao]}>{reunioes.apuracoes[ficha.apuracao]}</Selo>}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 max-w-[var(--largura-leitura)] text-[13.5px] text-texto-secundario">{situacao}</p>

        {ficha.marcacoes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="rotulo-de-indicador m-0">{desfecho.historico}</h3>
            <ol aria-label={desfecho.historico} className="m-0 flex list-none flex-col gap-2.5 p-0">
              {ficha.marcacoes.map((marcacao) => (
                <li key={marcacao.instante} className="flex flex-col gap-0.5 text-[13.5px]">
                  <span className="text-texto-principal">
                    {desfecho.marcacao(
                      reunioes.estados[marcacao.desfecho],
                      autorDa(marcacao, membros),
                      reunioes.horario(relogioDaReuniao(marcacao.instante, ficha.fusoDaConta)),
                    )}
                  </span>
                  {marcacao.motivo ? (
                    <span className="text-[12.5px] text-texto-apoio">{desfecho.motivo(marcacao.motivo)}</span>
                  ) : null}
                  {marcacao.sobrescreveu ? (
                    <span className="text-[12.5px] text-texto-apoio">{desfecho.sobrescreveu}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {podeMarcar ? (
          <div>
            <MarcacaoDoDesfecho reuniao={ficha} aoMarcar={aoMarcar} />
          </div>
        ) : (
          <p className="m-0 text-[13px] text-texto-apoio">{desfecho.somenteLeitura}</p>
        )}
      </div>
    </Painel>
  )
}

function rotuloDoBloco(bloco: Pick<BlocoDoResumo, 'campo' | 'chave'>): string {
  return bloco.campo ? copy.resumo.campos[bloco.campo] : escreverChave(bloco.chave)
}

function rotuloDoItem(item: ItemDoResumo): string | null {
  if (item.chave === null) return null
  return rotuloDoBloco({ campo: null, chave: item.chave })
}

function Resumo({ ficha }: { ficha: FichaDaReuniao }) {
  const blocos = blocosDoResumo(ficha.resumoDePassagem, { sim: copy.resumo.sim, nao: copy.resumo.nao })
  return (
    <Painel
      rotulo={copy.resumo.titulo}
      titulo={copy.resumo.titulo}
      apoio={blocos.length > 0 && ficha.chamadaDaMarcacao ? copy.resumo.apoio : undefined}
    >
      {blocos.length === 0 ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{copy.resumo.vazio}</p>
      ) : (
        <dl className="m-0 flex flex-col gap-4">
          {blocos.map((bloco) => (
            <div key={bloco.chave} className="flex flex-col gap-1">
              <dt className="rotulo-de-indicador">{rotuloDoBloco(bloco)}</dt>
              <dd className="m-0 max-w-[var(--largura-leitura)] text-[14px] text-texto-principal">
                {bloco.conteudo.tipo === 'texto' ? (
                  bloco.conteudo.texto
                ) : (
                  <ul className="m-0 flex flex-col gap-1 pl-5">
                    {bloco.conteudo.itens.map((item, indice) => {
                      const rotulo = rotuloDoItem(item)
                      return (
                        <li key={`${item.chave ?? ''}-${indice}`}>
                          {rotulo ? <span className="font-semibold">{rotulo}: </span> : null}
                          {item.texto}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Painel>
  )
}

function Historico({ ficha }: { ficha: FichaDaReuniao }) {
  const passos = historicoDaFicha(ficha)
  return (
    <Painel rotulo={copy.historico.titulo} titulo={copy.historico.titulo}>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {passos.map((passo) => (
          <li key={passo.tipo} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px]">
            <span className="val text-[12.5px] text-texto-apoio">
              {reunioes.horario(relogioDaReuniao(passo.instante, ficha.fusoDaConta))}
            </span>
            <span className="font-semibold text-texto-principal">{copy.historico.passos[passo.tipo]}</span>
            {passo.chamada ? (
              <Link
                to="/chamadas/$id"
                params={{ id: passo.chamada.id }}
                className="text-texto-principal hover:text-menta-2"
              >
                {copy.historico.abrirChamada}
              </Link>
            ) : passo.tipo.endsWith('-na-ligacao') ? (
              <span className="text-texto-apoio">{copy.historico.chamadaIndisponivel}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </Painel>
  )
}

function Entregas({ ficha }: { ficha: FichaDaReuniao }) {
  const noFuso = (instante: string) => reunioes.horario(relogioDaReuniao(instante, ficha.fusoDaConta))
  const evento = estadoDoEvento(ficha)

  return (
    <Painel rotulo={copy.entregas.titulo} titulo={copy.entregas.titulo}>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        <Entrega
          ficha={ficha}
          item="evento"
          titulo={copy.entregas.evento}
          selo={<Selo tom={TOM_DO_EVENTO[evento]}>{copy.entregas.estadosDoEvento[evento]}</Selo>}
          detalhes={[
            ficha.evento.externoId === null && ficha.evento.tentativas > 0
              ? copy.entregas.tentativas(ficha.evento.tentativas)
              : null,
            ficha.evento.externoId === null && ficha.evento.erro ? copy.entregas.ultimoErro(ficha.evento.erro) : null,
            ficha.evento.externoId === null && ficha.evento.proximaTentativa
              ? copy.entregas.proximaTentativa(noFuso(ficha.evento.proximaTentativa))
              : null,
          ]}
        />
        <EntregaDoConviteDe
          ficha={ficha}
          item="conviteDoLead"
          titulo={copy.entregas.conviteDoLead}
          entrega={ficha.conviteDoLead}
          temEmail={ficha.lead.temEmail}
          noFuso={noFuso}
        />
        <EntregaDoConviteDe
          ficha={ficha}
          item="conviteDoEspecialista"
          titulo={copy.entregas.conviteDoEspecialista}
          entrega={ficha.conviteDoEspecialista}
          // `specialists.email` é obrigatório.
          temEmail
          noFuso={noFuso}
        />
      </ul>
    </Painel>
  )
}

function EntregaDoConviteDe({
  ficha,
  item,
  titulo,
  entrega,
  temEmail,
  noFuso,
}: {
  ficha: FichaDaReuniao
  item: ItemVerificado
  titulo: string
  entrega: EntregaDoConvite
  temEmail: boolean
  noFuso: (instante: string) => string
}) {
  const estado = estadoDoConvite(entrega, temEmail)
  const pendente = entrega.enviadoEm === null
  return (
    <Entrega
      ficha={ficha}
      item={item}
      titulo={titulo}
      selo={<Selo tom={TOM_DO_CONVITE[estado]}>{copy.entregas.estadosDoConvite[estado]}</Selo>}
      detalhes={[
        entrega.enviadoEm ? copy.entregas.enviadoEm(noFuso(entrega.enviadoEm)) : null,
        pendente && entrega.tentativas > 0 ? copy.entregas.tentativas(entrega.tentativas) : null,
        pendente && entrega.erro ? copy.entregas.ultimoErro(entrega.erro) : null,
        pendente && entrega.proximaTentativa
          ? copy.entregas.proximaTentativa(noFuso(entrega.proximaTentativa))
          : null,
      ]}
    />
  )
}

function Entrega({
  ficha,
  item,
  titulo,
  selo,
  detalhes,
}: {
  ficha: FichaDaReuniao
  item: ItemVerificado
  titulo: string
  selo: ReactNode
  detalhes: readonly (string | null)[]
}) {
  const marca = marcaDoItem(ficha, item)
  const linhas = detalhes.filter((linha): linha is string => linha !== null)
  return (
    <li aria-label={titulo} className="flex flex-col gap-1 border-b border-borda-suave pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-semibold text-texto-principal">{titulo}</span>
        {selo}
      </div>
      {linhas.map((linha) => (
        <span key={linha} className="text-[12.5px] text-texto-apoio">
          {linha}
        </span>
      ))}
      {marca ? <p className="m-0 text-[13px] text-texto-secundario">{reunioes.marcas[marca].oQueFazer}</p> : null}
    </li>
  )
}
