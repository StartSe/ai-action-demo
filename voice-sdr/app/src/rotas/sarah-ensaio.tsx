import { useRef, useState } from 'react'

import {
  PERFIL_PADRAO,
  PERFIS_DE_LEAD,
  type IdDoPerfil,
} from '@compartilhado/ensaio/perfis-de-lead.ts'
import type { Proposito } from '@compartilhado/playbook/camada-um.ts'
import type { ModoDoEnsaio } from '@ensaio/sessao.ts'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { textosDoEnsaio } from '@/copy/ensaio'
import { nomeDaFerramenta } from '@/copy/ferramentas'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { useServicoDoEnsaio } from '@/ensaio/contexto'
import { emOrdemDoInstante } from '@/ensaio/ferramentas'
import type { FerramentaDoEnsaio } from '@/ensaio/tipos'
import {
  avancarVoz,
  permissaoDoErro,
  type EstadoDaVoz,
  type EventoDaVoz,
  type MicrofoneDoEnsaio,
} from '@/ensaio/voz'
import { useServicoDaSarah } from '@/sarah/contexto'
import { useNomeDaAssistente } from '@/sarah/nome-da-assistente'
import {
  PROPOSITOS_DO_ENSAIO,
  variaveisDaSessao,
  type CondutorDeConversa,
  type ConversaEmCurso,
  type EstadoDaConversa,
  type TurnoAoVivo,
} from '@/sarah/ensaio'
import { formatarHora } from '@/utilidades/datas'

/**
 * `/sarah/ensaio`: conversar com a Sarah sem telefone (US-247, T-16, RF-312).
 *
 * Quatro decisões explicam o desenho:
 *
 * 1. **Ensaia-se contra o agente publicado.** A tela não escolhe agente nem
 *    modelo: ela escolhe o propósito, e a borda abre a sessão contra a
 *    publicação daquele propósito. Sem publicação, a recusa manda publicar.
 * 2. **O condutor entra por prop.** Quem fala com o SDK do provedor é
 *    `condutor-elevenlabs.ts`, que só roda no navegador. A tela fala com o
 *    contrato, e por isso os estados, a ordem dos passos e o que acontece
 *    quando a conversa cai se provam em jsdom.
 * 3. **Cair não é encerrar.** Quando a conversa morre sozinha, a tela fecha o
 *    ensaio assim mesmo — senão a linha fica aberta para sempre no banco e o
 *    ensaio nunca vira uma ficha revisável.
 * 4. **O fim leva para a ficha.** O ensaio é uma chamada, e o ciclo de
 *    evolução (US-245) funciona sobre ele igual. É esse o laço: ensaiar,
 *    revisar, publicar, ensaiar de novo.
 * 5. **As ferramentas saem do banco, na ordem do instante** (US-114). A tela
 *    relê `call_tool_invocations` a cada fala da Sarah e no fim, e ordena por
 *    `at`: mostra o que o provedor fez, não o que ela supôs. As de sistema só
 *    aparecem no fim, porque é `call-finalize` que as grava.
 * 6. **No modo voz, o microfone vem antes da sessão** (US-115). A permissão se
 *    pede a `MicrofoneDoEnsaio` antes de `rehearsal-session`: negada, ela é
 *    estado de tela com o caminho para liberar, e nenhuma chamada de ensaio
 *    nasce. Os estados do modo voz saem de `avancarVoz`, em `ensaio/voz.ts`.
 */
