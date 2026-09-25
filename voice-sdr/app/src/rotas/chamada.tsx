import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'

import { linhasDaAvaliacao } from '@/chamadas/avaliacao'
import { classificacaoCorrigida, fraseDaFonte, rotuloDaEtapa } from '@/chamadas/classificacao'
import { useServicoDeChamadas } from '@/chamadas/contexto'
import {
  componentesSemPreco,
  custoPorComponente,
  estadoDaClassificacao,
  estadoDaGravacao,
  faixaDoSentimento,
  formatarDecimal,
  formatarSegundos,
  formatarValor,
  instanteNaConversa,
  leituraDoAviso,
  textoDaClassificacao,
  totalDoCusto,
  turnosDaFicha,
  type Valor,
} from '@/chamadas/ficha'
import type { FichaDaChamada, ServicoDeChamadas } from '@/chamadas/tipos'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { DiagnosticoDaChamada } from '@/componentes/diagnostico-da-chamada'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Seletor } from '@/componentes/seletor'
import { EvolucaoDaChamada } from '@/componentes/evolucao-da-chamada'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { ReprodutorDeGravacao } from '@/componentes/reprodutor-de-gravacao'
import { Selo } from '@/componentes/selo'
import {
  avaliacao as copyDaAvaliacao,
  correcao as copyDaCorrecao,
  ferramentas as copyDasFerramentas,
} from '@/copy/chamada'
import { ficha as copy, MOTIVO_DO_FIM } from '@/copy/chamadas'
import { motivoDaFalha } from '@/copy/ferramentas'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeCorrigirClassificacao, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { formatarData, formatarInstante } from '@/utilidades/datas'

// A mesma chave de `/config/equipe`: o papel de quem olha é o mesmo recurso.
const CHAVE_DA_EQUIPE = ['equipe'] as const

type Acesso =
  | { tipo: 'desconhecido' }
  | { tipo: 'corrige' }
  | { tipo: 'leitura'; administradores: readonly Membro[] }

/** Lê um rótulo de uma tabela de copy pela chave do dado, sem a cadeia de protótipos. */
function rotulo(tabela: Readonly<Record<string, string>>, chave: string | null): string | null {
  if (chave === null || !Object.hasOwn(tabela, chave)) return null
  return tabela[chave] ?? null
}

function valores(lista: readonly Valor[]): string {
  return lista.map(formatarValor).join(' + ')
}

/**
 * `/chamadas/:id`: a ficha da chamada (RF-414).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **A ficha não espera a classificação** (P-03). Duração, custo e
 *    transcrição aparecem assim que a chamada é finalizada, com o aviso de que
 *    a classificação está sendo feita. É o que cabe nos 60 s do critério da F2.
 * 2. **O áudio é pedido no toque, não no carregamento.** A URL de `call-audio`
 *    vale cinco minutos; pedida ao abrir a ficha, venceria antes do play de
 *    quem lê a transcrição primeiro.
 * 3. **Ausência se escreve, nunca vira valor.** Preço que não chegou é
 *    "aguardando preço", aviso de gravação sem instante é "não localizado na
 *    transcrição", gravação expurgada é a data do expurgo — e não zero, não
 *    "dado", não um reprodutor quebrado.
 * 4. **A correção desenha o que o banco gravou** (US-148, RF-415). Depois de
 *    `corrigir_classificacao` a ficha é relida, e autor e hora vêm da linha:
 *    a trava da US-129 é que impede a retaguarda de desfazer a correção, e a
 *    tela só mostra o resultado dela.
 */
