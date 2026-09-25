import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useServicoDeChamadas } from '@/chamadas/contexto'
import { formatarDecimal } from '@/chamadas/ficha'
import type { ServicoDeChamadas } from '@/chamadas/tipos'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { ReprodutorDeGravacao } from '@/componentes/reprodutor-de-gravacao'
import { Seletor } from '@/componentes/seletor'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { ESTADO_DA_FILA, fila as copy, SEVERIDADE_DO_ITEM, TIPO_DO_ITEM } from '@/copy/fila'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeResolverExcecoes, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import {
  acaoDoItem,
  acaoEscreve,
  estadoDaLista,
  fatiaQueEntrega,
  filtrarPorTipo,
  INTERVALO_DA_RECARGA_MS,
  intervaloDaRecarga,
  ordenarItens,
  type AcaoDoItem,
} from '@/fila/consulta'
import { useServicoDaFila } from '@/fila/contexto'
import { textoDaResolucao } from '@/fila/leitura'
import {
  ESTADOS_DA_FILA,
  TIPOS,
  type CargaDaFila,
  type EstadoDaAssinatura,
  type EstadoDaFila,
  type FiltroDeTipo,
  type ItemDaFila,
  type LimiarDoItem,
  type Resolucao,
  type ResultadoDaResolucao,
  type ServicoDaFila,
  type Severidade,
} from '@/fila/tipos'
import { formatarInstante } from '@/utilidades/datas'

/** Prefixo de toda carga da fila: a escrita e o tempo real invalidam os dois estados. */
const CHAVE = ['fila'] as const

/** O papel de quem olha e o nome de quem resolveu vêm da carga da equipe. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

const TOM_DA_SEVERIDADE: Record<Severidade, TomDoSelo> = {
  alta: 'perigo',
  media: 'atencao',
  baixa: 'neutro',
}

type Aviso = { tom: 'positivo' | 'atencao'; texto: string }

/**
 * `/fila`: Precisam de você (RF-908, RF-909, RF-910). O que a Sarah não resolve
 * sozinha, com o recorte da conversa, o áudio, o limiar que criou o item e uma
 * ação por tipo.
 *
 * Seis decisões explicam o desenho:
 *
 * 1. **Resolver tira o item da lista na mesma ação.** O id entra em
 *    `resolvidosAqui` antes da resposta voltar a ser relida, e a lista o poda no
 *    desenho; a carga refeita depois da escrita é quem confirma.
 * 2. **A primeira resolução é a que fica.** `ja_resolvido` (US-116) vira a
 *    frase de que outra pessoa resolveu, com o nome e a hora relidos, e nada é
 *    reescrito.
 * 3. **O tempo real só avisa.** `servico.assinar` invalida a chave e a carga de
 *    sempre refaz a lista; nenhuma linha que chega pela assinatura é desenhada
 *    direto.
 * 4. **O áudio nasce no clique**, pelo reprodutor da ficha da chamada, e só
 *    quando a chamada tem gravação.
 * 5. **Ordem, filtro, vazios e ação são de `fila/consulta.ts`.** A tela só
 *    desenha o que a função pura decidiu; o filtro de tipo recorta a carga do
 *    estado, sem nova leitura.
 * 6. **Sem tempo real, a recarga por intervalo.** A assinatura diz se subiu ou
 *    caiu; caída, a consulta passa a se refazer sozinha e a tela diz isso.
 */