export function TelaDeEnsaio({
  condutor,
  microfone,
}: {
  condutor: CondutorDeConversa
  microfone: MicrofoneDoEnsaio
}) {
  const copy = useTextosDoEnsaio()
  const servico = useServicoDaSarah()
  const servicoDoEnsaio = useServicoDoEnsaio()

  const [passo, setPasso] = useState<Passo>({ nome: 'preparo' })
  const [proposito, setProposito] = useState<Proposito>('discovery')
  const [modo, setModo] = useState<ModoDoEnsaio>('text')
  const [perfil, setPerfil] = useState<IdDoPerfil>(PERFIL_PADRAO)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<{ mensagem: string; caminho?: string } | null>(null)
  const [voz, setVoz] = useState<EstadoDaVoz | null>(null)
  const despacharVoz = (evento: EventoDaVoz) => setVoz((atual) => avancarVoz(atual, evento))

  // A conversa viva não é estado de renderização: trocá-la não redesenha nada,
  // e guardá-la em `useState` faria cada turno recriar o objeto do condutor.
  const conversa = useRef<ConversaEmCurso | null>(null)

  const [ferramentas, setFerramentas] = useState<readonly FerramentaDoEnsaio[]>([])
  const [leituraFalhou, setLeituraFalhou] = useState(false)
  // Leituras se sobrepõem quando a Sarah fala depressa: só a mais nova vale,
  // senão uma resposta atrasada desenharia uma lista mais velha por cima.
  const ultimaLeitura = useRef(0)

  async function lerFerramentas(chamadaId: string) {
    const esta = ++ultimaLeitura.current
    const carga = await servicoDoEnsaio.carregarFerramentas(chamadaId)
    if (esta !== ultimaLeitura.current) return
    if (!carga.ok) {
      setLeituraFalhou(true)
      return
    }
    setLeituraFalhou(false)
    setFerramentas(emOrdemDoInstante(carga.ferramentas))
  }

  function limparFerramentas() {
    ultimaLeitura.current += 1
    setFerramentas([])
    setLeituraFalhou(false)
  }

  async function comecar() {
    setOcupado(copy.preparo.abrindo)
    setErro(null)
    limparFerramentas()

    // O microfone antes da sessão: negado, nenhuma chamada de ensaio nasce.
    if (modo === 'voice') {
      despacharVoz({ tipo: 'pedir' })
      setOcupado(copy.voz.pedindo)
      const permissao = await microfone.pedir()
      despacharVoz({ tipo: 'permissao', resultado: permissao })
      if (permissao !== 'liberado') {
        setOcupado(null)
        return
      }
      setOcupado(copy.preparo.abrindo)
    } else {
      setVoz(null)
    }

    const abertura = await servico.abrirEnsaio({ proposito, modo, perfil })
    if (!abertura.ok) {
      setOcupado(null)
      setVoz(null)
      setErro({
        mensagem: abertura.mensagem,
        ...(abertura.caminho ? { caminho: abertura.caminho } : {}),
      })
      return
    }

    const emCurso: EmCurso = {
      nome: 'conversa',
      ensaioId: abertura.ensaioId,
      chamadaId: abertura.chamadaId,
      turnos: [],
      estado: 'conectando',
      modo: abertura.modo,
    }
    setPasso(emCurso)

    try {
      conversa.current = await condutor.abrir(
        {
          urlAssinada: abertura.urlAssinada,
          modo: abertura.modo,
          variaveis: variaveisDaSessao(abertura.chamadaId, abertura.variaveis),
          primeiraFala: abertura.primeiraFala ?? null,
        },
        {
          aoTurno(turno) {
            setPasso((atual) =>
              atual.nome === 'conversa' ? { ...atual, turnos: [...atual.turnos, turno] } : atual,
            )
            // A ferramenta roda antes da fala que a segue: a fala da Sarah é o
            // momento de reler o registro.
            if (turno.quem === 'agent') void lerFerramentas(abertura.chamadaId)
          },
          aoEstado(estado) {
            despacharVoz({ tipo: 'conversa', estado })
            setPasso((atual) => (atual.nome === 'conversa' ? { ...atual, estado } : atual))
          },
          aoCair(mensagem) {
            // Cair não é encerrar: fecha-se o ensaio assim mesmo.
            setErro({ mensagem: copy.conversa.caiu(mensagem) })
            void fechar(abertura.ensaioId)
          },
        },
      )
      setOcupado(null)
    } catch (falha) {
      // O ensaio já existe no banco quando o condutor falha: fechá-lo aqui
      // evita a linha pendurada. O microfone revogado entre o pedido e a
      // sessão continua sendo estado de tela, não erro cru.
      setOcupado(null)
      const permissao = abertura.modo === 'voice' ? permissaoDoErro(falha) : null
      if (permissao) despacharVoz({ tipo: 'permissao', resultado: permissao })
      else setErro({ mensagem: copy.conversa.naoAbriu })
      void fechar(abertura.ensaioId)
    }
  }

  /** Encerra no servidor e leva ao fim. Usado pelo botão e por quem cai. */
  async function fechar(ensaioId: string) {
    const conversaId = conversa.current?.identificador() ?? null
    try {
      await conversa.current?.encerrar()
    } catch {
      // O condutor já pode ter caído. O que importa é fechar no servidor.
    }
    conversa.current = null
    despacharVoz({ tipo: 'encerrar' })

    setOcupado(copy.conversa.encerrando)
    const desfecho = await servico.encerrarEnsaio(ensaioId, conversaId)
    setOcupado(null)

    if (!desfecho.ok) {
      setErro({ mensagem: desfecho.mensagem })
      return
    }
    setPasso({ nome: 'fim', chamadaId: desfecho.chamadaId, turnos: desfecho.turnos })
    await lerFerramentas(desfecho.chamadaId)
  }

  async function dizer(texto: string) {
    await conversa.current?.dizer(texto)
    setPasso((atual) =>
      atual.nome === 'conversa'
        ? { ...atual, turnos: [...atual.turnos, { quem: 'lead', texto }] }
        : atual,
    )
  }

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.apoio}>
      <div className="flex flex-col gap-5">
        {erro ? (
          <CaixaDeErro tom={erro.caminho ? 'atencao' : 'perigo'}>
            <p className="m-0">{erro.mensagem}</p>
            {erro.caminho ? (
              <p className="mt-2 mb-0">
                <a href={erro.caminho} className="botao-primario no-underline">
                  {copy.resolver}
                </a>
              </p>
            ) : null}
          </CaixaDeErro>
        ) : null}

        {voz === 'sem_permissao' || voz === 'sem_microfone' ? (
          <SemMicrofone
            situacao={voz}
            ocupado={ocupado}
            aoTentarDeNovo={() => {
              limparFerramentas()
              setPasso({ nome: 'preparo' })
              void comecar()
            }}
            aoIrPorTexto={() => {
              setVoz(null)
              setModo('text')
              limparFerramentas()
              setPasso({ nome: 'preparo' })
            }}
          />
        ) : null}

        {passo.nome === 'preparo' ? (
          <Preparo
            proposito={proposito}
            modo={modo}
            perfil={perfil}
            ocupado={ocupado}
            aoTrocarProposito={setProposito}
            aoTrocarModo={(valor) => {
              setVoz(null)
              setModo(valor)
            }}
            aoTrocarPerfil={setPerfil}
            aoComecar={() => void comecar()}
          />
        ) : null}

        {passo.nome === 'conversa' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Conversa
              estado={passo}
              voz={voz}
              ocupado={ocupado}
              aoDizer={(texto) => void dizer(texto)}
              aoEncerrar={() => void fechar(passo.ensaioId)}
            />
            <FerramentasChamadas
              ferramentas={ferramentas}
              leituraFalhou={leituraFalhou}
              vazia={copy.ferramentas.nenhuma}
            />
          </div>
        ) : null}

        {passo.nome === 'fim' ? (
          <Painel
            titulo={copy.fim.titulo}
            estado={
              voz === 'encerrado' ? <Selo tom="neutro">{copy.voz.estados.encerrado}</Selo> : null
            }
          >
            <div className="flex flex-col gap-4">
              <p className="m-0 text-[13.5px] text-texto-apoio">
                {passo.turnos > 0 ? copy.fim.comTurnos(passo.turnos) : copy.fim.semTurnos}
                {ferramentas.length > 0 ? ` ${copy.fim.comFerramentas(ferramentas.length)}` : null}
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={`/chamadas/${passo.chamadaId}`} className="botao-primario no-underline">
                  {copy.fim.abrirFicha}
                </a>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => {
                    setErro(null)
                    setVoz(null)
                    limparFerramentas()
                    setPasso({ nome: 'preparo' })
                  }}
                >
                  {copy.fim.outro}
                </button>
              </div>
            </div>
          </Painel>
        ) : null}

        {passo.nome === 'fim' ? (
          <FerramentasChamadas
            ferramentas={ferramentas}
            leituraFalhou={leituraFalhou}
            vazia={copy.ferramentas.nenhumaNoFim}
          />
        ) : null}

        {ocupado ? (
          <p role="status" className="m-0 flex items-center gap-2.5 text-[13px] text-texto-apoio">
            <span aria-hidden="true" className="giro size-4! border-2!" />
            {ocupado}
          </p>
        ) : null}
      </div>
    </AreaDeTrabalho>
  )
}