export function TelaDaChamada() {
  const { id } = useParams({ from: '/aplicacao/chamadas/$id' })
  const servico = useServicoDeChamadas()
  const equipe = useServicoDeEquipe()

  const consulta = useQuery({
    queryKey: ['chamada', id],
    queryFn: () => servico.carregarFicha(id),
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

  if (carga?.ok === false && carga.motivo === 'nao-encontrada') {
    return (
      <Moldura>
        <EstadoVazio
          titulo={copy.naoEncontrada.titulo}
          explicacao={copy.naoEncontrada.explicacao}
          acao={{ rotulo: copy.naoEncontrada.acao, endereco: '/' }}
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
  const acesso: Acesso =
    cargaDaEquipe?.ok !== true
      ? { tipo: 'desconhecido' }
      : podeCorrigirClassificacao(cargaDaEquipe.equipe.papelDoUsuario)
        ? { tipo: 'corrige' }
        : { tipo: 'leitura', administradores: quemConcedeAcesso(cargaDaEquipe.equipe.membros) }

  return (
    <Ficha
      ficha={carga.ficha}
      servico={servico}
      acesso={acesso}
      aoCorrigir={() => consulta.refetch()}
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
        <Link to="/" className="botao-secundario no-underline">
          {copy.voltar}
        </Link>
      }
    >
      {children}
    </AreaDeTrabalho>
  )
}

function Ficha({
  ficha,
  servico,
  acesso,
  aoCorrigir,
}: {
  ficha: FichaDaChamada
  servico: ServicoDeChamadas
  acesso: Acesso
  aoCorrigir: () => Promise<unknown>
}) {
  // O relógio entra uma vez, na abertura da ficha: é contra ele que se decide
  // se a gravação já passou do prazo.
  const [agora] = useState(() => new Date().toISOString())

  const proposito = rotulo(PROPOSITO_EM_PORTUGUES, ficha.proposito) ?? ficha.proposito
  const quem = ficha.leadNome ?? ficha.numeroDeDestino ?? copy.semLead
  const direcao = rotulo(copy.direcao, ficha.direcao) ?? ''
  const classificacao = estadoDaClassificacao(ficha)

  return (
    <Moldura
      titulo={copy.cabecalho(proposito, quem)}
      lead={`${direcao} · ${formatarInstante(ficha.iniciadaEm)}`}
    >
      <div className="flex flex-col gap-5">
        {classificacao === 'processando' ? (
          <p
            role="status"
            className="bloco-secundario m-0 flex items-center gap-3 px-4 py-3 text-[13.5px]"
          >
            <span aria-hidden="true" className="sinal sinal-processando h-6 w-6" />
            {copy.classificacao.processando}
          </p>
        ) : null}

        <Resumo ficha={ficha} emAndamento={classificacao === 'em_andamento'} />
        <Custo ficha={ficha} />
        <Gravacao ficha={ficha} agora={agora} servico={servico} />
        <Transcricao ficha={ficha} emAndamento={classificacao === 'em_andamento'} />
        <Ferramentas ficha={ficha} />
        <Classificacao ficha={ficha} servico={servico} acesso={acesso} aoCorrigir={aoCorrigir} />
        <Avaliacao ficha={ficha} />

        {/* O diagnóstico lê os registros da ligação na ElevenLabs da conta e
            aparece também com a chamada viva aqui: a que ficou presa em
            andamento porque o aviso de fim não chegou é justamente a que mais
            precisa dele. */}
        <DiagnosticoDaChamada chamadaId={ficha.id} />

        {/* O ciclo de evolução (US-245) fecha a ficha: lê-se a conversa, vê-se
            o que ela deu, e então se melhora o roteiro. Ligação em andamento
            não aparece — a borda recusaria com `chamada_em_andamento`, e um
            botão que só falha depois do clique esconde a regra. */}
        {classificacao === 'em_andamento' ? null : (
          <EvolucaoDaChamada chamadaId={ficha.id} servico={servico} />
        )}
      </div>
    </Moldura>
  )
}

/**
 * Um par rótulo e valor da ficha. Com `bloco`, o par vira um ladrilho afundado,
 * como as parcelas do custo, que se leem lado a lado.
 */
function Campo({
  titulo,
  bloco = false,
  children,
}: {
  titulo: string
  bloco?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        bloco ? 'rounded-controle border border-borda-suave bg-superficie-funda px-3 py-2.5' : ''
      }`}
    >
      <dt className="rotulo-de-indicador">{titulo}</dt>
      <dd className="m-0 font-semibold text-texto-principal">{children}</dd>
    </div>
  )
}

function Resumo({ ficha, emAndamento }: { ficha: FichaDaChamada; emAndamento: boolean }) {
  const resultado = rotulo(MOTIVO_DO_FIM, ficha.motivoDoFim)
  const atendente = rotulo(copy.atendentes, ficha.atendidaPor)

  return (
    <Painel
      rotulo={copy.resumo}
      titulo={copy.resumo}
      estado={
        emAndamento ? (
          <Selo tom="informacao">
            <span aria-hidden="true" className="ao-vivo" />
            {copy.emAndamento}
          </Selo>
        ) : null
      }
    >
      <dl className="m-0 grid grid-cols-3 gap-x-6 gap-y-4 max-lg:grid-cols-2 max-md:grid-cols-1">
        <Campo titulo={copy.duracao}>
          {ficha.duracaoSeg === null ? (
            copy.semDuracao
          ) : (
            <span className="val">{formatarSegundos(ficha.duracaoSeg)}</span>
          )}
        </Campo>
        <Campo titulo={copy.resultado}>{resultado ?? copy.semResultado}</Campo>
        {atendente ? <Campo titulo={copy.atendidaPor}>{atendente}</Campo> : null}
        <Campo titulo={copy.inicio}>
          <span className="val">{formatarInstante(ficha.iniciadaEm)}</span>
        </Campo>
        {ficha.numeroDeDestino ? (
          <Campo titulo={copy.destino}>
            <span className="val">{ficha.numeroDeDestino}</span>
          </Campo>
        ) : null}
        {ficha.numeroDeOrigem ? (
          <Campo titulo={copy.origem}>
            <span className="val">{ficha.numeroDeOrigem}</span>
          </Campo>
        ) : null}
      </dl>
    </Painel>
  )
}

function Custo({ ficha }: { ficha: FichaDaChamada }) {
  const total = totalDoCusto(ficha.parcelas)
  const faltam = componentesSemPreco(ficha.parcelas)

  return (
    <Painel rotulo={copy.custo.titulo} titulo={copy.custo.titulo} apoio={copy.custo.explicacao}>
      <dl className="m-0 flex flex-col gap-3">
        <Campo titulo={copy.custo.total}>
          {total.length === 0 ? (
            copy.custo.semCusto
          ) : (
            <span className="valor-de-indicador val">{valores(total)}</span>
          )}
          {total.length > 0 && faltam > 0 ? (
            <span className="ml-2 text-[13px] text-texto-apoio">{copy.custo.parcial(faltam)}</span>
          ) : null}
        </Campo>
      </dl>
      <dl className="m-0 mt-4 grid grid-cols-4 gap-3 max-md:grid-cols-2">
        {custoPorComponente(ficha.parcelas).map((custo) => (
          <Campo
            key={custo.componente}
            titulo={copy.custo.componentes[custo.componente]}
            bloco
          >
            {custo.valores === null ? (
              <span className="text-texto-apoio">{copy.custo.aguardandoPreco}</span>
            ) : (
              <span className="val">{valores(custo.valores)}</span>
            )}
          </Campo>
        ))}
      </dl>
    </Painel>
  )
}

function Gravacao({
  ficha,
  agora,
  servico,
}: {
  ficha: FichaDaChamada
  agora: string
  servico: ServicoDeChamadas
}) {
  const estado = estadoDaGravacao(ficha, agora)
  const aviso = leituraDoAviso(ficha)

  return (
    <Painel rotulo={copy.gravacao.titulo} titulo={copy.gravacao.titulo}>
      {estado.tipo === 'disponivel' ? (
        <ReprodutorDeGravacao chamadaId={ficha.id} servico={servico} />
      ) : (
        <p className="m-0 text-[13.5px] text-texto-apoio">
          {estado.tipo === 'expurgada'
            ? copy.gravacao.expurgada(formatarData(estado.em))
            : copy.gravacao.semGravacao}
        </p>
      )}

      <dl className="m-0 mt-4">
        <Campo titulo={copy.aviso.titulo}>
          {aviso.tipo === 'localizado' ? (
            <>
              {copy.aviso.dadoAntes}
              <span className="val">{aviso.instante}</span>
              {copy.aviso.dadoDepois}
            </>
          ) : (
            copy.aviso.naoLocalizado
          )}
        </Campo>
      </dl>
    </Painel>
  )
}

function Transcricao({ ficha, emAndamento }: { ficha: FichaDaChamada; emAndamento: boolean }) {
  const turnos = turnosDaFicha(ficha)
  const nome = {
    agent: copy.transcricao.sarah,
    lead: copy.transcricao.lead,
    desconhecido: copy.transcricao.desconhecido,
  }

  return (
    <Painel rotulo={copy.transcricao.titulo} titulo={copy.transcricao.titulo}>
      {turnos.length === 0 ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">
          {emAndamento ? copy.transcricao.emAndamento : copy.transcricao.vazia}
        </p>
      ) : (
        // Duas colunas de fala: a Sarah à esquerda, o lead à direita (RF-412).
        <ol
          aria-label={copy.transcricao.lista}
          className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0"
        >
          {turnos.map((turno, indice) => (
            <li
              key={indice}
              data-quem={turno.quem}
              className={turno.quem === 'lead' ? 'col-start-2' : 'col-start-1'}
            >
              <p
                className={`m-0 flex items-baseline gap-2 text-[12.5px] text-texto-apoio ${
                  turno.quem === 'lead' ? 'justify-end' : ''
                }`}
              >
                <span
                  className={`font-bold ${turno.quem === 'agent' ? 'text-menta-2' : 'text-texto-principal'}`}
                >
                  {nome[turno.quem]}
                </span>
                {turno.instante ? <span className="val">{turno.instante}</span> : null}
              </p>
              <p
                className={`m-0 mt-1 rounded-cartao border px-3.5 py-2.5 text-[14px] leading-relaxed text-texto-secundario ${
                  turno.quem === 'lead'
                    ? 'rounded-tr-pequeno border-borda-suave bg-superficie-2'
                    : 'rounded-tl-pequeno border-positivo-borda bg-positivo-fundo'
                }`}
              >
                {turno.texto}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Painel>
  )
}

function Ferramentas({ ficha }: { ficha: FichaDaChamada }) {
  return (
    <Painel rotulo={copy.ferramentas.titulo} titulo={copy.ferramentas.titulo}>
      {ficha.ferramentas.length === 0 ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{copy.ferramentas.nenhuma}</p>
      ) : (
        // A falha continua na lista, com o motivo: é o que explica por que um
        // bloqueio ou uma qualificação não foi gravado (R-02).
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ficha.ferramentas.map((usada) => (
            <li
              key={`${usada.ferramenta}-${usada.em}`}
              data-falhou={usada.erro ? 'sim' : undefined}
              className="flex flex-col gap-1 rounded-controle border border-borda-suave bg-superficie-funda px-3 py-2 text-[13.5px]"
            >
              <span className="flex items-center gap-3">
                <span className="val text-[12.5px] text-texto-apoio">
                  {instanteNaConversa(ficha, usada.em) ?? ''}
                </span>
                <span>{copy.ferramentas.nome(usada.ferramenta)}</span>
                {usada.erro ? <Selo tom="perigo">{copy.ferramentas.falhou}</Selo> : null}
              </span>
              {usada.erro ? (
                <span className="text-[13px] text-texto-apoio">
                  <span className="sr-only">{copyDasFerramentas.motivo}: </span>
                  {motivoDaFalha(usada.erro)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Painel>
  )
}

function Classificacao({
  ficha,
  servico,
  acesso,
  aoCorrigir,
}: {
  ficha: FichaDaChamada
  servico: ServicoDeChamadas
  acesso: Acesso
  aoCorrigir: () => Promise<unknown>
}) {
  const [corrigindo, setCorrigindo] = useState(false)
  const [gravada, setGravada] = useState(false)
  const estado = estadoDaClassificacao(ficha)
  const chave = textoDaClassificacao(ficha.classificacao, 'stage_key')
  const etapa = chave
    ? (rotuloDaEtapa(ficha.etapas, chave) ?? copyDaCorrecao.etapaDesconhecida(chave))
    : null
  const resumo = textoDaClassificacao(ficha.classificacao, 'summary')
  const fonte = fraseDaFonte(ficha)
  // Corrige-se o que já terminou e teve conversa. Antes da retaguarda também:
  // a correção é gente, e a trava vale para o que vier depois dela.
  const corrigivel = estado === 'pronta' || estado === 'processando'

  return (
    <Painel rotulo={copy.classificacao.titulo} titulo={copy.classificacao.titulo} apoio={fonte ?? undefined}>
      {estado === 'pronta' ? (
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 max-md:grid-cols-1">
          {etapa ? <Campo titulo={copy.classificacao.etapa}>{etapa}</Campo> : null}
          {ficha.sentimento !== null ? (
            <Campo titulo={copy.classificacao.sentimento}>
              {copy.classificacao.faixas[faixaDoSentimento(ficha.sentimento)]}{' '}
              <span className="val">{formatarDecimal(ficha.sentimento, 2)}</span>
            </Campo>
          ) : null}
          {resumo ? <Campo titulo={copy.classificacao.resumo}>{resumo}</Campo> : null}
        </dl>
      ) : (
        <p className="m-0 text-[13.5px] text-texto-apoio">
          {estado === 'processando'
            ? copy.classificacao.aguardando
            : estado === 'em_andamento'
              ? copy.classificacao.emAndamento
              : copy.classificacao.semConversa}
        </p>
      )}

      {gravada && !corrigindo ? (
        <p role="status" className="m-0 mt-4 text-[13.5px] text-positivo">
          {copyDaCorrecao.gravada}
        </p>
      ) : null}

      {!corrigivel ? null : acesso.tipo === 'leitura' ? (
        <div className="mt-4">
          <NegativaPorPapel aviso={copyDaCorrecao.soLeitura} administradores={acesso.administradores} />
        </div>
      ) : acesso.tipo === 'corrige' ? (
        corrigindo ? (
          <FormularioDeCorrecao
            ficha={ficha}
            chaveAtual={chave}
            servico={servico}
            aoCancelar={() => setCorrigindo(false)}
            aoGravar={async () => {
              await aoCorrigir()
              setCorrigindo(false)
              setGravada(true)
            }}
          />
        ) : (
          <div className="mt-4">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                setGravada(false)
                setCorrigindo(true)
              }}
            >
              {copyDaCorrecao.abrir}
            </button>
          </div>
        )
      ) : null}
    </Painel>
  )
}

function FormularioDeCorrecao({
  ficha,
  chaveAtual,
  servico,
  aoCancelar,
  aoGravar,
}: {
  ficha: FichaDaChamada
  chaveAtual: string | null
  servico: ServicoDeChamadas
  aoCancelar: () => void
  aoGravar: () => Promise<void>
}) {
  const primeira = ficha.etapas[0]?.chave ?? ''
  const inicial = chaveAtual && rotuloDaEtapa(ficha.etapas, chaveAtual) ? chaveAtual : primeira
  const [chave, setChave] = useState(inicial)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const semMotivo = motivo.trim() === ''

  async function gravar(evento: FormEvent) {
    evento.preventDefault()
    if (semMotivo || chave === '' || enviando) return
    setEnviando(true)
    setErro(null)
    const resultado = await servico.corrigirClassificacao({
      chamadaId: ficha.id,
      classificacao: classificacaoCorrigida(ficha.classificacao, chave),
      motivo: motivo.trim(),
    })
    if (resultado.ok) {
      await aoGravar()
      return
    }
    setEnviando(false)
    setErro(copyDaCorrecao.falhas[resultado.motivo])
  }

  return (
    <form
      aria-label={copyDaCorrecao.titulo}
      onSubmit={gravar}
      className="mt-4 flex flex-col gap-4 rounded-controle border border-borda-suave bg-superficie-funda p-4"
    >
      <p className="m-0 text-[13.5px] text-texto-secundario">{copyDaCorrecao.explicacao}</p>
      <Seletor rotulo={copyDaCorrecao.etapa} valor={chave} aoTrocar={setChave}>
        {ficha.etapas.map((etapa) => (
          <option key={etapa.chave} value={etapa.chave}>
            {etapa.rotulo}
          </option>
        ))}
      </Seletor>
      <CampoDeTextoLongo
        rotulo={copyDaCorrecao.motivo}
        apoio={copyDaCorrecao.explicacaoDoMotivo}
        rows={3}
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
      />
      {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="botao-primario" disabled={semMotivo || enviando}>
          {enviando ? copyDaCorrecao.gravando : copyDaCorrecao.gravar}
        </button>
        <button type="button" className="botao-fantasma" onClick={aoCancelar} disabled={enviando}>
          {copyDaCorrecao.cancelar}
        </button>
        {semMotivo ? (
          <span className="text-[12.5px] text-texto-apoio">{copyDaCorrecao.semMotivo}</span>
        ) : null}
      </div>
    </form>
  )
}

function Avaliacao({ ficha }: { ficha: FichaDaChamada }) {
  const linhas = linhasDaAvaliacao(ficha.itensDaAvaliacao, ficha.criteriosDaConta)

  return (
    <Painel id="avaliacao" rotulo={copy.avaliacao.titulo} titulo={copy.avaliacao.titulo}>
      {ficha.notaDaAvaliacao === null ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{copy.avaliacao.semNota}</p>
      ) : (
        <dl className="m-0">
          <Campo titulo={copy.avaliacao.nota}>
            <span className="val">{formatarDecimal(ficha.notaDaAvaliacao, 1)}</span>
          </Campo>
        </dl>
      )}

      {linhas.length === 0 ? (
        ficha.notaDaAvaliacao === null ? null : (
          <p className="m-0 mt-4 text-[13.5px] text-texto-apoio">{copyDaAvaliacao.semItens}</p>
        )
      ) : (
        <ul
          aria-label={copyDaAvaliacao.criterios}
          className="m-0 mt-4 flex list-none flex-col gap-2 p-0"
        >
          {linhas.map((linha) => (
            <li
              key={linha.chave}
              data-criterio={linha.chave}
              className="flex flex-col gap-1 rounded-controle border border-borda-suave bg-superficie-funda px-3 py-2 text-[13.5px]"
            >
              <span className="flex items-center gap-3">
                <span className="font-semibold text-texto-principal">{linha.rotulo}</span>
                {linha.aprovado === true ? (
                  <Selo tom="positivo">{copyDaAvaliacao.aprovado}</Selo>
                ) : linha.aprovado === false ? (
                  <Selo tom="perigo">{copyDaAvaliacao.reprovado}</Selo>
                ) : (
                  <Selo tom="neutro">{copyDaAvaliacao.semDecisao}</Selo>
                )}
              </span>
              <span className="text-[13px] text-texto-apoio">
                <span className="sr-only">{copyDaAvaliacao.evidencia}: </span>
                {linha.evidencia ?? copyDaAvaliacao.semEvidencia}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  )
}
