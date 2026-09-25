import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import {
  ferramentasDoProposito,
} from '@compartilhado/agente/compilador.ts'
import {
  compilarCamadaUm,
  escolherVariante,
  PROPOSITOS,
  VERSAO_DA_CAMADA_UM,
} from '@compartilhado/playbook/camada-um.ts'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { IndicadorPublicacao } from '@/componentes/indicador-publicacao'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Seletor } from '@/componentes/seletor'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import {
  playbooksDaSarah as copy,
  PROPOSITO_EM_PORTUGUES,
  VERSAO_EM_PORTUGUES,
} from '@/copy/sarah'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeEditarPlaybooks, quemConcedeAcesso } from '@/equipe/papeis'
import { useServicoDaSarah } from '@/sarah/contexto'
import { useNomeDaAssistente } from '@/sarah/nome-da-assistente'
import {
  compararTextos,
  estadoDoIndicador,
  rascunhoPublicavel,
  textoInicial,
  textosIguais,
  versaoPublicada,
  type TextoDoPlaybook,
} from '@/sarah/playbooks'
import type {
  EstadoDaVersao,
  MotivoDeFalhaDaSarah,
  PlaybookDoProposito,
  Proposito,
  PublicacaoDoPlaybook,
  RelatorioDaPublicacao,
  ResultadoDoProposito,
  ServicoDaSarah,
  VersaoDoPlaybook,
} from '@/sarah/tipos'
import { formatarInstante } from '@/utilidades/datas'

const CHAVE = ['sarah-playbooks'] as const

/** O papel de quem olha vem da mesma carga da tela de equipe, e da mesma chave. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

const TOM_DA_VERSAO: Record<EstadoDaVersao, TomDoSelo> = {
  draft: 'neutro',
  published: 'positivo',
  archived: 'neutro',
}

const TOM_DO_RESULTADO: Record<ResultadoDoProposito['estado'], TomDoSelo> = {
  publicado: 'positivo',
  inalterado: 'positivo',
  falha: 'perigo',
}

/**
 * `/sarah/playbooks`: o roteiro de cada propósito em três camadas (RF-306),
 * com histórico, comparação e publicação explícita (RF-307), e o estado do que
 * está no ar (RF-311, R-06).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **Salvar nunca publica.** Salvar grava o rascunho; publicar é botão
 *    próprio, só aceso quando não há nada por salvar, e pede a nota. O que vai
 *    ao ar é sempre uma versão que alguém consegue reler no histórico.
 * 2. **Publicar mostra os quatro desfechos.** `agent-publish` publica quatro
 *    agentes num provedor sem transação, e a tela diz propósito a propósito o
 *    que foi e o que falhou, com a frase da borda.
 * 3. **A variante sem agenda é dita na tela** (O-06). Sem o aviso, quem edita
 *    o roteiro escreveria a promessa de reunião que nenhuma ferramenta cumpre.
 */
