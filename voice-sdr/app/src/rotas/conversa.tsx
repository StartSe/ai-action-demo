import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import {
  AUTOR_DA_MENSAGEM_EM_PORTUGUES,
  detalhe as copy,
  STATUS_DA_CONVERSA_EM_PORTUGUES,
  STATUS_DA_MENSAGEM_EM_PORTUGUES,
} from '@/copy/conversas'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeOperarConversas, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { identificacaoDaConversa } from '@/whatsapp/leitura'
import { useServicoDeWhatsapp } from '@/whatsapp/contexto'
import type {
  ConversaDetalhe,
  MensagemDaConversa,
  ResultadoDaAcao,
  StatusDaConversa,
} from '@/whatsapp/tipos'
import { formatarInstante } from '@/utilidades/datas'

const CHAVE_DA_EQUIPE = ['equipe'] as const

const TOM_DO_STATUS: Record<StatusDaConversa, TomDoSelo> = {
  assistente: 'acento',
  humano: 'informacao',
  encerrada: 'neutro',
}

type Acesso = { tipo: 'desconhecido' } | { tipo: 'opera' } | { tipo: 'leitura'; administradores: readonly Membro[] }

/**
 * `/conversas/$id`: o histórico de uma conversa de WhatsApp, com quem está
 * atendendo e as ações de assumir, devolver e encerrar. O tempo real assina
 * `whatsapp_messages` desta conversa e só avisa — quem refaz a carga é a
 * consulta de sempre, como `/fila` faz.
 */
export function TelaDaConversa() {
  const { id } = useParams({ from: '/aplicacao/conversas/$id' })
  const servico = useServicoDeWhatsapp()
  const equipe = useServicoDeEquipe()
  const cliente = useQueryClient()

  const consulta = useQuery({
    queryKey: ['whatsapp-conversa', id],
    queryFn: () => servico.carregarConversa(id),
  })
  const consultaDaEquipe = useQuery({ queryKey: CHAVE_DA_EQUIPE, queryFn: () => equipe.carregar() })

  useEffect(
    () =>
      servico.assinar(id, () => {
        void cliente.invalidateQueries({ queryKey: ['whatsapp-conversa', id] })
      }),
    [servico, cliente, id],
  )

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
          acao={{ rotulo: copy.naoEncontrada.acao, endereco: '/conversas' }}
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

  const cargaDaEquipe = consultaDaEquipe.data
  const acesso: Acesso =
    cargaDaEquipe?.ok !== true
      ? { tipo: 'desconhecido' }
      : podeOperarConversas(cargaDaEquipe.equipe.papelDoUsuario)
        ? { tipo: 'opera' }
        : { tipo: 'leitura', administradores: quemConcedeAcesso(cargaDaEquipe.equipe.membros) }

  return (
    <Conversa
      conversa={carga.conversa}
      acesso={acesso}
      aoMudar={() => cliente.invalidateQueries({ queryKey: ['whatsapp-conversa', id] })}
    />
  )
}

function Moldura({ titulo = copy.titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <AreaDeTrabalho
      titulo={titulo}
      acoes={
        <Link to="/conversas" className="botao-secundario no-underline">
          {copy.voltar}
        </Link>
      }
    >
      {children}
    </AreaDeTrabalho>
  )
}

function Conversa({
  conversa,
  acesso,
  aoMudar,
}: {
  conversa: ConversaDetalhe
  acesso: Acesso
  aoMudar: () => Promise<unknown>
}) {
  const identificacao = identificacaoDaConversa(conversa)

  return (
    <Moldura titulo={identificacao}>
      <div className="flex flex-col gap-5">
        <Painel
          titulo={copy.proposito}
          estado={<Selo tom={TOM_DO_STATUS[conversa.status]}>{STATUS_DA_CONVERSA_EM_PORTUGUES[conversa.status]}</Selo>}
        >
          <p className="m-0 text-[13.5px] text-texto-secundario">{conversa.proposito ?? copy.semProposito}</p>
        </Painel>

        {acesso.tipo === 'leitura' ? (
          <NegativaPorPapel aviso={copy.acoes.soLeitura} administradores={acesso.administradores} />
        ) : null}

        <Painel titulo={copy.mensagens}>
          <Historico mensagens={conversa.mensagens} />
        </Painel>

        {acesso.tipo === 'opera' ? <Acoes conversa={conversa} aoMudar={aoMudar} /> : null}
      </div>
    </Moldura>
  )
}

function Historico({ mensagens }: { mensagens: readonly MensagemDaConversa[] }) {
  if (mensagens.length === 0) {
    return <p className="m-0 text-[13.5px] text-texto-apoio">{copy.semMensagem}</p>
  }

  return (
    <div role="log" aria-label={copy.mensagens} className="flex max-h-[28rem] flex-col gap-2.5 overflow-y-auto pr-1">
      {mensagens.map((mensagem) => (
        <Balao key={mensagem.id} mensagem={mensagem} />
      ))}
    </div>
  )
}

/**
 * O conteúdo do balão. Áudio e imagem lidos pelo modelo mostram o rótulo e o
 * texto derivado (a transcrição, a descrição e a legenda); o resto da mídia
 * mostra o tipo e a legenda, quando houver.
 */