export function TelaDaFila() {
  const servico = useServicoDaFila()
  const chamadas = useServicoDeChamadas()
  const servicoDeEquipe = useServicoDeEquipe()
  const clienteDeConsulta = useQueryClient()

  // Acima do `useQuery`: trocar de estado volta a `isPending`, e o que mora no
  // ramo da lista morre junto.
  const [estado, definirEstado] = useState<EstadoDaFila>('aberto')
  const [tipo, definirTipo] = useState<FiltroDeTipo>('todos')
  const [aviso, definirAviso] = useState<Aviso | null>(null)
  const [resolvidosAqui, definirResolvidosAqui] = useState<ReadonlySet<string>>(new Set())
  const [assinatura, definirAssinatura] = useState<EstadoDaAssinatura>('conectando')

  const consulta = useQuery({
    queryKey: [...CHAVE, estado],
    queryFn: () => servico.carregar(estado),
    refetchInterval: intervaloDaRecarga(assinatura),
  })

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  useEffect(
    () =>
      servico.assinar(
        () => {
          void clienteDeConsulta.invalidateQueries({ queryKey: CHAVE })
        },
        definirAssinatura,
      ),
    [servico, clienteDeConsulta],
  )

  if (equipe.isPending) {
    return (
      <Moldura>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não oferece resolver: quem decide é o RPC, e
  // oferecer o botão para receber a recusa dele trocaria a negativa explicada
  // por um erro no meio do item.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeResolver = papel !== null && podeResolverExcecoes(papel)
  const membros = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.membros : []

  function aoResolver(item: ItemDaFila, resultado: ResultadoDaResolucao, feito: string) {
    if (resultado.codigo === 'resolvido') {
      definirAviso({ tom: 'positivo', texto: feito })
    } else if (resultado.codigo === 'ja_resolvido') {
      definirAviso({ tom: 'atencao', texto: fraseDoJaResolvido(resultado.resolucao, membros) })
    } else if (resultado.codigo === 'inexistente') {
      definirAviso({ tom: 'atencao', texto: copy.codigos.inexistente })
    } else {
      return
    }
    definirResolvidosAqui((atual) => new Set(atual).add(item.id))
    void clienteDeConsulta.invalidateQueries({ queryKey: CHAVE })
  }

  return (
    <Moldura>
      <div className="flex flex-col gap-5">
        {papel !== null && !podeResolver ? (
          <NegativaPorPapel aviso={copy.leitura.aviso} administradores={quemConcedeAcesso(membros)} />
        ) : null}

        {cargaDaEquipe && !cargaDaEquipe.ok ? (
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        ) : null}

        {aviso ? (
          <p
            role="status"
            className={`m-0 rounded-controle border px-3.5 py-2.5 text-[13px] ${
              aviso.tom === 'positivo'
                ? 'border-positivo-borda bg-positivo-fundo text-positivo'
                : 'border-atencao-borda bg-atencao-fundo text-atencao'
            }`}
          >
            {aviso.texto}
          </p>
        ) : null}

        <div className="bloco-secundario flex flex-wrap items-end gap-3">
          <Seletor
            rotulo={copy.filtro}
            valor={estado}
            aoTrocar={(valor) => {
              definirAviso(null)
              definirEstado(valor as EstadoDaFila)
            }}
          >
            {ESTADOS_DA_FILA.map((cada) => (
              <option key={cada} value={cada}>
                {ESTADO_DA_FILA[cada]}
              </option>
            ))}
          </Seletor>
          <Seletor
            rotulo={copy.filtroDeTipo}
            valor={tipo}
            aoTrocar={(valor) => {
              definirAviso(null)
              definirTipo(valor as FiltroDeTipo)
            }}
          >
            <option value="todos">{copy.todosOsTipos}</option>
            {/* Tipo que ainda não tem quem o produza fica fora do filtro
                (D-15): anunciá-lo como "indisponível" era falar de etapa de
                construção a quem opera. */}
            {TIPOS.filter((cada) => !fatiaQueEntrega(cada)).map((cada) => (
              <option key={cada} value={cada}>
                {TIPO_DO_ITEM[cada]}
              </option>
            ))}
          </Seletor>
        </div>

        {assinatura === 'indisponivel' ? (
          <p className="m-0 text-[13px] text-texto-apoio">{copy.recarga(INTERVALO_DA_RECARGA_MS / 1000)}</p>
        ) : null}

        <Lista
          pendente={consulta.isPending}
          carga={consulta.data}
          estado={estado}
          tipo={tipo}
          aoMostrarTodos={() => definirTipo('todos')}
          escondidos={resolvidosAqui}
          membros={membros}
          podeResolver={podeResolver}
          servico={servico}
          chamadas={chamadas}
          aoResolver={aoResolver}
        />
      </div>
    </Moldura>
  )
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      {children}
    </AreaDeTrabalho>
  )
}

function nomeDe(usuarioId: string, membros: readonly Membro[]): string {
  return membros.find((membro) => membro.usuarioId === usuarioId)?.nome ?? copy.item.exMembro
}

function fraseDoJaResolvido(resolucao: Resolucao | null, membros: readonly Membro[]): string {
  if (resolucao === null) return copy.codigos.jaResolvidoSemAutor
  return copy.codigos.jaResolvido(nomeDe(resolucao.autor, membros), formatarInstante(resolucao.em))
}

function nomeDoLead(item: ItemDaFila): string {
  if (item.lead === null) return copy.item.semLead
  return item.lead.nome ?? item.lead.telefone ?? copy.item.semNome
}

/** Os estados da lista: carregando, falha, os dois vazios e os itens. */
function Lista({
  pendente,
  carga,
  estado,
  tipo,
  aoMostrarTodos,
  escondidos,
  membros,
  podeResolver,
  servico,
  chamadas,
  aoResolver,
}: {
  pendente: boolean
  carga: CargaDaFila | undefined
  estado: EstadoDaFila
  tipo: FiltroDeTipo
  aoMostrarTodos: () => void
  escondidos: ReadonlySet<string>
  membros: readonly Membro[]
  podeResolver: boolean
  servico: ServicoDaFila
  chamadas: ServicoDeChamadas
  aoResolver: (item: ItemDaFila, resultado: ResultadoDaResolucao, feito: string) => void
}) {
  if (pendente) return <Carregando texto={copy.carregando} />

  if (!carga?.ok) {
    return <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  }

  // A poda do que foi resolvido nesta tela vale só para os abertos: é o que faz
  // o item sair na mesma ação, antes de a carga refeita chegar.
  const doEstado =
    estado === 'aberto' ? carga.itens.filter((item) => !escondidos.has(item.id)) : carga.itens
  const itens = ordenarItens(filtrarPorTipo(doEstado, tipo))

  const situacao = estadoDaLista(carga.haItens, itens.length)
  if (situacao === 'nunca_preenchida') {
    return (
      <EstadoVazio
        titulo={copy.nuncaPreenchida.titulo}
        explicacao={copy.nuncaPreenchida.explicacao}
      />
    )
  }
  if (situacao === 'recorte_vazio') {
    if (tipo !== 'todos' && doEstado.length > 0) {
      return (
        <EstadoVazio
          titulo={copy.semDoTipo.titulo(tipo)}
          explicacao={copy.semDoTipo.explicacao}
          acao={{ rotulo: copy.semDoTipo.mostrarTodos, aoAcionar: aoMostrarTodos }}
        />
      )
    }
    return estado === 'aberto' ? (
      <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
    ) : (
      <EstadoVazio titulo={copy.semResolvidos.titulo} explicacao={copy.semResolvidos.explicacao} />
    )
  }

  return (
    <ul aria-label={copy.lista} className="m-0 flex list-none flex-col gap-3 p-0">
      {itens.map((item) => (
        <li key={item.id}>
          <CartaoDoItem
            item={item}
            membros={membros}
            podeResolver={podeResolver && item.resolucao === null}
            servico={servico}
            chamadas={chamadas}
            aoResolver={(resultado, feito) => aoResolver(item, resultado, feito)}
          />
        </li>
      ))}
    </ul>
  )
}

function Detalhes({ item }: { item: ItemDaFila }) {
  const { contexto } = item
  const linhas: string[] = []
  if (contexto.urgencia === 'alta') linhas.push(copy.item.urgente)
  if (contexto.pendencia !== null) linhas.push(copy.item.pendencia(contexto.pendencia))
  if (contexto.origem !== null) linhas.push(copy.item.origem(contexto.origem))
  if (contexto.tentativas !== null) {
    linhas.push(copy.item.tentativas(contexto.tentativas, contexto.telefone))
  }
  if (contexto.criterios.length > 0) linhas.push(copy.item.criterios(contexto.criterios))
  if (contexto.motivo !== null) linhas.push(copy.item.pendenciaDaClassificacao(contexto.motivo))
  if (linhas.length === 0) return null

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-texto-secundario">
      {linhas.map((linha) => (
        <li key={linha}>{linha}</li>
      ))}
    </ul>
  )
}

