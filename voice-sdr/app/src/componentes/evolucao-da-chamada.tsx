import { useState } from 'react'

import type { MudancaNaTela, PerguntaNaTela } from '@revisao/revisao.ts'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import type { ResultadoDoPasso, ServicoDeChamadas } from '@/chamadas/tipos'
import { evolucao as copy } from '@/copy/revisao'

/**
 * O ciclo de evolução dentro da ficha da chamada (US-245).
 *
 * Quatro decisões explicam o desenho:
 *
 * 1. **Um passo por vez, e o passo aparece inteiro.** O questionário não
 *    divide em telas e as propostas não escondem o texto atrás de um resumo
 *    obrigatório: quem aprova precisa poder ler o que está aprovando antes de
 *    clicar. O texto longo começa recolhido, mas abre no lugar.
 * 2. **O que a Sarah aplica e o que você faz têm selos diferentes.** Aceitar
 *    uma proposta de voz não troca a voz — manda você para a tela de voz. Sem
 *    a distinção visível, o "aplicar" prometeria o que não cumpre.
 * 3. **A recusa chega pronta da borda.** `call-review/respostas.ts` escreve as
 *    frases; aqui elas só aparecem. Uma segunda tradução divergiria da
 *    primeira na primeira mudança.
 * 4. **O estado mora aqui, não na URL.** A revisão é um trabalho de uma
 *    sentada dentro da ficha, e recarregar a página recomeça o convite — a
 *    revisão aberta continua no banco, e o próximo `analisar` recebe
 *    `ja_existe_revisao` com a frase que diz o que fazer.
 */
