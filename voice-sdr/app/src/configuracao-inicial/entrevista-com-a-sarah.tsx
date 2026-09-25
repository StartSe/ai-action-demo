import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { SugestaoDaEtapa } from '@sugestoes/sugestoes.ts'

import { useTextosDoInicio } from '@/configuracao-inicial/textos'
import { useServicoDaSarah } from '@/sarah/contexto'
import type {
  CondutorDeConversa,
  ConversaEmCurso,
  EstadoDaConversa,
  TurnoAoVivo,
} from '@/sarah/ensaio'

/** Quantas vezes pedir de novo a transcrição que o provedor ainda processa. */
const TENTATIVAS_DO_FECHAMENTO = 3
const ESPERA_DO_FECHAMENTO_MS = 3_000

/** Quantos turnos a tela mostra enquanto a conversa acontece. */
const TURNOS_A_VISTA = 3

/**
 * De quanto em quanto tempo, no máximo, o sinal de "digitando" sai. O provedor
 * segura o agente por uns segundos a cada sinal; um por tecla seria ruído.
 */
const INTERVALO_DO_SINAL_MS = 1_000

type Fase = 'antes' | 'abrindo' | 'em_curso' | 'processando' | 'erro'

type EntrevistaComASarahProps = {
  condutor: CondutorDeConversa
  /** A voz escolhida no assistente: a entrevista já soa como a Sarah vai soar. */
  voz?: { readonly id: string; readonly nome: string } | null
  aoGerar: (sugestoes: readonly SugestaoDaEtapa[]) => void
  aoEscrever: () => void
  /** A espera animada enquanto a conversa vira sugestões. */
  espera: ReactNode
}

/**
 * A entrevista de configuração por voz: a Sarah pergunta sobre o negócio, e a
 * conversa vira as sugestões da etapa seguinte. O condutor entra por prop, como
 * no ensaio: o SDK do provedor só roda no navegador, e o teste usa um dublê.
 *
 * A conversa começa por um clique aqui dentro, e não ao montar: é o clique que
 * deixa o navegador abrir o microfone e tocar o áudio.
 */