export function TelaDePlaybooksDaSarah({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDaSarah()
  const servicoDeEquipe = useServicoDeEquipe()

  const [proposito, definirProposito] = useState<Proposito>('discovery')
  // O relatório mora aqui, acima da consulta, para sobreviver à releitura que
  // toda escrita dispara e à troca de propósito.
  const [relatorio, definirRelatorio] = useState<RelatorioDaPublicacao | null>(null)
  const [falhaDaPublicacao, definirFalhaDaPublicacao] =
    useState<MotivoDeFalhaDaSarah | null>(null)
  const [republicando, definirRepublicando] = useState(false)

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.carregarPlaybooks(),
  })

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  if (consulta.isPending || equipe.isPending) {
    return (
      <Moldura embutida={dentroDoAssistente}>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const carga = consulta.data

  if (!carga?.ok) {
    return (
      <Moldura embutida={dentroDoAssistente}>
        <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      </Moldura>
    )
  }

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera escrita: quem decide de verdade é a
  // política, e oferecer o editor para receber a recusa dela no meio do
  // caminho trocaria uma negativa explicada por um erro sem saída.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeEditarPlaybooks(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  const { playbooks } = carga
  const playbook =
    playbooks.playbooks.find((item) => item.proposito === proposito) ??
    { proposito, versoes: [] }
  const estado = estadoDoIndicador(playbooks.publicacao, playbooks.foraDaPlataforma)
  const podeRepublicar =
    podeEscrever &&
    (estado === 'alteracoes_pendentes' || estado === 'alterado_fora_da_plataforma')

  async function concluirPublicacao(resultado: PublicacaoDoPlaybook) {
    if (!resultado.ok) {
      definirFalhaDaPublicacao(resultado.motivo)
      return
    }
    definirFalhaDaPublicacao(null)
    definirRelatorio(resultado.relatorio)
    await consulta.refetch()
  }

  async function republicar() {
    definirRepublicando(true)
    const resultado = await servico.republicar()
    await concluirPublicacao(resultado)
    definirRepublicando(false)
  }

  return (
    <Moldura embutida={dentroDoAssistente}>
      <div className="flex flex-col gap-6">
        {papel !== null && !podeEscrever ? (
          <NegativaPorPapel aviso={copy.leitura.aviso} administradores={administradores} />
        ) : null}

        {cargaDaEquipe && !cargaDaEquipe.ok ? (
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        ) : null}

        <IndicadorPublicacao
          estado={estado}
          {...(estado === 'alterado_fora_da_plataforma'
            ? {
                detalhe: copy.indicador.propositosAlterados(
                  playbooks.foraDaPlataforma.map((item) => PROPOSITO_EM_PORTUGUES[item]),
                ),
              }
            : {})}
          {...(podeRepublicar
            ? {
                acao: (
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={republicando}
                    onClick={republicar}
                  >
                    {republicando ? copy.indicador.republicando : copy.indicador.republicar}
                  </button>
                ),
              }
            : {})}
        />

        {falhaDaPublicacao ? <CaixaDeErro>{copy.falhas[falhaDaPublicacao]}</CaixaDeErro> : null}
        {relatorio ? <Relatorio relatorio={relatorio} /> : null}

        <div className="max-w-[260px]">
          <Seletor
            rotulo={copy.seletor}
            valor={proposito}
            aoTrocar={(valor) => definirProposito(valor as Proposito)}
          >
            {PROPOSITOS.map((item) => (
              <option key={item} value={item}>
                {PROPOSITO_EM_PORTUGUES[item]}
              </option>
            ))}
          </Seletor>
        </div>

        <AvisoSemAgenda proposito={proposito} />

        <CamadaUm proposito={proposito} />

        <Editor
          key={proposito}
          servico={servico}
          playbook={playbook}
          podeEscrever={podeEscrever}
          aoSalvar={async () => {
            await consulta.refetch()
          }}
          aoPublicar={concluirPublicacao}
        />

        <Historico key={`historico-${proposito}`} playbook={playbook} />
      </div>
    </Moldura>
  )
}

function Moldura({
  embutida,
  children,
}: {
  embutida: boolean
  children: ReactNode
}) {
  const nomeDaAssistente = useNomeDaAssistente()
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao(nomeDaAssistente)} embutida={embutida}>
      {children}
    </AreaDeTrabalho>
  )
}

/**
 * O aviso de O-06. Sai do conjunto de ferramentas do propósito, pela mesma
 * `escolherVariante` que monta a camada 1: no dia em que a ferramenta de
 * agenda entrar na publicação, o aviso some sozinho, junto com a variante.
 */
function AvisoSemAgenda({ proposito }: { proposito: Proposito }) {
  if (escolherVariante(ferramentasDoProposito(proposito)) !== 'sem_agenda') return null

  return (
    <CaixaDeErro tom="atencao">
      <p className="m-0 font-medium">{copy.semAgenda.titulo}</p>
      <p className="mt-1.5 mb-0">{copy.semAgenda.texto}</p>
    </CaixaDeErro>
  )
}

/** A camada 1, travada: o texto que vai ao ar, a versão e por que não se edita. */
function CamadaUm({ proposito }: { proposito: Proposito }) {
  return (
    <Painel
      titulo={copy.camadaUm.titulo}
      apoio={copy.camadaUm.explicacao}
      estado={
        <span className="flex items-center gap-2">
          <Selo>{copy.camadaUm.selo}</Selo>
          <span className="val text-[12.5px] text-texto-apoio">
            {copy.camadaUm.versao(VERSAO_DA_CAMADA_UM)}
          </span>
        </span>
      }
    >
      <pre
        aria-label={copy.camadaUm.rotulo}
        className="bloco-secundario val m-0 max-h-[280px] overflow-auto text-[12.5px] leading-relaxed whitespace-pre-wrap text-texto-secundario"
      >
        {compilarCamadaUm(proposito, ferramentasDoProposito(proposito))}
      </pre>
    </Painel>
  )
}

type EditorProps = {
  servico: ServicoDaSarah
  playbook: PlaybookDoProposito
  podeEscrever: boolean
  aoSalvar: () => Promise<void>
  aoPublicar: (resultado: PublicacaoDoPlaybook) => Promise<void>
}