function CartaoDoItem({
  item,
  membros,
  podeResolver,
  servico,
  chamadas,
  aoResolver,
}: {
  item: ItemDaFila
  membros: readonly Membro[]
  podeResolver: boolean
  servico: ServicoDaFila
  chamadas: ServicoDeChamadas
  aoResolver: (resultado: ResultadoDaResolucao, feito: string) => void
}) {
  const rotulo = copy.item.rotulo(item.tipo, nomeDoLead(item))
  const acao = item.resolucao === null ? acaoDoItem(item) : null
  // A ação que já abre a ficha da chamada dispensa o elo de contexto repetido.
  const acaoAbreAChamada = acao?.tipo === 'abrir_chamada' || acao?.tipo === 'abrir_avaliacao'

  return (
    <article aria-label={rotulo} className="cartao flex flex-col gap-3.5 p-5 max-md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom="neutro">{TIPO_DO_ITEM[item.tipo]}</Selo>
        <Selo tom={TOM_DA_SEVERIDADE[item.severidade]}>{SEVERIDADE_DO_ITEM[item.severidade]}</Selo>
        <span className="val ml-auto text-[12.5px] text-texto-apoio">
          {formatarInstante(item.criadoEm)}
        </span>
      </div>

      <p className="m-0 text-[16px] font-bold tracking-[-0.01em] text-texto-principal">
        {item.lead ? (
          <Link to="/leads/$id" params={{ id: item.lead.id }} className="hover:underline">
            {nomeDoLead(item)}
          </Link>
        ) : (
          nomeDoLead(item)
        )}
        {item.lead?.nome && item.lead.telefone ? (
          <span className="val ml-2 text-[12.5px] font-normal text-texto-apoio">
            {item.lead.telefone}
          </span>
        ) : null}
      </p>

      <figure className="bloco-secundario m-0">
        <figcaption className="sobretitulo mb-1.5">{copy.item.recorte}</figcaption>
        <blockquote className="m-0 border-l-2 border-menta pl-3 text-[13.5px] leading-relaxed text-texto-principal">
          {item.contexto.recorte ?? copy.item.semRecorte}
        </blockquote>
      </figure>

      <Detalhes item={item} />

      <Limiar item={item} />

      {item.chamadaId !== null ? (
        <div className="flex flex-col items-start gap-2">
          {item.gravacao === 'disponivel' ? (
            <ReprodutorDeGravacao chamadaId={item.chamadaId} servico={chamadas} />
          ) : (
            <p className="m-0 text-[13px] text-texto-apoio">
              {item.gravacao === 'expurgada' ? copy.item.expurgada : copy.item.semGravacao}
            </p>
          )}
          {acaoAbreAChamada ? null : (
            <Link to="/chamadas/$id" params={{ id: item.chamadaId }} className="botao-link">
              {copy.item.abrirChamada}
            </Link>
          )}
        </div>
      ) : null}

      {acao !== null && (podeResolver || !acaoEscreve(acao)) ? (
        <AcaoDoCartao
          acao={acao}
          item={item}
          servico={servico}
          aoResolver={aoResolver}
        />
      ) : null}

      {item.resolucao !== null ? (
        <div className="flex flex-col gap-1 rounded-controle border border-positivo-borda bg-positivo-fundo px-3.5 py-2.5 text-[13px]">
          <p className="m-0 font-semibold text-positivo">
            {copy.item.resolvidoPor(
              nomeDe(item.resolucao.autor, membros),
              formatarInstante(item.resolucao.em),
            )}
          </p>
          <p className="m-0 text-texto-secundario">{item.resolucao.texto}</p>
        </div>
      ) : podeResolver ? (
        <FormularioDeResolucao
          item={item}
          rotulo={rotulo}
          servico={servico}
          aoResolver={aoResolver}
        />
      ) : null}
    </article>
  )
}