export function EvolucaoDaChamada({
  chamadaId,
  servico,
}: {
  chamadaId: string
  servico: ServicoDeChamadas
}) {
  const [passo, setPasso] = useState<Passo>({ nome: 'convite' })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<{ mensagem: string; caminho?: string } | null>(null)

  /** Roda um passo, guardando o que ele devolveu ou a frase da recusa. */
  async function correr(aviso: string, executar: () => Promise<Resultado>) {
    setOcupado(aviso)
    setErro(null)
    const resultado = await executar()
    setOcupado(null)
    if (!resultado.ok) {
      // O caminho vem junto quando a recusa tem conserto numa tela. Guardar os
      // dois é o que deixa a caixa oferecer o botão em vez de só lamentar.
      setErro({ mensagem: resultado.mensagem, ...(resultado.caminho ? { caminho: resultado.caminho } : {}) })
      return null
    }
    return resultado.corpo
  }

  async function analisar() {
    const corpo = await correr(copy.analisando, () => servico.analisarChamada(chamadaId))
    // Sem nada a perguntar, a borda já devolve as propostas, ou diz que não há
    // o que mudar: o questionário só aparece quando há pergunta de verdade.
    if (corpo?.passo === 'propostas') {
      setPasso({
        nome: 'propostas',
        revisaoId: corpo.revisaoId,
        mudancas: corpo.mudancas,
        decisoes: {},
        questionando: null,
      })
    }
    if (corpo?.passo === 'sem_mudancas') setPasso({ nome: 'sem_mudancas' })
    if (corpo?.passo === 'questionario') {
      setPasso({
        nome: 'questionario',
        revisaoId: corpo.revisaoId,
        perguntas: corpo.perguntas,
        respostas: Object.fromEntries(corpo.perguntas.map((pergunta) => [pergunta.id, ''])),
      })
    }
  }

  async function responder(estado: Extract<Passo, { nome: 'questionario' }>) {
    const corpo = await correr(copy.questionario.enviando, () =>
      servico.responderRevisao(
        estado.revisaoId,
        estado.perguntas.map((pergunta) => ({
          id: pergunta.id,
          resposta: estado.respostas[pergunta.id] ?? '',
        })),
      ),
    )
    if (corpo?.passo === 'propostas') {
      setPasso({
        nome: 'propostas',
        revisaoId: estado.revisaoId,
        mudancas: corpo.mudancas,
        decisoes: {},
        questionando: null,
      })
    }
    if (corpo?.passo === 'sem_mudancas') setPasso({ nome: 'sem_mudancas' })
  }

  async function questionar(
    estado: Extract<Passo, { nome: 'propostas' }>,
    mudancaId: string,
    texto: string,
  ) {
    const corpo = await correr(copy.propostas.questionando, () =>
      servico.questionarProposta(estado.revisaoId, mudancaId, texto),
    )
    if (corpo?.passo === 'reescrita') {
      const reescrita = corpo.mudanca
      setPasso({
        ...estado,
        mudancas: estado.mudancas.map((mudanca) =>
          mudanca.id === reescrita.id ? reescrita : mudanca,
        ),
        questionando: null,
      })
    }
  }

  async function aplicar(estado: Extract<Passo, { nome: 'propostas' }>) {
    const corpo = await correr(copy.propostas.aplicando, () =>
      servico.aplicarRevisao(
        estado.revisaoId,
        estado.mudancas.map((mudanca) => ({
          id: mudanca.id,
          aceita: estado.decisoes[mudanca.id] === true,
        })),
      ),
    )
    if (corpo?.passo === 'aplicada') {
      setPasso({
        nome: 'aplicada',
        versao: corpo.versao,
        encaminhamentos: corpo.encaminhamentos,
      })
    }
  }

  async function descartar(revisaoId: string) {
    const corpo = await correr(copy.propostas.aplicando, () => servico.descartarRevisao(revisaoId))
    if (corpo?.passo === 'descartada') setPasso({ nome: 'descartada' })
  }

  return (
    <Painel titulo={copy.titulo} apoio={copy.apoio}>
      <div className="flex flex-col gap-4">
        {erro ? (
          <CaixaDeErro tom={erro.caminho ? 'atencao' : 'perigo'}>
            <p className="m-0">{erro.mensagem}</p>
            {/* Âmbar e com saída quando há o que fazer; vermelho quando é
                falha de verdade. Credencial que falta não é defeito: é um
                passo que ninguém deu ainda. */}
            {erro.caminho ? (
              <p className="mt-2 mb-0">
                <a href={erro.caminho} className="botao-primario no-underline">
                  {copy.resolver}
                </a>
              </p>
            ) : null}
          </CaixaDeErro>
        ) : null}

        {passo.nome === 'convite' ? (
          <div>
            <button
              type="button"
              className="botao-primario"
              disabled={ocupado !== null}
              onClick={() => void analisar()}
            >
              {copy.comecar}
            </button>
          </div>
        ) : null}

        {passo.nome === 'questionario' ? (
          <Questionario
            estado={passo}
            ocupado={ocupado}
            aoResponder={(id, texto) =>
              setPasso({ ...passo, respostas: { ...passo.respostas, [id]: texto } })
            }
            aoEnviar={() => void responder(passo)}
          />
        ) : null}

        {passo.nome === 'propostas' ? (
          <Propostas
            estado={passo}
            ocupado={ocupado}
            aoDecidir={(id, aceita) =>
              setPasso({ ...passo, decisoes: { ...passo.decisoes, [id]: aceita } })
            }
            aoAbrirQuestionamento={(id) => setPasso({ ...passo, questionando: id })}
            aoQuestionar={(id, texto) => void questionar(passo, id, texto)}
            aoAplicar={() => void aplicar(passo)}
            aoDescartar={() => void descartar(passo.revisaoId)}
          />
        ) : null}

        {passo.nome === 'aplicada' ? (
          <Aplicada estado={passo} aoRecomecar={() => setPasso({ nome: 'convite' })} />
        ) : null}

        {passo.nome === 'sem_mudancas' ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="m-0 text-[14px] font-bold">{copy.semMudancas.titulo}</h3>
              <p className="mt-1 mb-0 text-[13.5px] text-texto-apoio">
                {copy.semMudancas.explicacao}
              </p>
            </div>
          </div>
        ) : null}

        {passo.nome === 'descartada' ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="m-0 text-[14px] font-bold">{copy.descartada.titulo}</h3>
              <p className="mt-1 mb-0 text-[13.5px] text-texto-apoio">
                {copy.descartada.explicacao}
              </p>
            </div>
            <div>
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setPasso({ nome: 'convite' })}
              >
                {copy.aplicada.outraRevisao}
              </button>
            </div>
          </div>
        ) : null}

        {/* A IA está lendo a conversa ou reescrevendo: o sinal processa e os
            pontos pensam, e a frase diz o quê. */}
        {ocupado ? (
          <p
            role="status"
            className="bloco-secundario m-0 flex items-center gap-3 px-4 py-3 text-[13px] text-texto-secundario"
          >
            <span aria-hidden="true" className="sinal sinal-processando h-6 w-6" />
            {ocupado}
            <span aria-hidden="true" className="pontos-pensando ml-auto">
              <i />
              <i />
              <i />
            </span>
          </p>
        ) : null}
      </div>
    </Painel>
  )
}