export function EntrevistaComASarah({
  condutor,
  voz = null,
  aoGerar,
  aoEscrever,
  espera,
}: EntrevistaComASarahProps) {
  const sarah = useServicoDaSarah()
  const copy = useTextosDoInicio()
  const [fase, definirFase] = useState<Fase>('antes')
  const [estado, definirEstado] = useState<EstadoDaConversa>('parada')
  const [turnos, definirTurnos] = useState<TurnoAoVivo[]>([])
  const [erro, definirErro] = useState<string | null>(null)
  const [rascunho, definirRascunho] = useState('')

  const conversa = useRef<ConversaEmCurso | null>(null)
  const agente = useRef<string | null>(null)
  const identificador = useRef<string | null>(null)
  const fechando = useRef(false)
  const montado = useRef(true)
  const ultimoSinal = useRef(0)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      // Sair da etapa no meio da conversa encerra a conversa, senão o
      // microfone continua aberto numa tela que ninguém vê.
      void conversa.current?.encerrar().catch(() => {})
    }
  }, [])

  async function comecar() {
    definirFase('abrindo')
    definirErro(null)
    fechando.current = false

    const aberta = await sarah.abrirEntrevista(voz)
    if (!aberta.ok) {
      definirFase('erro')
      definirErro(aberta.mensagem ?? copy.chave.falha)
      return
    }
    agente.current = aberta.agenteId

    try {
      conversa.current = await condutor.abrir(
        { urlAssinada: aberta.urlAssinada, modo: 'voice', variaveis: {} },
        {
          aoTurno: (turno) => definirTurnos((atuais) => [...atuais, turno]),
          aoEstado: (novo) => {
            definirEstado(novo)
            // A Sarah desligou sozinha depois do resumo: segue para as
            // sugestões como se a pessoa tivesse clicado.
            if (novo === 'parada' && conversa.current && !fechando.current) void fechar()
          },
          aoCair: () => {
            if (!fechando.current) definirErro(copy.entrevista.caiu)
          },
        },
      )
      identificador.current = conversa.current.identificador()
      if (montado.current) definirFase('em_curso')
    } catch {
      definirFase('erro')
      definirErro(copy.entrevista.semMicrofone)
    }
  }

  async function fechar() {
    if (fechando.current) return
    fechando.current = true
    const emCurso = conversa.current
    identificador.current = emCurso?.identificador() ?? identificador.current
    conversa.current = null
    definirFase('processando')
    await emCurso?.encerrar().catch(() => {})
    await pedirSugestoes()
  }

  async function pedirSugestoes() {
    const agenteId = agente.current
    const conversaId = identificador.current
    if (!agenteId || !conversaId) {
      definirFase('erro')
      definirErro(copy.entrevista.caiu)
      return
    }

    for (let tentativa = 0; tentativa < TENTATIVAS_DO_FECHAMENTO; tentativa += 1) {
      const resultado = await sarah.encerrarEntrevista(agenteId, conversaId)
      if (!montado.current) return
      if (resultado.ok) {
        aoGerar(resultado.etapas)
        return
      }
      if (!resultado.pendente) {
        definirFase('erro')
        definirErro(resultado.mensagem ?? copy.chave.falha)
        return
      }
      await new Promise((resolver) => window.setTimeout(resolver, ESPERA_DO_FECHAMENTO_MS))
    }
    definirFase('erro')
    definirErro(copy.chave.falha)
  }

  /**
   * O que a pessoa digita vai para a Sarah como fala dela, sem fechar o
   * microfone: dá para falar e escrever na mesma conversa. O turno entra na
   * lista aqui, porque o provedor só devolve como turno o que ele transcreveu
   * da voz.
   */
  /** Quem está digitando não é cobrado: a Sarah espera. */
  function digitando(texto: string) {
    definirRascunho(texto)
    const agora = Date.now()
    if (texto === '' || agora - ultimoSinal.current < INTERVALO_DO_SINAL_MS) return
    ultimoSinal.current = agora
    conversa.current?.sinalizarAtividade?.()
  }

  async function enviar() {
    const texto = rascunho.trim()
    const emCurso = conversa.current
    if (!texto || !emCurso) return
    definirRascunho('')
    definirTurnos((atuais) => [...atuais, { quem: 'lead', texto }])
    await emCurso.dizer(texto).catch(() => definirErro(copy.entrevista.caiu))
  }

  if (fase === 'processando') return <>{espera}</>

  if (fase === 'antes' || fase === 'abrindo') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        {/* Em repouso o sinal flutua; abrindo, ele disca. */}
        <span
          aria-hidden="true"
          className={`sinal my-2 h-16 w-16 ${fase === 'abrindo' ? 'sinal-discando' : ''}`}
        />
        <p className="m-0 max-w-[36ch] text-[13.5px] leading-relaxed text-texto-apoio">{copy.entrevista.antes}</p>
        <button
          type="button"
          onClick={() => void comecar()}
          disabled={fase === 'abrindo'}
          className="botao-primario"
        >
          {fase === 'abrindo' ? copy.entrevista.abrindo : copy.entrevista.comecar}
        </button>
        <button type="button" onClick={aoEscrever} className="botao-link">
          {copy.entrevista.escrever}
        </button>
      </div>
    )
  }

  if (fase === 'erro') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <p role="alert" className="m-0 max-w-[40ch] text-[13px] text-perigo">
          {erro}
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {agente.current && identificador.current ? (
            <button
              type="button"
              onClick={() => {
                definirFase('processando')
                void pedirSugestoes()
              }}
              className="botao-primario"
            >
              {copy.entrevista.tentarDeNovo}
            </button>
          ) : (
            <button type="button" onClick={() => void comecar()} className="botao-primario">
              {copy.entrevista.tentarDeNovo}
            </button>
          )}
          <button type="button" onClick={aoEscrever} className="botao-secundario">
            {copy.entrevista.escrever}
          </button>
        </div>
      </div>
    )
  }

  const falando = estado === 'falando'
  const rotuloDoEstado =
    estado === 'falando'
      ? copy.entrevista.falando
      : estado === 'conectando'
        ? copy.entrevista.conectando
        : copy.entrevista.ouvindo
  // O sinal da IA diz o mesmo que a frase ao lado: falando, discando enquanto
  // conecta, e ouvindo no resto.
  const classeDoSinal = falando
    ? 'sinal-falando'
    : estado === 'conectando'
      ? 'sinal-discando'
      : 'sinal-ouvindo'

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="flex h-32 flex-col items-center justify-center gap-3">
        <span aria-hidden="true" className={`sinal h-20 w-20 ${classeDoSinal}`} />
        {/* A onda só existe enquanto a Sarah fala; a altura reservada acima
            evita que o resto da etapa pule quando ela entra e sai. */}
        {falando ? (
          <span aria-hidden="true" className="onda-de-voz" style={{ height: 18 }}>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </div>
      <p role="status" className="m-0 flex items-center gap-2 text-[13px] font-bold text-texto-secundario">
        <span aria-hidden="true" className="ao-vivo" />
        {rotuloDoEstado}
      </p>

      <ul aria-label={copy.entrevista.conversar} className="m-0 flex w-full list-none flex-col gap-2 p-0">
        {turnos.slice(-TURNOS_A_VISTA).map((turno, indice) => (
          <li
            key={`${turnos.length}-${indice}`}
            className={`trocar-frase max-w-[85%] rounded-cartao border px-3.5 py-2 text-[13px] leading-snug ${
              turno.quem === 'agent'
                ? 'self-start rounded-bl-pequeno border-borda-suave bg-superficie-2 text-texto-secundario'
                : 'self-end rounded-br-pequeno border-acento/25 bg-acento-repouso text-acento-tinta'
            }`}
          >
            {turno.texto}
          </li>
        ))}
      </ul>

      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          void enviar()
        }}
        className="flex w-full gap-2"
      >
        <input
          aria-label={copy.entrevista.digitar}
          placeholder={copy.entrevista.digitarExemplo}
          value={rascunho}
          onChange={(evento) => digitando(evento.target.value)}
          className="campo min-w-0 flex-1"
        />
        <button type="submit" disabled={rascunho.trim() === ''} className="botao-secundario">
          {copy.entrevista.enviar}
        </button>
      </form>

      {erro ? (
        <p role="alert" className="m-0 text-center text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}

      <button type="button" onClick={() => void fechar()} className="botao-primario">
        {copy.entrevista.encerrar}
      </button>
    </div>
  )
}