function ConteudoDaMensagem({ mensagem }: { mensagem: MensagemDaConversa }) {
  const { midia, corpo } = mensagem
  if (!midia) return <p className="m-0">{corpo || copy.semMensagem}</p>

  const legenda = corpo.trim() ? <p className="m-0 text-texto-apoio">{copy.legenda(corpo.trim())}</p> : null
  if (midia === 'audio' || midia === 'imagem') {
    if (mensagem.estadoDaLeitura === 'lida' && mensagem.leituraDaMidia) {
      return (
        <>
          <p className="m-0 text-[12px] font-semibold text-texto-apoio">{copy.midiaLida[midia]}</p>
          <p className="m-0">{mensagem.leituraDaMidia}</p>
          {legenda}
        </>
      )
    }
    const aviso =
      mensagem.estadoDaLeitura === 'pendente'
        ? copy.leituraPendente[midia]
        : mensagem.estadoDaLeitura === 'falhou'
          ? copy.leituraFalhou[midia]
          : null
    return (
      <>
        <p className="m-0">{copy.midia(midia)}</p>
        {aviso ? <p className="m-0 text-[12.5px] text-texto-apoio">{aviso}</p> : null}
        {legenda}
      </>
    )
  }
  return (
    <>
      <p className="m-0">{copy.midia(midia)}</p>
      {legenda}
    </>
  )
}

function Balao({ mensagem }: { mensagem: MensagemDaConversa }) {
  const doLead = mensagem.direcao === 'in'

  return (
    <div
      data-status={mensagem.status}
      className={`m-0 flex max-w-[85%] flex-col gap-1 rounded-cartao border px-3.5 py-2.5 text-[13.5px] leading-relaxed text-texto-secundario ${
        doLead
          ? 'self-start rounded-tl-pequeno border-borda-suave bg-superficie-2'
          : 'self-end rounded-tr-pequeno border-positivo-borda bg-positivo-fundo'
      }`}
    >
      <p
        className={`m-0 mb-0.5 text-[12px] font-bold ${doLead ? 'text-texto-principal' : 'text-menta-2'}`}
      >
        {AUTOR_DA_MENSAGEM_EM_PORTUGUES[mensagem.autor]}
      </p>
      <ConteudoDaMensagem mensagem={mensagem} />
      <p className="val m-0 flex items-center gap-2 text-[11px] text-texto-apoio">
        {formatarInstante(mensagem.criadaEm)}
        {!doLead ? <span>{STATUS_DA_MENSAGEM_EM_PORTUGUES[mensagem.status]}</span> : null}
        {mensagem.status === 'falhou' ? (
          <span className="text-perigo">{mensagem.erro ?? copy.falhouAEnviar}</span>
        ) : null}
      </p>
    </div>
  )
}

function Acoes({ conversa, aoMudar }: { conversa: ConversaDetalhe; aoMudar: () => Promise<unknown> }) {
  const servico = useServicoDeWhatsapp()
  const [texto, definirTexto] = useState('')
  const [ocupado, definirOcupado] = useState<'assumir' | 'devolver' | 'encerrar' | 'mensagem' | null>(null)
  const [perguntandoEncerrar, definirPerguntandoEncerrar] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)

  async function agir(acao: 'assumir' | 'devolver' | 'encerrar' | 'mensagem', texto?: string) {
    definirOcupado(acao)
    definirErro(null)
    const resultado: ResultadoDaAcao = await servico.agir({ conversaId: conversa.id, acao, texto })
    definirOcupado(null)
    if (!resultado.ok) {
      definirErro(resultado.mensagem)
      return
    }
    if (acao === 'mensagem') definirTexto('')
    definirPerguntandoEncerrar(false)
    await aoMudar()
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (texto.trim() === '' || ocupado) return
    await agir('mensagem', texto.trim())
  }

  return (
    <Painel titulo={copy.acoes.titulo}>
      <div className="flex flex-col gap-4">
        {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}

        <div className="flex flex-wrap gap-2.5">
          {conversa.status === 'assistente' ? (
            <button
              type="button"
              className="botao-primario"
              disabled={ocupado !== null}
              onClick={() => void agir('assumir')}
            >
              {ocupado === 'assumir' ? copy.acoes.assumindo : copy.acoes.assumir}
            </button>
          ) : null}
          {conversa.status === 'humano' ? (
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado !== null}
              onClick={() => void agir('devolver')}
            >
              {ocupado === 'devolver' ? copy.acoes.devolvendo : copy.acoes.devolver}
            </button>
          ) : null}
          {conversa.status !== 'encerrada' ? (
            <button
              type="button"
              className="botao-perigo"
              disabled={ocupado !== null}
              onClick={() => definirPerguntandoEncerrar(true)}
            >
              {copy.acoes.encerrar}
            </button>
          ) : null}
        </div>

        {conversa.status === 'encerrada' ? (
          <p className="m-0 text-[13px] text-texto-apoio">{copy.campo.encerrada}</p>
        ) : (
          <form onSubmit={(evento) => void enviar(evento)} className="flex flex-col items-start gap-2.5">
            <CampoDeTextoLongo
              rotulo={copy.campo.rotulo}
              exemplo={copy.campo.exemplo}
              rows={3}
              value={texto}
              disabled={ocupado !== null}
              onChange={(evento) => definirTexto(evento.target.value)}
            />
            <button
              type="submit"
              className="botao-primario"
              disabled={ocupado !== null || texto.trim() === ''}
            >
              {ocupado === 'mensagem' ? copy.campo.enviando : copy.campo.enviar}
            </button>
          </form>
        )}
      </div>

      {perguntandoEncerrar ? (
        <Dialogo
          titulo={copy.acoes.encerrar}
          explicacao={copy.acoes.confirmarEncerramento}
          cancelar={copy.acoes.cancelar}
          confirmar={copy.acoes.encerrar}
          tom="perigo"
          ocupado={ocupado === 'encerrar'}
          aoCancelar={() => definirPerguntandoEncerrar(false)}
          aoConfirmar={() => void agir('encerrar')}
        />
      ) : null}
    </Painel>
  )
}