// O questionário ---------------------------------------------------------------------

function Questionario({
  estado,
  ocupado,
  aoResponder,
  aoEnviar,
}: {
  estado: Extract<Passo, { nome: 'questionario' }>
  ocupado: string | null
  aoResponder: (id: string, texto: string) => void
  aoEnviar: () => void
}) {
  // Todas, e não algumas: a borda recusa questionário incompleto, e um botão
  // que só falha depois de clicado esconde a regra de quem está respondendo.
  const completo = estado.perguntas.every(
    (pergunta) => (estado.respostas[pergunta.id] ?? '').trim() !== '',
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="m-0 text-[14px] font-bold">{copy.questionario.titulo}</h3>
        <p className="mt-1 mb-0 text-[13.5px] text-texto-apoio">{copy.questionario.apoio}</p>
      </div>

      {estado.perguntas.map((pergunta) => (
        <Pergunta
          key={pergunta.id}
          pergunta={pergunta}
          resposta={estado.respostas[pergunta.id] ?? ''}
          aoResponder={(texto) => aoResponder(pergunta.id, texto)}
        />
      ))}

      <div>
        <button
          type="button"
          className="botao-primario"
          disabled={!completo || ocupado !== null}
          onClick={aoEnviar}
        >
          {copy.questionario.enviar}
        </button>
      </div>
    </div>
  )
}

function Pergunta({
  pergunta,
  resposta,
  aoResponder,
}: {
  pergunta: PerguntaNaTela
  resposta: string
  aoResponder: (texto: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-menta/40 pl-4">
      <p className="m-0 text-[13.5px] font-semibold text-texto-principal">{pergunta.pergunta}</p>
      <p className="m-0 text-[12.5px] text-texto-apoio">
        <span className="sobretitulo">{copy.questionario.porque}</span> {pergunta.porque}
      </p>

      {pergunta.tipo === 'choice' ? (
        <div className="flex flex-wrap gap-2">
          {pergunta.opcoes.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={resposta === opcao}
              // A opção escolhida é o selo de acento; as outras, o neutro.
              className={`selo cursor-pointer px-3 py-1.5 text-[12.5px] ${
                resposta === opcao
                  ? 'selo-acento'
                  : 'selo-neutro hover:border-borda-controle hover:text-texto-principal'
              }`}
              onClick={() => aoResponder(opcao)}
            >
              {opcao}
            </button>
          ))}
        </div>
      ) : null}

      <CampoDeTextoLongo
        rotulo={pergunta.tipo === 'choice' ? copy.questionario.outraResposta : 'Sua resposta'}
        rows={pergunta.tipo === 'choice' ? 2 : 3}
        value={resposta}
        onChange={(evento) => aoResponder(evento.target.value)}
      />
    </div>
  )
}

// As propostas -----------------------------------------------------------------------