function Preparo({
  proposito,
  modo,
  perfil,
  ocupado,
  aoTrocarProposito,
  aoTrocarModo,
  aoTrocarPerfil,
  aoComecar,
}: {
  proposito: Proposito
  modo: ModoDoEnsaio
  perfil: IdDoPerfil
  ocupado: string | null
  aoTrocarProposito: (valor: Proposito) => void
  aoTrocarModo: (valor: ModoDoEnsaio) => void
  aoTrocarPerfil: (valor: IdDoPerfil) => void
  aoComecar: () => void
}) {
  const copy = useTextosDoEnsaio()
  return (
    <Painel titulo={copy.preparo.titulo} apoio={copy.preparo.apoio}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-[200px] flex-col gap-1.5">
            <label htmlFor="ensaio-proposito" className="text-[13px] font-semibold">
              {copy.preparo.proposito}
            </label>
            <select
              id="ensaio-proposito"
              className="campo"
              value={proposito}
              disabled={ocupado !== null}
              onChange={(evento) => aoTrocarProposito(evento.target.value as Proposito)}
            >
              {PROPOSITOS_DO_ENSAIO.map((item) => (
                <option key={item} value={item}>
                  {PROPOSITO_EM_PORTUGUES[item] ?? item}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-[200px] flex-col gap-1.5">
            <label htmlFor="ensaio-modo" className="text-[13px] font-semibold">
              {copy.preparo.modo}
            </label>
            <select
              id="ensaio-modo"
              className="campo"
              value={modo}
              disabled={ocupado !== null}
              onChange={(evento) => aoTrocarModo(evento.target.value as ModoDoEnsaio)}
            >
              <option value="text">{copy.modos.text}</option>
              <option value="voice">{copy.modos.voice}</option>
            </select>
            <p className="m-0 text-[12.5px] text-texto-apoio">{copy.explicacaoDoModo[modo]}</p>
          </div>
        </div>

        {/* As opções saem do catálogo: perfil novo aparece aqui sem código novo. */}
        {/* Cada perfil é um cartão de escolha do design system, com o botão de
            opção dentro: o escolhido acende pelo `:checked`, sem estado a mais. */}
        <fieldset className="m-0 grid gap-2 border-0 p-0 md:grid-cols-2">
          <legend className="mb-1.5 p-0 text-[13px] font-semibold">{copy.preparo.perfil}</legend>
          {PERFIS_DE_LEAD.map((item) => (
            <label
              key={item.id}
              className="cartao-de-escolha items-start text-[13.5px] has-checked:border-acento/60 has-checked:bg-acento-repouso has-checked:shadow-[0_0_0_3px_var(--acento-repouso)] has-disabled:cursor-not-allowed has-disabled:opacity-60"
            >
              <input
                type="radio"
                name="ensaio-perfil"
                value={item.id}
                checked={perfil === item.id}
                disabled={ocupado !== null}
                onChange={() => aoTrocarPerfil(item.id)}
                className="mt-1"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-bold text-texto-principal">{copy.perfis[item.id].rotulo}</span>
                <span className="text-[12.5px] text-texto-apoio">{copy.perfis[item.id].papel}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p role="note" className="bloco-secundario m-0 text-[13px] text-texto-apoio">
          {copy.credito[modo]}
        </p>

        <div>
          <button
            type="button"
            className="botao-primario"
            disabled={ocupado !== null}
            onClick={aoComecar}
          >
            {copy.preparo.comecar}
          </button>
        </div>
      </div>
    </Painel>
  )
}

function Conversa({
  estado,
  voz,
  ocupado,
  aoDizer,
  aoEncerrar,
}: {
  estado: EmCurso
  voz: EstadoDaVoz | null
  ocupado: string | null
  aoDizer: (texto: string) => void
  aoEncerrar: () => void
}) {
  const copy = useTextosDoEnsaio()
  const [rascunho, setRascunho] = useState('')

  return (
    <Painel
      titulo={copy.conversa.titulo}
      estado={
        // No modo voz, o selo diz se o microfone está aberto: numa conversa
        // falada não há outro jeito de saber.
        estado.modo === 'voice' && voz ? (
          <Selo tom={TOM_DO_ESTADO[voz] ?? 'neutro'}>{copy.voz.estados[voz]}</Selo>
        ) : (
          <Selo tom={TOM_DO_ESTADO[estado.estado] ?? 'neutro'}>
            {copy.conversa.estados[estado.estado] ?? estado.estado}
          </Selo>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <PalcoDoSinal estado={estado.modo === 'voice' && voz ? voz : estado.estado} />

        {/* A transcrição chega fala a fala: `log` anuncia cada uma sem roubar o foco. */}
        <div
          role="log"
          aria-label={estado.modo === 'voice' ? copy.voz.transcricao : copy.conversa.titulo}
          className="flex max-h-96 flex-col gap-2.5 overflow-y-auto pr-1"
        >
          {estado.turnos.length === 0 ? (
            <p className="m-0 text-[13px] text-texto-apoio">
              {estado.modo === 'text' ? copy.conversa.aindaSemFalaTexto : copy.conversa.aindaSemFala}
            </p>
          ) : (
            // Um balão por fala: a Sarah à esquerda, em menta, e quem ensaia à
            // direita. O ": " continua no texto, escondido da vista, para a
            // fala se ler inteira ("Sarah: ...") fora do balão.
            estado.turnos.map((turno, indice) => (
              <p
                key={indice}
                className={`m-0 max-w-[85%] rounded-cartao border px-3.5 py-2.5 text-[13.5px] leading-relaxed text-texto-secundario ${
                  turno.quem === 'agent'
                    ? 'self-start rounded-tl-pequeno border-positivo-borda bg-positivo-fundo'
                    : 'self-end rounded-tr-pequeno border-borda-suave bg-superficie-2'
                }`}
              >
                <strong
                  className={`mb-0.5 block text-[12px] font-bold ${
                    turno.quem === 'agent' ? 'text-menta-2' : 'text-texto-principal'
                  }`}
                >
                  {copy.conversa.quem[turno.quem]}
                  <span className="sr-only">{': '}</span>
                </strong>
                {turno.texto}
              </p>
            ))
          )}
        </div>

        {estado.modo === 'text' ? (
          <div className="flex flex-col gap-2">
            <CampoDeTextoLongo
              rotulo={copy.conversa.campo}
              rows={2}
              value={rascunho}
              onChange={(evento) => setRascunho(evento.target.value)}
            />
            <div>
              <button
                type="button"
                className="botao-menta"
                disabled={rascunho.trim() === '' || ocupado !== null}
                onClick={() => {
                  aoDizer(rascunho.trim())
                  setRascunho('')
                }}
              >
                {copy.conversa.enviar}
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <button
            type="button"
            className="botao-perigo"
            disabled={ocupado !== null}
            onClick={aoEncerrar}
          >
            {copy.conversa.encerrar}
          </button>
        </div>
      </div>
    </Painel>
  )
}

/** Microfone negado ou ausente: explicação e saída, nunca erro cru. */
function SemMicrofone({
  situacao,
  ocupado,
  aoTentarDeNovo,
  aoIrPorTexto,
}: {
  situacao: 'sem_permissao' | 'sem_microfone'
  ocupado: string | null
  aoTentarDeNovo: () => void
  aoIrPorTexto: () => void
}) {
  const copy = useTextosDoEnsaio()
  const texto = situacao === 'sem_permissao' ? copy.voz.semPermissao : copy.voz.semMicrofone
  return (
    <CaixaDeErro tom="atencao">
      <p className="m-0 font-semibold">{texto.titulo}</p>
      <p className="mt-1 mb-0">{texto.explicacao}</p>
      <p className="mt-1 mb-0">{texto.caminho}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          className="botao-primario"
          disabled={ocupado !== null}
          onClick={aoTentarDeNovo}
        >
          {copy.voz.tentarDeNovo}
        </button>
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado !== null}
          onClick={aoIrPorTexto}
        >
          {copy.voz.porTexto}
        </button>
      </div>
    </CaixaDeErro>
  )
}

/** O painel das ferramentas, na conversa e no fim. A lista já chega ordenada. */
function FerramentasChamadas({
  ferramentas,
  leituraFalhou,
  vazia,
}: {
  ferramentas: readonly FerramentaDoEnsaio[]
  leituraFalhou: boolean
  vazia: string
}) {
  const copy = useTextosDoEnsaio()
  return (
    <Painel
      rotulo={copy.ferramentas.titulo}
      titulo={copy.ferramentas.titulo}
      apoio={copy.ferramentas.apoio}
    >
      <div className="flex flex-col gap-3">
        {leituraFalhou ? (
          <p className="m-0 text-[13px] text-texto-apoio">{copy.ferramentas.semLeitura}</p>
        ) : null}
        {ferramentas.length === 0 ? (
          <p className="m-0 text-[13.5px] text-texto-apoio">{vazia}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {ferramentas.map((usada) => (
              <li
                key={`${usada.ferramenta}-${usada.em}`}
                className="revelar flex items-center gap-3 rounded-controle border border-borda-suave bg-superficie-funda px-3 py-2"
              >
                <span className="val text-[12.5px] text-texto-apoio">{formatarHora(usada.em)}</span>
                <span className="text-[13.5px]">{nomeDaFerramenta(usada.ferramenta)}</span>
                {usada.erro ? <Selo tom="perigo">{copy.ferramentas.falhou}</Selo> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Painel>
  )
}

/**
 * O tom do selo da conversa: ouvindo é menta, falando é informação (o "IA
 * falando" do design system). O resto, esperando ou fechado, é neutro.
 */
const TOM_DO_ESTADO: Readonly<Partial<Record<EstadoDaConversa | EstadoDaVoz, TomDoSelo>>> = {
  ouvindo: 'positivo',
  falando: 'informacao',
}

/**
 * O sinal da IA (motion system, seção 07) para cada estado da conversa ou do
 * microfone. Conectar e pedir o microfone discam, ouvir varre, falar pulsa com
 * a onda de voz, encerrar processa. Decorativo: o estado vai escrito no selo.
 */
const SINAL_DO_ESTADO: Readonly<Partial<Record<EstadoDaConversa | EstadoDaVoz, string>>> = {
  conectando: 'sinal-discando',
  pedindo_permissao: 'sinal-discando',
  ouvindo: 'sinal-ouvindo',
  falando: 'sinal-falando',
  encerrando: 'sinal-processando',
}

function PalcoDoSinal({ estado }: { estado: EstadoDaConversa | EstadoDaVoz }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-28 items-center justify-center gap-5 rounded-cartao border border-borda-suave bg-superficie-funda bg-[radial-gradient(circle_at_center,var(--positivo-fundo),transparent_60%)]"
    >
      <span className={`sinal h-14 w-14 ${SINAL_DO_ESTADO[estado] ?? ''}`} />
      {estado === 'falando' ? (
        <span className="onda-de-voz">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </div>
  )
}

interface EmCurso {
  nome: 'conversa'
  ensaioId: string
  chamadaId: string
  turnos: TurnoAoVivo[]
  estado: EstadoDaConversa
  modo: ModoDoEnsaio
}

type Passo =
  | { nome: 'preparo' }
  | EmCurso
  | { nome: 'fim'; chamadaId: string; turnos: number }

/** O texto do ensaio com o nome que a conta deu à assistente. */
function useTextosDoEnsaio(): ReturnType<typeof textosDoEnsaio> {
  return textosDoEnsaio(useNomeDaAssistente())
}
