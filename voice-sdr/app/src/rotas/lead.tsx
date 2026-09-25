import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'

import { useServicoDeChamadas } from '@/chamadas/contexto'
import { estadoDaGravacao, formatarSegundos } from '@/chamadas/ficha'
import type { ServicoDeChamadas } from '@/chamadas/tipos'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { Discador } from '@/componentes/discador'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { ReprodutorDeGravacao } from '@/componentes/reprodutor-de-gravacao'
import { Selo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import { ficha as copyDaChamada, MOTIVO_DO_FIM } from '@/copy/chamadas'
import { nomeDoFusoNaTela } from '@/copy/fuso'
import { lead as copy } from '@/copy/lead'
import { TEMPERATURA_EM_PORTUGUES } from '@/copy/leads'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeOperarLeads, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { useServicoDeLeads } from '@/leads/contexto'
import {
  montarLinhaDoTempo,
  type AutorDoItem,
  type ItemDaLinhaDoTempo,
} from '@/leads/linha-do-tempo'
import type { FichaDoLead, ServicoDeLeads } from '@/leads/tipos'
import { formatarData, formatarInstante } from '@/utilidades/datas'
import { useServicoDeWhatsapp } from '@/whatsapp/contexto'

// A mesma chave de `/config/equipe`: o papel de quem olha é o mesmo recurso.
const CHAVE_DA_EQUIPE = ['equipe'] as const

/** O que a última ação disse. `status` é resultado; `erro`, recusa. */
type Aviso = { tom: 'status' | 'erro'; texto: string }

/** Lê um rótulo de uma tabela de copy pela chave do dado, sem a cadeia de protótipos. */
function rotulo(tabela: Readonly<Record<string, string>>, chave: string | null): string | null {
  if (chave === null || !Object.hasOwn(tabela, chave)) return null
  return tabela[chave] ?? null
}

/**
 * `/leads/$id`: a ficha do lead (US-147, RF-113, RF-116).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **A linha do tempo é uma lista só**, montada por `montarLinhaDoTempo`
 *    sobre `lead_events`; a razão está no cabeçalho de `app/src/copy/lead.ts`.
 *    O serviço entrega os eventos crus e a tela aplica a ordem, para a
 *    comparação morar num lugar só.
 * 2. **O áudio é pedido no toque**, pelo mesmo `ReprodutorDeGravacao` da ficha
 *    da chamada: a URL de `call-audio` vale cinco minutos e nunca se guarda.
 * 3. **Quem só observa lê tudo e não age.** As ações somem e a negativa diz a
 *    quem pedir acesso, como no funil.
 */
export function TelaDoLead() {
  const { id } = useParams({ from: '/aplicacao/leads/$id' })
  const servico = useServicoDeLeads()
  const chamadas = useServicoDeChamadas()
  const equipe = useServicoDeEquipe()

  const consulta = useQuery({
    queryKey: ['lead', id],
    queryFn: () => servico.carregarFichaDoLead(id),
  })
  const consultaDaEquipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => equipe.carregar(),
  })

  if (consulta.isPending) {
    return (
      <Moldura>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const carga = consulta.data

  if (carga?.ok === false && carga.motivo === 'nao-encontrado') {
    return (
      <Moldura>
        <EstadoVazio
          titulo={copy.naoEncontrado.titulo}
          explicacao={copy.naoEncontrado.explicacao}
          acao={{ rotulo: copy.naoEncontrado.acao, endereco: '/leads' }}
        />
      </Moldura>
    )
  }

  if (!carga?.ok) {
    return (
      <Moldura>
        <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      </Moldura>
    )
  }

  // Sem papel lido, nada se oferece: controle que a política recusaria é pior
  // do que controle que chega um instante depois.
  const cargaDaEquipe = consultaDaEquipe.data
  const acesso =
    cargaDaEquipe?.ok !== true
      ? ({ tipo: 'desconhecido' } as const)
      : podeOperarLeads(cargaDaEquipe.equipe.papelDoUsuario)
        ? ({ tipo: 'opera' } as const)
        : ({ tipo: 'leitura', administradores: quemConcedeAcesso(cargaDaEquipe.equipe.membros) } as const)

  return (
    <Ficha
      ficha={carga.ficha}
      servico={servico}
      chamadas={chamadas}
      acesso={acesso}
      aoMudar={() => consulta.refetch()}
    />
  )
}

function Moldura({ titulo = copy.titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <AreaDeTrabalho
      titulo={titulo}
      lead={copy.apoio}
      acoes={
        <Link to="/leads" className="botao-secundario no-underline">
          {copy.voltar}
        </Link>
      }
    >
      {children}
    </AreaDeTrabalho>
  )
}

type Acesso =
  | { tipo: 'desconhecido' }
  | { tipo: 'opera' }
  | { tipo: 'leitura'; administradores: readonly Membro[] }

function Ficha({
  ficha,
  servico,
  chamadas,
  acesso,
  aoMudar,
}: {
  ficha: FichaDoLead
  servico: ServicoDeLeads
  chamadas: ServicoDeChamadas
  acesso: Acesso
  aoMudar: () => Promise<unknown>
}) {
  // O relógio entra uma vez, na abertura da ficha: é contra ele que se decide
  // se uma gravação já passou do prazo.
  const [agora] = useState(() => new Date().toISOString())
  const itens = montarLinhaDoTempo({
    eventos: ficha.eventos,
    ligacoes: ficha.ligacoes,
    nomes: ficha.nomes,
  })

  return (
    <Moldura titulo={ficha.nome || copy.semNome}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          <Identidade ficha={ficha} />
          <Situacao ficha={ficha} />
        </div>
        <ConversaDeWhatsapp leadId={ficha.id} podeIniciar={acesso.tipo === 'opera'} />
        <Resumo ficha={ficha} />
        {/* Ligar agora (RF-401), com o propósito escolhido. O discador decide
            pelo papel e pela guarda, como no painel. */}
        <Discador lead={{ id: ficha.id, nome: ficha.nome, telefone: ficha.telefone }} />
        {acesso.tipo === 'opera' ? (
          <Acoes ficha={ficha} servico={servico} aoMudar={aoMudar} />
        ) : acesso.tipo === 'leitura' ? (
          <NegativaPorPapel aviso={copy.acoes.soLeitura} administradores={acesso.administradores} />
        ) : null}
        <LinhaDoTempo itens={itens} truncada={ficha.truncada} agora={agora} chamadas={chamadas} />
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

function ouNaoInformado(valor: string | null): string {
  return valor && valor.trim() !== '' ? valor : copy.identidade.naoInformado
}

function Identidade({ ficha }: { ficha: FichaDoLead }) {
  return (
    <Painel titulo={copy.identidade.titulo}>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 max-md:grid-cols-1">
        <Campo titulo={copy.identidade.nome}>{ouNaoInformado(ficha.nome)}</Campo>
        <Campo titulo={copy.identidade.telefone}>
          <span className="val">{ficha.telefone}</span>
        </Campo>
        <Campo titulo={copy.identidade.empresa}>{ouNaoInformado(ficha.empresa)}</Campo>
        <Campo titulo={copy.identidade.cidade}>{ouNaoInformado(ficha.cidade)}</Campo>
        <Campo titulo={copy.identidade.estado}>{ouNaoInformado(ficha.estado)}</Campo>
        <Campo titulo={copy.identidade.fuso}>
          {ficha.fuso ? nomeDoFusoNaTela(ficha.fuso) : copy.identidade.naoInformado}
        </Campo>
      </dl>
    </Painel>
  )
}

function Situacao({ ficha }: { ficha: FichaDoLead }) {
  return (
    <Painel titulo={copy.situacao.titulo}>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 max-md:grid-cols-1">
        <Campo titulo={copy.situacao.etapa}>{ficha.etapa?.rotulo ?? copy.situacao.semEtapa}</Campo>
        <Campo titulo={copy.situacao.temperatura}>
          {ficha.temperatura
            ? TEMPERATURA_EM_PORTUGUES[ficha.temperatura]
            : copy.situacao.semTemperatura}
        </Campo>
        <Campo titulo={copy.situacao.pontuacao}>
          {ficha.pontuacao === null ? (
            copy.situacao.semPontuacao
          ) : (
            <span className="val">{ficha.pontuacao}</span>
          )}
        </Campo>
        <Campo titulo={copy.situacao.bloqueio}>
          {ficha.bloqueio ? (
            <span className="flex flex-col gap-1">
              <Selo tom="perigo">{copy.situacao.bloqueadoEm(formatarData(ficha.bloqueio.em))}</Selo>
              <span className="font-normal text-texto-secundario">
                {ficha.bloqueio.motivo ?? copy.situacao.semMotivo}
              </span>
            </span>
          ) : (
            copy.situacao.livre
          )}
        </Campo>
      </dl>
    </Painel>
  )
}

function Resumo({ ficha }: { ficha: FichaDoLead }) {
  const { dor, fit, objecoes, proximaAcao } = ficha.briefing
  const vazio = [dor, fit, objecoes, proximaAcao].every((valor) => valor === null)

  return (
    <Painel titulo={copy.resumo.titulo} apoio={copy.resumo.apoio}>
      {vazio ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{copy.resumo.vazio}</p>
      ) : (
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 max-md:grid-cols-1">
          <Campo titulo={copy.resumo.dor}>{dor ?? copy.resumo.naoConfirmado}</Campo>
          <Campo titulo={copy.resumo.fit}>{fit ?? copy.resumo.naoConfirmado}</Campo>
          <Campo titulo={copy.resumo.objecoes}>{objecoes ?? copy.resumo.naoConfirmado}</Campo>
          <Campo titulo={copy.resumo.proximaAcao}>{proximaAcao ?? copy.resumo.naoConfirmado}</Campo>
        </dl>
      )}
    </Painel>
  )
}

/**
 * O botão que abre a primeira conversa por WhatsApp e o elo para a que já está
 * em curso. As duas leituras são progressivas: sem canal ligado, ou enquanto
 * a resposta não chega, o bloco não desenha nada — a ficha continua completa
 * sem ele, e o canal desligado não é erro nenhum aqui.
 */
function ConversaDeWhatsapp({ leadId, podeIniciar }: { leadId: string; podeIniciar: boolean }) {
  const servico = useServicoDeWhatsapp()
  const navegar = useNavigate()
  const [iniciando, definirIniciando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)

  const canal = useQuery({ queryKey: ['whatsapp-canal'], queryFn: () => servico.carregarCanal() })
  const conversa = useQuery({
    queryKey: ['whatsapp-conversa-do-lead', leadId],
    queryFn: () => servico.carregarConversaDoLead(leadId),
  })

  if (!canal.data?.ok || !canal.data.canal?.habilitado) return null
  if (!conversa.data?.ok) return null

  const ativa = conversa.data.conversa && conversa.data.conversa.status !== 'encerrada' ? conversa.data.conversa : null

  async function iniciar() {
    definirIniciando(true)
    definirErro(null)
    const resultado = await servico.agir({ leadId, acao: 'iniciar' })
    definirIniciando(false)
    if (!resultado.ok) {
      definirErro(resultado.mensagem || copy.whatsapp.falhaAoIniciar)
      return
    }
    await navegar({ to: '/conversas/$id', params: { id: resultado.conversaId } })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {ativa ? (
        <Link to="/conversas/$id" params={{ id: ativa.id }} className="botao-secundario no-underline">
          {copy.whatsapp.verConversa}
        </Link>
      ) : podeIniciar ? (
        <button
          type="button"
          className="botao-secundario"
          disabled={iniciando}
          onClick={() => void iniciar()}
        >
          {iniciando ? copy.whatsapp.iniciando : copy.whatsapp.conversar}
        </button>
      ) : null}
      {erro ? (
        <span role="alert" className="text-[12.5px] text-perigo">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

function Acoes({
  ficha,
  servico,
  aoMudar,
}: {
  ficha: FichaDoLead
  servico: ServicoDeLeads
  aoMudar: () => Promise<unknown>
}) {
  const [destino, setDestino] = useState(ficha.etapa?.chave ?? ficha.etapas[0]?.chave ?? '')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState<'etapa' | 'bloqueio' | 'nota' | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  async function mover(evento: FormEvent) {
    evento.preventDefault()
    const etapa = ficha.etapas.find((atual) => atual.chave === destino)
    if (!etapa || ocupado) return
    setOcupado('etapa')
    const resposta = await servico.moverDeEtapa(ficha.id, etapa.chave)
    setOcupado(null)
    if (!resposta.ok) {
      setAviso({ tom: 'erro', texto: copy.acoes.falhasDaMudanca[resposta.motivo] })
    } else {
      setAviso({
        tom: 'status',
        texto: resposta.resultado === 'movido' ? copy.acoes.movido(etapa.rotulo) : copy.acoes.mesmaEtapa,
      })
    }
    await aoMudar()
  }

  async function alternarBloqueio(evento: FormEvent) {
    evento.preventDefault()
    if (ocupado) return
    const bloquear = ficha.bloqueio === null
    if (bloquear && motivo.trim() === '') return
    setOcupado('bloqueio')
    const resposta = bloquear
      ? await servico.bloquear([ficha.id], motivo.trim())
      : await servico.desbloquear([ficha.id])
    setOcupado(null)
    if (!resposta.ok) {
      setAviso({ tom: 'erro', texto: copy.acoes.falhasDoBloqueio[resposta.motivo] })
    } else if (resposta.resultado.feitos.length === 0) {
      setAviso({ tom: 'erro', texto: copy.acoes.falhasDoBloqueio['sem-permissao'] })
    } else {
      setMotivo('')
      setAviso({ tom: 'status', texto: bloquear ? copy.acoes.bloqueado : copy.acoes.desbloqueado })
    }
    await aoMudar()
  }

  async function anotar(evento: FormEvent) {
    evento.preventDefault()
    if (ocupado || nota.trim() === '') return
    setOcupado('nota')
    const resposta = await servico.registrarNota(ficha.id, nota.trim())
    setOcupado(null)
    if (!resposta.ok) {
      // A nota recusada fica no campo: quem escreveu não reescreve.
      setAviso({ tom: 'erro', texto: copy.nota.falhas[resposta.motivo] })
      return
    }
    setNota('')
    setAviso({ tom: 'status', texto: copy.nota.registrada })
    await aoMudar()
  }

  return (
    <Painel titulo={copy.acoes.titulo}>
      <div className="flex flex-col gap-5">
        {aviso ? (
          aviso.tom === 'erro' ? (
            <CaixaDeErro>{aviso.texto}</CaixaDeErro>
          ) : (
            <p role="status" className="m-0 text-[13.5px] text-texto-secundario">
              {aviso.texto}
            </p>
          )
        ) : null}

        <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          {ficha.etapas.length > 0 ? (
            <form className="flex items-end gap-3" onSubmit={(evento) => void mover(evento)}>
              <Seletor rotulo={copy.acoes.etapa} valor={destino} aoTrocar={setDestino}>
                {ficha.etapas.map((etapa) => (
                  <option key={etapa.chave} value={etapa.chave}>
                    {etapa.rotulo}
                  </option>
                ))}
              </Seletor>
              <button type="submit" className="botao-secundario" disabled={ocupado !== null}>
                {ocupado === 'etapa' ? copy.acoes.movendo : copy.acoes.mover}
              </button>
            </form>
          ) : null}

          <form className="flex items-end gap-3" onSubmit={(evento) => void alternarBloqueio(evento)}>
            {ficha.bloqueio === null ? (
              <>
                <CampoDeTexto
                  rotulo={copy.acoes.motivoDoBloqueio}
                  exemplo={copy.acoes.exemploDoMotivo}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                />
                <button
                  type="submit"
                  className="botao-perigo"
                  disabled={ocupado !== null || motivo.trim() === ''}
                >
                  {copy.acoes.bloquear}
                </button>
              </>
            ) : (
              <button type="submit" className="botao-secundario" disabled={ocupado !== null}>
                {copy.acoes.desbloquear}
              </button>
            )}
          </form>
        </div>

        <form className="flex flex-col items-start gap-3" onSubmit={(evento) => void anotar(evento)}>
          <CampoDeTextoLongo
            rotulo={copy.nota.rotulo}
            exemplo={copy.nota.exemplo}
            apoio={copy.nota.apoio}
            rows={3}
            value={nota}
            onChange={(evento) => setNota(evento.target.value)}
          />
          <button
            type="submit"
            className="botao-primario"
            disabled={ocupado !== null || nota.trim() === ''}
          >
            {ocupado === 'nota' ? copy.nota.registrando : copy.nota.registrar}
          </button>
        </form>
      </div>
    </Painel>
  )
}

function LinhaDoTempo({
  itens,
  truncada,
  agora,
  chamadas,
}: {
  itens: readonly ItemDaLinhaDoTempo[]
  truncada: boolean
  agora: string
  chamadas: ServicoDeChamadas
}) {
  return (
    <Painel titulo={copy.linhaDoTempo.titulo} apoio={copy.linhaDoTempo.apoio}>
      {itens.length === 0 ? (
        <EstadoVazio
          titulo={copy.linhaDoTempo.vazia.titulo}
          explicacao={copy.linhaDoTempo.vazia.explicacao}
        />
      ) : (
        <>
          <ol aria-label={copy.linhaDoTempo.lista} className="m-0 flex list-none flex-col gap-3 p-0">
            {itens.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                data-tipo={item.tipo}
                className="rounded-controle border border-borda-suave bg-superficie-funda px-4 py-3"
              >
                <Item item={item} agora={agora} chamadas={chamadas} />
              </li>
            ))}
          </ol>
          {truncada ? (
            <p className="m-0 mt-3 text-[13px] text-texto-apoio">{copy.linhaDoTempo.truncada}</p>
          ) : null}
        </>
      )}
    </Painel>
  )
}

function autorDoItem(autor: AutorDoItem): string {
  if (autor.ator === 'user') return copy.linhaDoTempo.autor.user(autor.nome)
  return copy.linhaDoTempo.autor[autor.ator]
}

function Cabecalho({ titulo, em, autor }: { titulo: string; em: string; autor?: string }) {
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-2 text-[12.5px] text-texto-apoio">
      <span className="font-bold text-texto-principal">{titulo}</span>
      <span className="val">{formatarInstante(em)}</span>
      {autor ? <span>{autor}</span> : null}
    </p>
  )
}

function Corpo({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 text-[14px] text-texto-secundario">{children}</div>
}

function Item({
  item,
  agora,
  chamadas,
}: {
  item: ItemDaLinhaDoTempo
  agora: string
  chamadas: ServicoDeChamadas
}) {
  switch (item.tipo) {
    case 'ligacao': {
      const { ligacao } = item
      const proposito = rotulo(PROPOSITO_EM_PORTUGUES, ligacao.proposito)
      const direcao = rotulo(copyDaChamada.direcao, ligacao.direcao)
      const desfecho = rotulo(MOTIVO_DO_FIM, ligacao.motivoDoFim)
      const gravacao = estadoDaGravacao(ligacao, agora)
      return (
        <>
          <Cabecalho
            titulo={[copy.linhaDoTempo.ligacao, proposito].filter(Boolean).join(' · ')}
            em={item.em}
            autor={copy.linhaDoTempo.autor.agent}
          />
          <Corpo>
            <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {direcao ? <span>{direcao}</span> : null}
              {desfecho ? <span>{desfecho}</span> : null}
              {ligacao.duracaoSeg === null ? (
                <span>{copy.linhaDoTempo.semDuracao}</span>
              ) : (
                <span className="val">
                  {copy.linhaDoTempo.duracao(formatarSegundos(ligacao.duracaoSeg))}
                </span>
              )}
              <Link to="/chamadas/$id" params={{ id: ligacao.id }} className="botao-link">
                {copy.linhaDoTempo.abrirChamada}
              </Link>
            </p>
            <div className="mt-2">
              {gravacao.tipo === 'disponivel' ? (
                <ReprodutorDeGravacao chamadaId={ligacao.id} servico={chamadas} />
              ) : (
                <p className="m-0 text-[13px] text-texto-apoio">
                  {gravacao.tipo === 'expurgada'
                    ? copy.linhaDoTempo.gravacaoExpurgada
                    : copy.linhaDoTempo.semGravacao}
                </p>
              )}
            </div>
          </Corpo>
        </>
      )
    }
    case 'etapa':
      return (
        <>
          <Cabecalho titulo={copy.linhaDoTempo.etapa} em={item.em} autor={autorDoItem(item.autor)} />
          <Corpo>
            {item.de === null ? (
              <p className="m-0">
                {copy.linhaDoTempo.entrouEm}
                <strong>{item.para}</strong>
              </p>
            ) : (
              <p className="m-0">
                {copy.linhaDoTempo.deParaAntes}
                <strong>{item.de}</strong>
                {copy.linhaDoTempo.deParaMeio}
                <strong>{item.para}</strong>
              </p>
            )}
          </Corpo>
        </>
      )
    case 'bloqueio':
      return (
        <>
          <Cabecalho titulo={copy.linhaDoTempo.bloqueio} em={item.em} autor={autorDoItem(item.autor)} />
          <Corpo>
            <p className="m-0">{item.motivo ?? copy.situacao.semMotivo}</p>
          </Corpo>
        </>
      )
    case 'desbloqueio':
      return (
        <>
          <Cabecalho titulo={copy.linhaDoTempo.desbloqueio} em={item.em} autor={autorDoItem(item.autor)} />
          <Corpo>
            <p className="m-0">{copy.linhaDoTempo.desbloqueado}</p>
          </Corpo>
        </>
      )
    case 'nota':
      return (
        <>
          <Cabecalho titulo={copy.linhaDoTempo.nota} em={item.em} autor={autorDoItem(item.autor)} />
          <Corpo>
            <p className="m-0 whitespace-pre-wrap">{item.texto}</p>
          </Corpo>
        </>
      )
    case 'entrada':
      return (
        <>
          <Cabecalho
            titulo={item.como === 'cadastro' ? copy.linhaDoTempo.cadastro : copy.linhaDoTempo.importacao}
            em={item.em}
            autor={autorDoItem(item.autor)}
          />
          <Corpo>
            <p className="m-0">
              {item.como === 'cadastro' ? copy.linhaDoTempo.cadastrado : copy.linhaDoTempo.importado}
            </p>
          </Corpo>
        </>
      )
    case 'reuniao':
      return (
        <>
          <Cabecalho titulo={copy.linhaDoTempo.reuniao} em={item.em} />
          <Corpo>
            <p className="m-0">{copy.linhaDoTempo.reuniaoEm(formatarInstante(item.reuniao.em))}</p>
          </Corpo>
        </>
      )
    case 'whatsapp':
      return (
        <>
          <Cabecalho
            titulo={copy.linhaDoTempo.whatsapp}
            em={item.em}
            autor={autorDoItem(item.autor)}
          />
          <Corpo>
            <p className="m-0">
              {item.acao ? copy.linhaDoTempo.acaoDoWhatsapp[item.acao] : copy.linhaDoTempo.acaoDoWhatsappGenerica}
              {item.motivo ? ` (${copy.linhaDoTempo.motivoDoWhatsapp(item.motivo)})` : ''}
            </p>
            {item.conversaId ? (
              <Link
                to="/conversas/$id"
                params={{ id: item.conversaId }}
                className="botao-link mt-1 inline-block"
              >
                {copy.linhaDoTempo.abrirConversa}
              </Link>
            ) : null}
          </Corpo>
        </>
      )
    case 'automacao':
      return (
        <>
          <Cabecalho titulo={copy.linhaDoTempo.automacao} em={item.em} autor={autorDoItem(item.autor)} />
          <Corpo>
            <p className="m-0">
              {item.acao ? copy.linhaDoTempo.acaoDaAutomacao[item.acao] : copy.linhaDoTempo.acaoDaAutomacaoGenerica}
              {item.tentativas !== null ? ` (${copy.linhaDoTempo.tentativas(item.tentativas)})` : ''}
            </p>
          </Corpo>
        </>
      )
  }
}