function Propostas({
  estado,
  ocupado,
  aoDecidir,
  aoAbrirQuestionamento,
  aoQuestionar,
  aoAplicar,
  aoDescartar,
}: {
  estado: Extract<Passo, { nome: 'propostas' }>
  ocupado: string | null
  aoDecidir: (id: string, aceita: boolean) => void
  aoAbrirQuestionamento: (id: string | null) => void
  aoQuestionar: (id: string, texto: string) => void
  aoAplicar: () => void
  aoDescartar: () => void
}) {
  const algumaAceita = estado.mudancas.some((mudanca) => estado.decisoes[mudanca.id] === true)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="m-0 text-[14px] font-bold">{copy.propostas.titulo}</h3>
        <p className="mt-1 mb-0 text-[13.5px] text-texto-apoio">{copy.propostas.apoio}</p>
      </div>

      {estado.mudancas.map((mudanca) => (
        <Proposta
          key={mudanca.id}
          mudanca={mudanca}
          decisao={estado.decisoes[mudanca.id]}
          questionando={estado.questionando === mudanca.id}
          ocupado={ocupado}
          aoDecidir={(aceita) => aoDecidir(mudanca.id, aceita)}
          aoAbrirQuestionamento={() => aoAbrirQuestionamento(mudanca.id)}
          aoFecharQuestionamento={() => aoAbrirQuestionamento(null)}
          aoQuestionar={(texto) => aoQuestionar(mudanca.id, texto)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="botao-primario"
          disabled={!algumaAceita || ocupado !== null}
          onClick={aoAplicar}
        >
          {copy.propostas.aplicar}
        </button>
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado !== null}
          onClick={aoDescartar}
        >
          {copy.propostas.descartar}
        </button>
        {!algumaAceita ? (
          <span className="text-[12.5px] text-texto-apoio">{copy.propostas.nadaAceito}</span>
        ) : null}
      </div>
    </div>
  )
}

function Proposta({
  mudanca,
  decisao,
  questionando,
  ocupado,
  aoDecidir,
  aoAbrirQuestionamento,
  aoFecharQuestionamento,
  aoQuestionar,
}: {
  mudanca: MudancaNaTela
  decisao: boolean | undefined
  questionando: boolean
  ocupado: string | null
  aoDecidir: (aceita: boolean) => void
  aoAbrirQuestionamento: () => void
  aoFecharQuestionamento: () => void
  aoQuestionar: (texto: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')

  return (
    <article className="rounded-cartao border border-borda-suave bg-superficie-funda px-4 py-3.5">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="sobretitulo m-0 mb-0.5" title={copy.explicacaoDoTipo[mudanca.tipo]}>
            {copy.tipos[mudanca.tipo]}
          </p>
          <h4 className="m-0 text-[13.5px] font-bold text-texto-principal">{mudanca.titulo}</h4>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mudanca.revisoes > 0 ? (
            <span className="text-[11.5px] text-texto-desativado">
              {copy.propostas.reescrita(mudanca.revisoes)}
            </span>
          ) : null}
          {/* Aceitar uma proposta de voz não troca a voz: manda você para a
              tela de voz. Sem o selo, o "aplicar" prometeria o que não cumpre. */}
          <Selo tom={mudanca.seAplicaSozinha ? 'acento' : 'atencao'}>
            {mudanca.seAplicaSozinha ? copy.encaminhamento.aplicavel : copy.encaminhamento.selo}
          </Selo>
        </div>
      </header>

      <p className="m-0 mb-2 text-[13px] text-texto-secundario">
        <span className="sobretitulo">{copy.propostas.razao}</span> {mudanca.razao}
      </p>

      {mudanca.corpo !== null ? (
        <div className="mb-2">
          <button
            type="button"
            className="botao-link text-[12.5px]"
            aria-expanded={aberto}
            onClick={() => setAberto(!aberto)}
          >
            {aberto ? copy.propostas.esconderTexto : copy.propostas.verTexto}
          </button>
          {aberto ? (
            <pre className="val mt-2 mb-0 max-h-80 overflow-auto rounded-controle border border-borda-suave bg-superficie-2 px-3 py-2.5 text-[12.5px] whitespace-pre-wrap text-texto-secundario">
              {mudanca.corpo}
            </pre>
          ) : null}
        </div>
      ) : null}

      {mudanca.caminho !== null ? (
        <p className="m-0 mb-2 text-[13px]">
          <span className="sobretitulo">{copy.encaminhamento.ondeMexer}</span>{' '}
          {mudanca.acaoNoCaminho}{' '}
          {mudanca.caminhoDisponivel ? (
            <a href={mudanca.caminho} className="val font-semibold text-menta-2 hover:underline">
              {mudanca.caminho}
            </a>
          ) : (
            // A tela ainda não existe (US-085): o endereço aparece como texto,
            // e não como link que morre.
            <span className="text-texto-apoio">
              {copy.encaminhamento.caminhoIndisponivel}{' '}
              <span className="val">{mudanca.caminho}</span>
            </span>
          )}
        </p>
      ) : null}

      {questionando ? (
        <div className="mt-3 flex flex-col gap-2">
          <CampoDeTextoLongo
            rotulo={copy.propostas.questionamento}
            apoio={copy.propostas.questionamentoApoio}
            rows={3}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="botao-primario"
              disabled={texto.trim().length < 10 || ocupado !== null}
              onClick={() => aoQuestionar(texto)}
            >
              {copy.propostas.enviarQuestionamento}
            </button>
            <button type="button" className="botao-secundario" onClick={aoFecharQuestionamento}>
              {copy.propostas.cancelarQuestionamento}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={decisao === true}
            className={decisao === true ? 'botao-menta' : 'botao-secundario'}
            onClick={() => aoDecidir(true)}
          >
            {decisao === true ? copy.propostas.aceita : copy.propostas.aceitar}
          </button>
          <button
            type="button"
            aria-pressed={decisao === false}
            className={decisao === false ? 'botao-perigo' : 'botao-secundario'}
            onClick={() => aoDecidir(false)}
          >
            {decisao === false ? copy.propostas.recusada : copy.propostas.recusar}
          </button>
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado !== null}
            onClick={aoAbrirQuestionamento}
          >
            {copy.propostas.questionar}
          </button>
        </div>
      )}
    </article>
  )
}

// O fim ------------------------------------------------------------------------------

function Aplicada({
  estado,
  aoRecomecar,
}: {
  estado: Extract<Passo, { nome: 'aplicada' }>
  aoRecomecar: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="m-0 text-[14px] font-bold">{copy.aplicada.titulo}</h3>
        <p className="mt-1 mb-0 text-[13.5px] text-texto-apoio">
          {estado.versao === null
            ? copy.aplicada.semVersao
            : copy.aplicada.comVersao(estado.versao)}
        </p>
      </div>

      {estado.encaminhamentos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="sobretitulo m-0">{copy.aplicada.encaminhamentos}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {estado.encaminhamentos.map((mudanca) => (
              <li key={mudanca.id} className="text-[13px]">
                <strong className="font-semibold">{mudanca.titulo}</strong>
                {'. '}
                {mudanca.acaoNoCaminho}{' '}
                {mudanca.caminhoDisponivel ? (
                  <a
                    href={mudanca.caminho ?? '/'}
                    className="val font-semibold text-menta-2 hover:underline"
                  >
                    {mudanca.caminho}
                  </a>
                ) : (
                  <span className="text-texto-apoio">
                    {copy.encaminhamento.caminhoIndisponivel}{' '}
                    <span className="val">{mudanca.caminho}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {estado.versao !== null ? (
          <a href="/sarah/playbooks" className="botao-primario no-underline">
            {copy.aplicada.irParaPlaybooks}
          </a>
        ) : null}
        <button type="button" className="botao-secundario" onClick={aoRecomecar}>
          {copy.aplicada.outraRevisao}
        </button>
      </div>
    </div>
  )
}

// O estado ---------------------------------------------------------------------------

/**
 * O que um passo devolve. Vem do serviço, e não de uma redeclaração aqui: o
 * campo `caminho` da recusa nasceu na borda e precisa chegar inteiro até a
 * caixa que oferece o botão.
 */
type Resultado = ResultadoDoPasso

type Passo =
  | { nome: 'convite' }
  | {
      nome: 'questionario'
      revisaoId: string
      perguntas: readonly PerguntaNaTela[]
      respostas: Record<string, string>
    }
  | {
      nome: 'propostas'
      revisaoId: string
      mudancas: readonly MudancaNaTela[]
      decisoes: Record<string, boolean>
      /** A proposta cujo campo de questionamento está aberto, ou nula. */
      questionando: string | null
    }
  | { nome: 'aplicada'; versao: number | null; encaminhamentos: readonly MudancaNaTela[] }
  | { nome: 'descartada' }
  | { nome: 'sem_mudancas' }