/** A frase do limiar que criou o item, com os números no formato brasileiro. */
function fraseDoLimiar(limiar: LimiarDoItem, item: ItemDaFila): string {
  const { contexto } = item
  switch (limiar.chave) {
    case 'sentiment_floor':
      return copy.limiar.sentiment_floor(
        formatarDecimal(limiar.valor, 2),
        contexto.sentimento === null ? null : formatarDecimal(contexto.sentimento, 2),
      )
    case 'failed_criteria_cap':
      return copy.limiar.failed_criteria_cap(limiar.valor, contexto.criterios.length)
    case 'consecutive_failures_cap':
      return copy.limiar.consecutive_failures_cap(limiar.valor)
    case 'credit_alert_cents':
      return copy.limiar.credit_alert_cents(
        formatarDecimal(limiar.valor / 100, 2),
        contexto.saldoCents === null ? null : formatarDecimal(contexto.saldoCents / 100, 2),
        contexto.provedor,
      )
  }
}

/** Por que o item está ali (RF-908): o limiar do retrato ou a origem dele. */
function Limiar({ item }: { item: ItemDaFila }) {
  const frases =
    item.limiares.length > 0
      ? item.limiares.map((limiar) => fraseDoLimiar(limiar, item))
      : [copy.item.semLimiar(item.tipo)]

  return (
    <section aria-label={copy.limiar.titulo} className="flex flex-col gap-1">
      <p className="sobretitulo m-0">{copy.limiar.titulo}</p>
      {frases.map((frase) => (
        <p key={frase} className="m-0 text-[13px] text-texto-secundario">
          {frase}
        </p>
      ))}
    </section>
  )
}