/**
 * As camadas 2 e 3 do propósito. O texto do campo é estado daqui; o que está
 * salvo vem da consulta, e a comparação entre os dois é o que acende salvar e
 * apaga publicar.
 */
function Editor({ servico, playbook, podeEscrever, aoSalvar, aoPublicar }: EditorProps) {
  const salvo = textoInicial(playbook)
  const [texto, definirTexto] = useState<TextoDoPlaybook>(salvo)
  const [gravando, definirGravando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaSarah | null>(null)
  const [salvoAgora, definirSalvoAgora] = useState<number | null>(null)
  const [gerando, definirGerando] = useState(false)
  const [geracao, definirGeracao] = useState<string | null>(null)
  const [descricaoDoNegocio, definirDescricaoDoNegocio] = useState('')
  const [dialogo, definirDialogo] = useState(false)
  const [nota, definirNota] = useState('')
  const [publicando, definirPublicando] = useState(false)

  const mudou = !textosIguais(texto, salvo)
  const rascunho = rascunhoPublicavel(playbook)
  const semVersaoNoAr = versaoPublicada(playbook) === null

  function mudar(mudanca: Partial<TextoDoPlaybook>) {
    definirTexto((atual) => ({ ...atual, ...mudanca }))
    definirFalha(null)
    definirSalvoAgora(null)
  }

  async function salvar() {
    definirGravando(true)
    definirFalha(null)
    const resultado = await servico.salvarRascunho({
      proposito: playbook.proposito,
      roteiro: texto.roteiro,
      jeitoDaCasa: texto.jeitoDaCasa,
    })
    if (resultado.ok) await aoSalvar()
    definirGravando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }
    definirSalvoAgora(resultado.versao.versao)
  }

  async function gerar() {
    definirGerando(true)
    const resultado = await servico.gerarRascunho(playbook.proposito, descricaoDoNegocio)
    definirGerando(false)

    if (!resultado.ok) {
      definirGeracao(resultado.mensagem ?? copy.falhas['falha-de-comunicacao'])
      return
    }
    // A borda já grava o rascunho (US-063), draft novo em `playbook_versions`:
    // o campo só espelha o que acabou de ser salvo, e `aoSalvar` traz
    // `playbook.versoes[0]` para bater com ele. Sem o refetch, "Salvar
    // rascunho" pensaria que nada foi gravado ainda e criaria uma segunda
    // versão com o mesmo texto.
    mudar({ roteiro: resultado.roteiro })
    await aoSalvar()
    definirGeracao(copy.vazio.gerado)
  }

  async function publicar() {
    if (!rascunho) return
    definirPublicando(true)
    const resultado = await servico.publicarPlaybook({
      proposito: playbook.proposito,
      versaoId: rascunho.id,
      nota,
    })
    await aoPublicar(resultado)
    definirPublicando(false)
    definirDialogo(false)
    definirNota('')
  }

  return (
    <div className="flex flex-col gap-6">
      {semVersaoNoAr ? (
        <div className="flex flex-col gap-2">
          {podeEscrever ? (
            <CampoDeTextoLongo
              rotulo={copy.vazio.campoDeDescricao}
              apoio={copy.vazio.apoioDoCampoDeDescricao}
              name="descricaoDoNegocio"
              rows={4}
              value={descricaoDoNegocio}
              disabled={gerando}
              onChange={(evento) => definirDescricaoDoNegocio(evento.target.value)}
            />
          ) : null}
          <EstadoVazio
            titulo={copy.vazio.titulo}
            explicacao={copy.vazio.explicacao}
            {...(podeEscrever && !gerando
              ? { acao: { rotulo: copy.vazio.gerar, aoAcionar: gerar } }
              : {})}
          />
          {gerando ? (
            <p
              role="status"
              className="m-0 flex items-center justify-center gap-3 text-[13px] text-texto-apoio"
            >
              <span aria-hidden="true" className="sinal sinal-processando h-7 w-7" />
              {copy.vazio.gerando}
              <span aria-hidden="true" className="pontos-pensando">
                <i />
                <i />
                <i />
              </span>
            </p>
          ) : null}
          {geracao ? (
            <p role="status" className="m-0 text-center text-[13px] text-texto-apoio">
              {geracao}
            </p>
          ) : null}
        </div>
      ) : null}

      <Painel titulo={copy.camadaDois.titulo} apoio={copy.camadaDois.explicacao}>
        <CampoDeTextoLongo
          rotulo={copy.camadaDois.campo}
          name="roteiro"
          rows={8}
          value={texto.roteiro}
          disabled={!podeEscrever}
          onChange={(evento) => mudar({ roteiro: evento.target.value })}
        />
      </Painel>

      <Painel titulo={copy.camadaTres.titulo} apoio={copy.camadaTres.explicacao}>
        <CampoDeTextoLongo
          rotulo={copy.camadaTres.campo}
          name="jeito-da-casa"
          rows={4}
          value={texto.jeitoDaCasa}
          disabled={!podeEscrever}
          onChange={(evento) => mudar({ jeitoDaCasa: evento.target.value })}
        />
      </Painel>

      {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="botao-secundario"
          disabled={!podeEscrever || gravando || !mudou}
          onClick={salvar}
        >
          {gravando ? copy.salvando : copy.salvar}
        </button>

        <button
          type="button"
          className="botao-primario"
          disabled={!podeEscrever || mudou || rascunho === null}
          onClick={() => definirDialogo(true)}
        >
          {rascunho ? copy.publicar.acao(rascunho.versao) : copy.publicar.confirmar}
        </button>

        {salvoAgora !== null && !mudou ? (
          <p role="status" className="m-0 flex items-center gap-2 text-[13px] font-semibold text-positivo">
            <span aria-hidden="true" className="ao-vivo" />
            {copy.salvo(salvoAgora)}
          </p>
        ) : podeEscrever && mudou ? (
          <p className="m-0 text-[13px] text-texto-apoio">{copy.salveAntes}</p>
        ) : rascunho ? (
          <p className="m-0 text-[13px] text-texto-apoio">
            {copy.rascunhoPendente(rascunho.versao)}
          </p>
        ) : null}
      </div>

      {dialogo && rascunho ? (
        <Dialogo
          titulo={copy.publicar.titulo(rascunho.versao)}
          explicacao={copy.publicar.explicacao}
          confirmar={publicando ? copy.publicar.publicando : copy.publicar.confirmar}
          cancelar={copy.publicar.cancelar}
          ocupado={publicando}
          podeConfirmar={nota.trim() !== ''}
          aoConfirmar={publicar}
          aoCancelar={() => definirDialogo(false)}
        >
          <CampoDeTextoLongo
            rotulo={copy.publicar.nota}
            apoio={copy.publicar.notaExplicacao}
            name="nota"
            rows={2}
            value={nota}
            onChange={(evento) => definirNota(evento.target.value)}
          />
        </Dialogo>
      ) : null}
    </div>
  )
}

/** O desfecho de cada propósito, como `agent-publish` o devolveu. */
function Relatorio({ relatorio }: { relatorio: RelatorioDaPublicacao }) {
  const noAr = relatorio.propositos.filter((item) => item.estado !== 'falha').length

  return (
    <Painel titulo={copy.relatorio.titulo}>
      {relatorio.versaoPublicada !== null ? (
        <p className="mt-0 mb-2 text-[13.5px] text-texto-secundario">
          {copy.relatorio.versao(relatorio.versaoPublicada)}
        </p>
      ) : null}

      {relatorio.recusa ? (
        <CaixaDeErro>
          {copy.relatorio.recusa} {relatorio.recusa}
        </CaixaDeErro>
      ) : (
        <>
          <p className="mt-0 mb-3 text-[13.5px] text-texto-secundario">
            {copy.relatorio.resumo(noAr, relatorio.propositos.length)}
          </p>
          <ul
            aria-label={copy.relatorio.rotulo}
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {relatorio.propositos.map((item) => (
              <li key={item.proposito} className="bloco-secundario py-2.5 text-[13.5px]">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{PROPOSITO_EM_PORTUGUES[item.proposito]}</span>
                  <Selo tom={TOM_DO_RESULTADO[item.estado]}>
                    {copy.relatorio.estados[item.estado]}
                  </Selo>
                </span>
                {item.mensagem ? (
                  <span className="mt-1 block text-[13px] text-texto-apoio">{item.mensagem}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {/* Os agentes foram ao ar e os avisos da ElevenLabs não: a frase é da borda. */}
          {relatorio.pendenciaDosWebhooks ? (
            <div className="mt-3">
              <CaixaDeErro tom="atencao">{relatorio.pendenciaDosWebhooks}</CaixaDeErro>
            </div>
          ) : null}
        </>
      )}
    </Painel>
  )
}

const COLUNAS_DO_HISTORICO: readonly ColunaDensa<VersaoDoPlaybook>[] = [
  {
    titulo: copy.historico.colunas.versao,
    classe: 'val',
    conteudo: (versao) => copy.historico.versao(versao.versao),
  },
  {
    titulo: copy.historico.colunas.estado,
    conteudo: (versao) => (
      <Selo tom={TOM_DA_VERSAO[versao.estado]}>{VERSAO_EM_PORTUGUES[versao.estado]}</Selo>
    ),
  },
  {
    titulo: copy.historico.colunas.nota,
    conteudo: (versao) => versao.nota ?? copy.historico.semNota,
  },
  {
    titulo: copy.historico.colunas.publicadaEm,
    classe: 'val',
    conteudo: (versao) =>
      versao.publicadaEm ? formatarInstante(versao.publicadaEm) : copy.historico.nuncaPublicada,
  },
]

/**
 * O histórico e a comparação. É leitura para todo membro: é o histórico que
 * explica o que a Sarah disse numa ligação de meses atrás.
 */
function Historico({ playbook }: { playbook: PlaybookDoProposito }) {
  const { versoes } = playbook
  const [de, definirDe] = useState<string>(versoes[1]?.id ?? '')
  const [para, definirPara] = useState<string>(versoes[0]?.id ?? '')

  const versaoDe = versoes.find((item) => item.id === de)
  const versaoPara = versoes.find((item) => item.id === para)

  return (
    <Painel titulo={copy.historico.titulo}>
      <TabelaDensa
        rotulo={copy.historico.rotulo}
        colunas={COLUNAS_DO_HISTORICO}
        linhas={versoes}
        chaveDaLinha={(versao) => versao.id}
      />

      <h3 className="mt-6 mb-3 text-[15px] font-bold text-texto-principal">
        {copy.comparacao.titulo}
      </h3>

      {versoes.length < 2 ? (
        <p className="m-0 text-[13px] text-texto-apoio">{copy.comparacao.poucasVersoes}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            {(
              [
                [copy.comparacao.de, de, definirDe],
                [copy.comparacao.para, para, definirPara],
              ] as const
            ).map(([rotulo, valor, trocar]) => (
              <div key={rotulo} className="min-w-[160px]">
                <Seletor rotulo={rotulo} valor={valor} aoTrocar={trocar}>
                  {versoes.map((versao) => (
                    <option key={versao.id} value={versao.id}>
                      {copy.historico.versao(versao.versao)}
                    </option>
                  ))}
                </Seletor>
              </div>
            ))}
          </div>

          {versaoDe && versaoPara ? (
            <Comparacao de={versaoDe} para={versaoPara} />
          ) : null}
        </>
      )}
    </Painel>
  )
}

function Comparacao({ de, para }: { de: VersaoDoPlaybook; para: VersaoDoPlaybook }) {
  const camadas = [
    { titulo: copy.comparacao.camadaDois, linhas: compararTextos(de.roteiro, para.roteiro) },
    { titulo: copy.comparacao.camadaTres, linhas: compararTextos(de.jeitoDaCasa, para.jeitoDaCasa) },
  ]
  const semDiferenca = camadas.every((camada) =>
    camada.linhas.every((linha) => linha.tipo === 'igual'),
  )

  if (semDiferenca) {
    return <p className="mt-4 mb-0 text-[13px] text-texto-apoio">{copy.comparacao.semDiferenca}</p>
  }

  return (
    <div aria-label={copy.comparacao.rotulo} role="group" className="mt-4 flex flex-col gap-4">
      {camadas.map((camada) => (
        <div key={camada.titulo}>
          <p className="sobretitulo m-0 mb-1">{camada.titulo}</p>
          <ul className="bloco-secundario val m-0 flex list-none flex-col gap-px overflow-hidden px-0 py-1.5 text-[12.5px] leading-relaxed">
            {camada.linhas.map((linha, indice) => (
              <li
                key={`${indice}-${linha.tipo}`}
                className={`border-l-2 px-3.5 py-0.5 ${
                  linha.tipo === 'removida'
                    ? 'border-l-perigo bg-perigo-fundo text-perigo line-through'
                    : linha.tipo === 'acrescentada'
                      ? 'border-l-positivo bg-positivo-fundo text-positivo'
                      : 'border-l-transparent text-texto-secundario'
                }`}
              >
                {linha.tipo === 'igual' ? null : (
                  <span className="sr-only">
                    {linha.tipo === 'removida'
                      ? copy.comparacao.removida
                      : copy.comparacao.acrescentada}
                    :{' '}
                  </span>
                )}
                {linha.texto}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
