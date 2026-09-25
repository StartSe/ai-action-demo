import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { formatarDecimal, formatarSegundos, formatarValor } from '@/chamadas/ficha'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CartaoMetrica } from '@/componentes/cartao-metrica'
import { ChamadasAoVivo } from '@/componentes/chamadas-ao-vivo'
import { Discador } from '@/componentes/discador'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { SeletorPeriodo } from '@/componentes/seletor-periodo'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import { useServicoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import { Carregando } from '@/componentes/carregando'
import {
  CAMINHO_DA_CONFIGURACAO,
  aplicacaoConfigurada,
  reabrirNaEntrada,
} from '@/configuracao-inicial/progresso'
import { tutorialVistoNestaCarga } from '@/configuracao-inicial/visita'
import { comum } from '@/copy/comum'
import { painel } from '@/copy/painel'
import {
  CARTOES_DE_LIGACOES,
  CARTOES_DE_REUNIAO,
  PERIODOS,
  PERIODO_PADRAO,
  cartaoDeLigacoes,
  cartaoDeReuniao,
  custoPorReuniao,
  intervaloDoPeriodo,
  linhasDoFunil,
  metricaNorte,
  notaMedia,
  pendenciasDaMetricaNorte,
  periodoVazio,
  type CartaoDeLigacoes,
  type LeituraDoCampo,
  type LinhaDoFunil,
  type Periodo,
} from '@/painel/cartoes'
import { useServicoDoPainel } from '@/painel/contexto'
import type { CargaDoPainel, ResumoDoPainel } from '@/painel/tipos'

/** A âncora do discador, para onde o estado vazio leva. */
const ANCORA_DO_DISCADOR = 'discador'

const OPCOES_DE_PERIODO = PERIODOS.map((periodo) => ({
  valor: periodo,
  rotulo: painel.periodo.opcoes[periodo],
}))

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const porcentagem = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const FORMATO_DAS_LIGACOES: Record<CartaoDeLigacoes, (valor: number) => string> = {
  total: (valor) => inteiro.format(valor),
  atendidas: (valor) => inteiro.format(valor),
  taxaDeAtendimento: (valor) => porcentagem.format(valor),
  duracaoMedia: (valor) => formatarSegundos(valor),
}

/**
 * As props do cartão para cada leitura: número em `.val`, explicação de por
 * que não há número, ou o estado de "ainda não apurável" com a fatia.
 */
function propsDaLeitura(
  leitura: LeituraDoCampo,
  formatar: (valor: number) => string,
  semBase: string,
) {
  switch (leitura.estado) {
    case 'valor':
      return { valor: formatar(leitura.valor) }
    case 'sem_base':
      return { explicacao: semBase }
    case 'indisponivel':
      return { selo: painel.indisponivel.selo, explicacao: painel.indisponivel.explicacao }
  }
}

export function TelaDoPainel() {
  const navegar = useNavigate()
  // A mesma chave do assistente e do checklist: é a mesma medição.
  const servico = useServicoDeConfiguracaoInicial()
  const configuracao = useQuery({
    queryKey: ['configuracao-inicial'],
    queryFn: () => servico.carregar(),
  })

  // Quem abre o app sem ter terminado a configuração vai para o tutorial,
  // aberto e no passo em que parou, mesmo que o tenha fechado da última vez.
  // Fechado nesta visita, fica fechado. Carga que falhou não prende ninguém
  // fora do painel.
  const carga = configuracao.data ?? null
  const irParaOTutorial =
    carga?.ok === true &&
    !aplicacaoConfigurada(carga.configuracao) &&
    (!carga.configuracao.dispensada || !tutorialVistoNestaCarga())

  useEffect(() => {
    if (!irParaOTutorial) return
    const reabrir = reabrirNaEntrada(carga)
    void (async () => {
      if (reabrir) await servico.salvar(reabrir).catch(() => null)
      await navegar({ to: CAMINHO_DA_CONFIGURACAO, replace: true })
    })()
    // A decisão é tomada uma vez por carga; `carga` muda junto com ela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irParaOTutorial])

  if (irParaOTutorial) return <Carregando texto={painel.indoParaOTutorial} />

  return (
    <AreaDeTrabalho titulo={painel.titulo} lead={`${comum.promessa}.`}>
      <div className="flex flex-col gap-5">
        <div id={ANCORA_DO_DISCADOR}>
          <Discador />
        </div>
        <ChamadasAoVivo />
        <ResumoDoPeriodo />
      </div>
    </AreaDeTrabalho>
  )
}

/**
 * Os números do período, de uma chamada a `dashboard_summary`. Nada é somado
 * aqui: a tela desenha o que o RPC contou.
 */
function ResumoDoPeriodo() {
  const servico = useServicoDoPainel()
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_PADRAO)
  // O instante da montagem: o intervalo não muda a cada desenho, e a chave
  // da consulta também não.
  const [agora] = useState(() => Date.now())
  const intervalo = intervaloDoPeriodo(periodo, agora)

  const consulta = useQuery({
    queryKey: ['painel', intervalo.de, intervalo.ate],
    queryFn: () => servico.carregarResumo(intervalo),
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SeletorPeriodo
          rotulo={painel.periodo.rotulo}
          valor={periodo}
          opcoes={OPCOES_DE_PERIODO}
          aoTrocar={setPeriodo}
        />
      </div>
      <ConteudoDoPeriodo consulta={consulta} />
    </div>
  )
}

function ConteudoDoPeriodo({
  consulta,
}: {
  consulta: UseQueryResult<CargaDoPainel>
}) {
  if (consulta.isPending) return <Carregando texto={painel.carregando} />

  const carga = consulta.data
  if (!carga?.ok) {
    return <CaixaDeErro>{painel.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  }

  const { resumo } = carga
  if (periodoVazio(resumo)) {
    return (
      <EstadoVazio
        titulo={painel.vazio.titulo}
        explicacao={painel.vazio.explicacao}
        acao={{ rotulo: painel.vazio.acao, endereco: `#${ANCORA_DO_DISCADOR}` }}
      />
    )
  }

  return (
    <>
      <MetricaNorte resumo={resumo} />
      <Ligacoes resumo={resumo} />
      <Qualidade resumo={resumo} />
      <Funil resumo={resumo} />
      <Custo resumo={resumo} />
      <Reunioes resumo={resumo} />
    </>
  )
}

function MetricaNorte({ resumo }: { resumo: ResumoDoPainel }) {
  const leitura = metricaNorte(resumo)
  const { semApuracao, degradada } = pendenciasDaMetricaNorte(resumo)
  // A pendência fica ao lado do número, nunca somada a ele (RF-516).
  const avisos = [
    semApuracao > 0 ? painel.norte.semApuracao(semApuracao) : null,
    degradada ? painel.norte.degradada : null,
  ].filter((aviso): aviso is string => aviso !== null)
  return (
    <Painel sobretitulo={painel.norte.rotulo} titulo={painel.norte.titulo} apoio={painel.norte.apoio}>
      <CartaoMetrica
        rotulo={painel.norte.titulo}
        {...propsDaLeitura(leitura, (valor) => inteiro.format(valor), painel.reunioes.semBase)}
        {...(leitura.estado === 'valor' && avisos.length > 0 ? { explicacao: avisos.join(' ') } : {})}
      />
    </Painel>
  )
}

function Ligacoes({ resumo }: { resumo: ResumoDoPainel }) {
  return (
    <Painel titulo={painel.ligacoes.titulo}>
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {CARTOES_DE_LIGACOES.map((cartao) => {
          const leitura = cartaoDeLigacoes(resumo, cartao)
          return (
            <CartaoMetrica
              key={cartao}
              rotulo={painel.ligacoes.cartoes[cartao]}
              {...propsDaLeitura(leitura, FORMATO_DAS_LIGACOES[cartao], painel.ligacoes.semBase[cartao])}
              {...(cartao === 'duracaoMedia' && leitura.estado === 'valor'
                ? { explicacao: painel.ligacoes.apoioDaDuracao }
                : {})}
            />
          )
        })}
      </div>
    </Painel>
  )
}

function Qualidade({ resumo }: { resumo: ResumoDoPainel }) {
  const nota = notaMedia(resumo)
  const faixas = [
    ['positivo', resumo.sentimento.positivo],
    ['neutro', resumo.sentimento.neutro],
    ['negativo', resumo.sentimento.negativo],
    ['semSentimento', resumo.sentimento.semSentimento],
  ] as const

  return (
    <Painel titulo={painel.qualidade.titulo}>
      <div className="grid grid-cols-[1fr_2fr] gap-3 max-lg:grid-cols-1">
        <CartaoMetrica
          rotulo={painel.qualidade.nota}
          {...propsDaLeitura(nota, (valor) => formatarDecimal(valor, 1), painel.qualidade.notaSemBase)}
          {...(nota.estado === 'valor'
            ? {
                complemento: painel.qualidade.notaDe,
                explicacao: painel.qualidade.avaliadas(resumo.avaliacao.avaliadas),
              }
            : {})}
        />
        <div
          role="group"
          aria-label={painel.qualidade.sentimento}
          className="bloco-secundario flex flex-col gap-2 px-4 py-3.5"
        >
          <span className="rotulo-de-indicador">{painel.qualidade.sentimento}</span>
          <dl className="m-0 grid grid-cols-4 gap-3 max-md:grid-cols-2">
            {faixas.map(([faixa, quantidade]) => (
              <div key={faixa} className="flex flex-col gap-1">
                <dt className="text-[12.5px] text-texto-apoio">{painel.qualidade.faixas[faixa]}</dt>
                <dd className="val m-0 text-[20px] font-extrabold text-texto-principal">
                  {inteiro.format(quantidade)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-[12.5px] text-texto-apoio">{painel.qualidade.apoioDoSentimento}</p>
        </div>
      </div>
    </Painel>
  )
}

const COLUNAS_DO_FUNIL: readonly ColunaDensa<LinhaDoFunil>[] = [
  { titulo: painel.funil.etapa, conteudo: (linha) => linha.label },
  { titulo: painel.funil.entraram, classe: 'val', conteudo: (linha) => inteiro.format(linha.entraram) },
  {
    titulo: painel.funil.passagem,
    conteudo: (linha) =>
      linha.passagem.estado === 'valor' ? (
        <span className="val">{porcentagem.format(linha.passagem.valor)}</span>
      ) : (
        <span className="text-texto-apoio">{painel.funil.semPassagem}</span>
      ),
  },
]

function Funil({ resumo }: { resumo: ResumoDoPainel }) {
  const linhas = linhasDoFunil(resumo)
  return (
    <Painel titulo={painel.funil.titulo} apoio={painel.funil.apoio}>
      {linhas.length === 0 ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{painel.funil.semEtapa}</p>
      ) : (
        <TabelaDensa
          rotulo={painel.funil.titulo}
          colunas={COLUNAS_DO_FUNIL}
          linhas={linhas}
          chaveDaLinha={(linha) => linha.key}
        />
      )}
    </Painel>
  )
}

interface LinhaDeCusto {
  chave: string
  rotulo: string
  valor: string
}

const COLUNAS_DO_CUSTO: readonly ColunaDensa<LinhaDeCusto>[] = [
  { titulo: painel.custo.componente, conteudo: (linha) => linha.rotulo },
  { titulo: painel.custo.valor, classe: 'val', conteudo: (linha) => linha.valor },
]

function Custo({ resumo }: { resumo: ResumoDoPainel }) {
  const linhas: LinhaDeCusto[] = [
    ...resumo.custo.porComponente.map((parcela) => ({
      chave: `${parcela.moeda}:${parcela.componente}`,
      rotulo: painel.custo.componentes[parcela.componente] ?? parcela.componente,
      valor: formatarValor(parcela),
    })),
    ...resumo.custo.total.map((total) => ({
      chave: `${total.moeda}:total`,
      rotulo: painel.custo.total(total.moeda),
      valor: formatarValor(total),
    })),
  ]

  return (
    <Painel titulo={painel.custo.titulo} apoio={painel.custo.apoio}>
      {linhas.length === 0 ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{painel.custo.semCusto}</p>
      ) : (
        <TabelaDensa
          rotulo={painel.custo.titulo}
          colunas={COLUNAS_DO_CUSTO}
          linhas={linhas}
          chaveDaLinha={(linha) => linha.chave}
        />
      )}
    </Painel>
  )
}

function Reunioes({ resumo }: { resumo: ResumoDoPainel }) {
  const custo = custoPorReuniao(resumo)
  return (
    <Painel titulo={painel.reunioes.titulo} apoio={painel.reunioes.apoio}>
      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
        {CARTOES_DE_REUNIAO.map((cartao) => (
          <CartaoMetrica
            key={cartao}
            rotulo={painel.reunioes.cartoes[cartao]}
            {...propsDaLeitura(
              cartaoDeReuniao(resumo, cartao),
              cartao === 'taxaDeComparecimento' || cartao === 'taxaDeApuracao'
                ? (valor) => porcentagem.format(valor)
                : (valor) => inteiro.format(valor),
              painel.reunioes.semBaseDoCartao[cartao] ?? painel.reunioes.semBase,
            )}
          />
        ))}
        <CartaoMetrica
          rotulo={painel.reunioes.custo.rotulo}
          {...(custo.estado === 'valor'
            ? {
                valor: custo.valores.map((valor) => formatarValor(valor)).join(' + '),
                explicacao: painel.reunioes.custo.apoio,
              }
            : custo.estado === 'sem_base'
              ? { explicacao: painel.reunioes.custo.semBase }
              : { selo: painel.indisponivel.selo, explicacao: painel.indisponivel.explicacao })}
        />
      </div>
    </Painel>
  )
}