/**
 * A ação em um clique do tipo. As que abrem tela são elos; ligar é `tel:`,
 * que entrega a conversa a quem opera; confirmar o bloqueio escreve em
 * `dnc_entries` e resolve o item na mesma ação.
 */
function AcaoDoCartao({
  acao,
  item,
  servico,
  aoResolver,
}: {
  acao: AcaoDoItem
  item: ItemDaFila
  servico: ServicoDaFila
  aoResolver: (resultado: ResultadoDaResolucao, feito: string) => void
}) {
  switch (acao.tipo) {
    case 'ligar':
      return (
        <div>
          <a href={`tel:${acao.telefone}`} className="botao-primario">
            {copy.acao.ligar(nomeDoLead(item))}
          </a>
        </div>
      )
    case 'confirmar_bloqueio':
      return (
        <ConfirmarBloqueio
          item={item}
          telefone={acao.telefone}
          servico={servico}
          aoResolver={aoResolver}
        />
      )
    case 'abrir_chamada':
      return (
        <div>
          <Link to="/chamadas/$id" params={{ id: acao.chamadaId }} className="botao-primario">
            {copy.acao.abrirChamada}
          </Link>
        </div>
      )
    case 'abrir_avaliacao':
      return (
        <div>
          <Link
            to="/chamadas/$id"
            params={{ id: acao.chamadaId }}
            hash="avaliacao"
            className="botao-primario"
          >
            {copy.acao.abrirAvaliacao}
          </Link>
        </div>
      )
    case 'abrir_lead':
      return (
        <div>
          <Link to="/leads/$id" params={{ id: acao.leadId }} className="botao-primario">
            {copy.acao.abrirLead}
          </Link>
        </div>
      )
    case 'abrir_integracoes':
      return (
        <div>
          <Link to="/config/integracoes" className="botao-primario">
            {copy.acao.abrirIntegracoes}
          </Link>
        </div>
      )
  }
}

function ConfirmarBloqueio({
  item,
  telefone,
  servico,
  aoResolver,
}: {
  item: ItemDaFila
  telefone: string
  servico: ServicoDaFila
  aoResolver: (resultado: ResultadoDaResolucao, feito: string) => void
}) {
  const [enviando, definirEnviando] = useState(false)
  const [recusa, definirRecusa] = useState<string | null>(null)
  const emVoo = useRef(false)

  async function confirmar() {
    if (emVoo.current) return
    emVoo.current = true
    definirEnviando(true)
    definirRecusa(null)

    let resultado: ResultadoDaResolucao
    try {
      resultado = await servico.confirmarBloqueio(item.id, telefone, copy.acao.textoDoBloqueio)
    } catch {
      resultado = { codigo: 'falha-de-comunicacao' }
    }

    emVoo.current = false
    definirEnviando(false)
    if (resultado.codigo === 'sem_permissao') {
      definirRecusa(copy.acao.semPermissaoDeBloqueio)
    } else if (resultado.codigo === 'resolucao_vazia' || resultado.codigo === 'falha-de-comunicacao') {
      definirRecusa(copy.codigos[resultado.codigo])
    }
    aoResolver(resultado, copy.acao.bloqueioConfirmado)
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {recusa ? <CaixaDeErro>{recusa}</CaixaDeErro> : null}
      <button
        type="button"
        className="botao-primario"
        disabled={enviando}
        onClick={() => void confirmar()}
      >
        {enviando ? copy.acao.confirmando : copy.acao.confirmarBloqueio}
      </button>
    </div>
  )
}

function FormularioDeResolucao({
  item,
  rotulo,
  servico,
  aoResolver,
}: {
  item: ItemDaFila
  rotulo: string
  servico: ServicoDaFila
  aoResolver: (resultado: ResultadoDaResolucao, feito: string) => void
}) {
  const [texto, definirTexto] = useState('')
  const [enviando, definirEnviando] = useState(false)
  const [recusa, definirRecusa] = useState<string | null>(null)
  // O botão desligado cobre o clique seguinte ao desenho; a trava cobre o que
  // chega antes dele.
  const emVoo = useRef(false)

  async function resolver() {
    if (emVoo.current) return
    emVoo.current = true
    definirEnviando(true)
    definirRecusa(null)

    let resultado: ResultadoDaResolucao
    try {
      resultado = await servico.resolver(item.id, textoDaResolucao(texto, copy.resolver.padrao))
    } catch {
      resultado = { codigo: 'falha-de-comunicacao' }
    }

    emVoo.current = false
    definirEnviando(false)
    // O que tira o item da lista vira aviso da tela, que sobrevive a ele; o
    // resto fica no item, que continua aberto.
    if (
      resultado.codigo === 'sem_permissao' ||
      resultado.codigo === 'resolucao_vazia' ||
      resultado.codigo === 'falha-de-comunicacao'
    ) {
      definirRecusa(copy.codigos[resultado.codigo])
    }
    aoResolver(resultado, copy.resolver.feito)
  }

  return (
    <div className="flex flex-col gap-3">
      {recusa ? <CaixaDeErro>{recusa}</CaixaDeErro> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <CampoDeTexto
            rotulo={copy.resolver.campo}
            exemplo={copy.resolver.exemplo}
            placeholder={copy.resolver.sugestao}
            name="resolucao"
            autoComplete="off"
            value={texto}
            onChange={(evento) => definirTexto(evento.target.value)}
          />
        </div>
        <button
          type="button"
          className="botao-primario"
          aria-label={copy.resolver.rotulo(rotulo)}
          disabled={enviando}
          onClick={() => void resolver()}
        >
          {enviando ? copy.resolver.enviando : copy.resolver.botao}
        </button>
      </div>
    </div>
  )
}
