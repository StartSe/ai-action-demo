import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { nomeCurto } from '@voz/vozes-de-exemplo.ts'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { AvisoDePublicacao } from '@/componentes/aviso-de-publicacao'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { vozDaSarah as copy } from '@/copy/sarah'
import { useServicoDeEquipe } from '@/equipe/contexto'
import {
  podeDefinirIdentidadeDaSarah,
  quemConcedeAcesso,
} from '@/equipe/papeis'
import { useServicoDaSarah } from '@/sarah/contexto'
import type {
  AjustesDeVoz,
  AmostraDaPrimeiraFala,
  CatalogoDeVozes,
  EscolhaDeVoz,
  EstadoDaVozDaSarah,
  EstadoDePublicacao,
  MotivoDeFalhaDaSarah,
  PendenciaDaAmostra,
  ServicoDaSarah,
  VozDoCatalogo,
} from '@/sarah/tipos'
import {
  ajustesIniciais,
  aparar,
  escolhaGravada,
  estadoDaTelaDeVoz,
  fonteDaAmostra,
  mesmaEscolha,
  vozInicial,
} from '@/sarah/voz'

const CHAVE = ['sarah-voz'] as const

/** O papel de quem olha vem da mesma carga da tela de equipe, e da mesma chave. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

/**
 * Quanto a tela espera o cursor parar antes de pedir a amostra. Arrastar um
 * controle dispara uma mudança por passo, e cada pedido é uma síntese paga no
 * provedor: pedir a cada passo gastaria dez amostras para ouvir uma.
 */
const ESPERA_DO_CONTROLE_MS = 300

/**
 * `/sarah/voz`: a voz que o lead ouve (RF-302, RF-303, RF-304).
 *
 * Duas decisões explicam o desenho:
 *
 * 1. **A amostra é a abertura da conta.** Ouvir uma frase de catálogo escolhe
 *    a voz para uma frase que o lead nunca vai ouvir; a borda sintetiza a
 *    primeira fala interpolada, e a tela diz isso ao lado do áudio.
 * 2. **Mexer num controle refaz a amostra.** Velocidade e estabilidade só se
 *    julgam de ouvido, e um cursor que muda um número sem mudar o som deixa a
 *    pessoa escolher por um valor que ela nunca escutou.
 */
export function TelaDeVozDaSarah({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDaSarah()
  const servicoDeEquipe = useServicoDeEquipe()

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.carregarVoz(),
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
        <CaixaDeErro>
          {copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      </Moldura>
    )
  }

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera a escolha: quem decide de verdade é a
  // política, e oferecer o botão para receber a recusa dela trocaria uma
  // negativa explicada por um erro sem saída.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscolher = papel !== null && podeDefinirIdentidadeDaSarah(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  const { voz } = carga

  return (
    <Moldura embutida={dentroDoAssistente}>
      {papel !== null && !podeEscolher ? (
        <div className="mb-6">
          <NegativaPorPapel
            aviso={copy.leitura.aviso}
            administradores={administradores}
          />
        </div>
      ) : null}

      {cargaDaEquipe && !cargaDaEquipe.ok ? (
        <div className="mb-6">
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        </div>
      ) : null}

      {voz.temIdentidade ? (
        <EstadoDoCatalogo
          voz={voz}
          // O refazer da consulta também é espera: "o provedor não respondeu"
          // à vista enquanto a nova pergunta viaja responderia por ela. Com o
          // catálogo no ar, não: a releitura ao voltar para a aba desmontaria
          // os controles e a amostra no meio da audição.
          esperando={
            consulta.isFetching && voz.catalogo.estado !== 'conectado'
          }
          aoTentarDeNovo={() => void consulta.refetch()}
          servico={servico}
          podeEscolher={podeEscolher}
        />
      ) : (
        <EstadoVazio
          titulo={copy.semIdentidade.titulo}
          explicacao={copy.semIdentidade.explicacao}
          acao={{
            rotulo: copy.semIdentidade.acao,
            endereco: copy.semIdentidade.endereco,
          }}
        />
      )}
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
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao} embutida={embutida}>
      {children}
    </AreaDeTrabalho>
  )
}

/**
 * Os quatro estados do servidor e o da tela, cada um com a sua saída. `erro`
 * manda conferir a chave e não oferece "tentar de novo", porque a mesma chave
 * devolve a mesma recusa; `indisponivel` oferece só isso, porque a chave está
 * boa.
 */
function EstadoDoCatalogo({
  voz,
  esperando,
  aoTentarDeNovo,
  servico,
  podeEscolher,
}: {
  voz: EstadoDaVozDaSarah
  esperando: boolean
  aoTentarDeNovo: () => void
  servico: ServicoDaSarah
  podeEscolher: boolean
}) {
  const estado = estadoDaTelaDeVoz(esperando, voz.catalogo)

  switch (estado) {
    case 'esperando':
      return <Carregando texto={copy.carregando} />

    case 'nao_configurado':
      return (
        <EstadoVazio
          titulo={copy.naoConfigurado.titulo}
          explicacao={copy.naoConfigurado.explicacao}
          acao={{
            rotulo: copy.naoConfigurado.acao,
            endereco: copy.naoConfigurado.endereco,
          }}
        />
      )

    case 'erro':
      return (
        <CaixaDeErro>
          <p className="m-0 font-medium">{copy.erro.titulo}</p>
          <p className="mt-1.5 mb-2.5">{copy.erro.explicacao}</p>
          <a href={copy.erro.endereco} className="botao-link">
            {copy.erro.acao}
          </a>
        </CaixaDeErro>
      )

    case 'indisponivel':
      return (
        <CaixaDeErro tom="atencao">
          <p className="m-0 font-medium">{copy.indisponivel.titulo}</p>
          <p className="mt-1.5 mb-2.5">{copy.indisponivel.explicacao}</p>
          <button
            type="button"
            className="botao-secundario"
            onClick={aoTentarDeNovo}
          >
            {copy.indisponivel.acao}
          </button>
        </CaixaDeErro>
      )

    case 'conectado':
      return (
        <Catalogo
          servico={servico}
          catalogo={voz.catalogo}
          vozGravada={voz.vozEscolhida}
          ajustesGravados={voz.ajustes}
          publicacao={voz.publicacao}
          podeEscolher={podeEscolher}
        />
      )
  }
}

/** O que a audição mostra: nada pedido, a caminho, o som, ou por que não. */
type EstadoDaAudicao =
  | { tipo: 'nenhuma' }
  | { tipo: 'gerando' }
  | { tipo: 'pronta'; amostra: AmostraDaPrimeiraFala }
  | { tipo: 'pendente'; pendencia: PendenciaDaAmostra }
  | { tipo: 'falha'; motivo: MotivoDeFalhaDaSarah }

function Catalogo({
  servico,
  catalogo,
  vozGravada,
  ajustesGravados,
  publicacao,
  podeEscolher,
}: {
  servico: ServicoDaSarah
  catalogo: CatalogoDeVozes
  vozGravada: string | null
  ajustesGravados: AjustesDeVoz
  publicacao: EstadoDePublicacao
  podeEscolher: boolean
}) {
  // A carga semeia a tela uma vez. Depois de escolher, o gravado passa a ser o
  // que a tela acabou de gravar, e a consulta não é refeita: recarregar só
  // serviria para pedir o catálogo ao provedor de novo.
  //
  // O gravado se lê pelos controles da voz, com o padrão dela no que a conta
  // não mexeu: comparado cru, um `voice_settings` só com a velocidade diferiria
  // dos três controles à vista, e a tela abriria oferecendo gravar o que já
  // está gravado.
  const [inicial] = useState(() => {
    const voz = vozInicial(catalogo, vozGravada)
    const ajustes = voz ? ajustesIniciais(voz, ajustesGravados) : ajustesGravados
    return { voz, ajustes, gravada: escolhaGravada(vozGravada, ajustes) }
  })
  const [gravada, definirGravada] = useState<EscolhaDeVoz | null>(inicial.gravada)
  const [selecionada, definirSelecionada] = useState<VozDoCatalogo | null>(
    inicial.voz,
  )
  const [ajustes, definirAjustes] = useState<AjustesDeVoz>(inicial.ajustes)
  const [pedido, definirPedido] = useState<EscolhaDeVoz | null>(null)
  const [audicao, definirAudicao] = useState<EstadoDaAudicao>({ tipo: 'nenhuma' })
  const [estado, definirEstado] = useState<EstadoDePublicacao>(publicacao)
  const [gravando, definirGravando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaSarah | null>(null)
  const [salvou, definirSalvou] = useState(false)

  // Só a resposta do último pedido entra na tela: com o cursor em movimento,
  // uma síntese lenta que chega depois da rápida tocaria um ajuste que já não
  // está nos controles.
  const ultimoPedido = useRef(0)

  useEffect(() => {
    if (pedido === null) return
    const numero = ++ultimoPedido.current
    const espera = setTimeout(() => {
      definirAudicao({ tipo: 'gerando' })
      void servico.ouvirAmostra(pedido).then((resposta) => {
        if (numero !== ultimoPedido.current) return
        if (!resposta.ok) {
          definirAudicao({ tipo: 'falha', motivo: resposta.motivo })
        } else if (resposta.amostra) {
          definirAudicao({ tipo: 'pronta', amostra: resposta.amostra })
        } else if (resposta.pendencia) {
          definirAudicao({ tipo: 'pendente', pendencia: resposta.pendencia })
        } else {
          definirAudicao({ tipo: 'nenhuma' })
        }
      })
    }, ESPERA_DO_CONTROLE_MS)
    return () => clearTimeout(espera)
  }, [pedido, servico])

  const atual = selecionada ? { vozId: selecionada.id, ajustes } : null
  const mudou = atual !== null && !mesmaEscolha(atual, gravada)

  function ouvir(voz: VozDoCatalogo) {
    // Trocar de voz abre os controles no que a conta gravou para ela, senão no
    // padrão dela: o ajuste de uma voz não vale para a outra.
    const iniciais = ajustesIniciais(
      voz,
      gravada?.vozId === voz.id ? gravada.ajustes : {},
    )
    definirSelecionada(voz)
    definirAjustes(iniciais)
    definirPedido({ vozId: voz.id, ajustes: iniciais })
    definirSalvou(false)
    definirFalha(null)
  }

  function ajustar(voz: VozDoCatalogo, novos: AjustesDeVoz) {
    definirAjustes(novos)
    definirPedido({ vozId: voz.id, ajustes: novos })
    definirSalvou(false)
    definirFalha(null)
  }

  async function escolher() {
    if (atual === null) return
    definirGravando(true)
    definirFalha(null)
    const resultado = await servico.salvarVoz(atual)
    definirGravando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    definirGravada(atual)
    definirEstado(resultado.publicacao)
    definirSalvou(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <AvisoDePublicacao estado={estado} />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-md:grid-cols-1">
        <Painel titulo={copy.lista.titulo}>
          {catalogo.vozes.length ? (
            <ul
              aria-label={copy.lista.rotulo}
              className="m-0 flex list-none flex-col gap-2.5 p-0"
            >
              {catalogo.vozes.map((voz) => (
                <CartaoDaVoz
                  key={voz.id}
                  voz={voz}
                  emUso={gravada?.vozId === voz.id}
                  selecionada={selecionada?.id === voz.id}
                  aoOuvir={() => ouvir(voz)}
                />
              ))}
            </ul>
          ) : (
            <EstadoVazio
              titulo={copy.lista.vazia.titulo}
              explicacao={copy.lista.vazia.explicacao}
            />
          )}
          {catalogo.vozesIgnoradas > 0 ? (
            <p className="mt-3 mb-0 text-[12.5px] text-texto-apoio">
              {copy.lista.ignoradas(catalogo.vozesIgnoradas)}
            </p>
          ) : null}
        </Painel>

        <div className="flex min-w-0 flex-col gap-6">
          <Painel titulo={copy.amostra.titulo} apoio={copy.amostra.promessa}>
            <Audicao audicao={audicao} />
          </Painel>

          {selecionada ? (
            <Painel
              titulo={copy.ajustes.titulo}
              sobretitulo={selecionada.nome}
              apoio={copy.ajustes.explicacao}
            >
              <div className="flex flex-col gap-4">
                {selecionada.ajustesAceitos.map((ajuste) => {
                  const valor = ajustes[ajuste.nome] ?? ajuste.padrao
                  const id = `ajuste-${ajuste.nome}`
                  return (
                    <div key={ajuste.nome} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <label htmlFor={id} className="text-[13.5px] font-semibold">
                          {ajuste.rotulo}
                        </label>
                        <span className="val rounded-selo border border-borda-suave bg-superficie-funda px-2 py-0.5 text-[12px] font-bold text-menta-2">
                          {copy.ajustes.valor(valor)}
                        </span>
                      </div>
                      <input
                        id={id}
                        type="range"
                        min={ajuste.minimo}
                        max={ajuste.maximo}
                        step={ajuste.passo}
                        value={valor}
                        className="w-full cursor-pointer"
                        onChange={(evento) =>
                          ajustar(selecionada, {
                            ...ajustes,
                            [ajuste.nome]: aparar(
                              ajuste,
                              Number(evento.target.value),
                            ),
                          })
                        }
                      />
                      <p className="m-0 text-[12.5px] text-texto-apoio">
                        {ajuste.explicacao}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Painel>
          ) : null}
        </div>
      </div>

      {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="botao-primario"
          disabled={!podeEscolher || gravando || !mudou}
          onClick={() => void escolher()}
        >
          {gravando ? copy.escolher.gravando : copy.escolher.acao}
        </button>
        {salvou && !mudou ? (
          <p role="status" className="m-0 flex items-center gap-2 text-[13px] font-semibold text-positivo">
            <span aria-hidden="true" className="ao-vivo" />
            {copy.escolher.salvo}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function CartaoDaVoz({
  voz,
  emUso,
  selecionada,
  aoOuvir,
}: {
  voz: VozDoCatalogo
  emUso: boolean
  selecionada: boolean
  aoOuvir: () => void
}) {
  const genero = voz.genero ? copy.voz.generos[voz.genero] : copy.voz.semGenero
  // O catálogo escreve "Charlie - Deep, Confident, Energetic": o nome vai no
  // título, e o subtítulo desce para a linha de apoio.
  const curto = nomeCurto(voz)
  const subtitulo = voz.nome.slice(curto.length).replace(/^\s*[-–]\s*/, '').trim()

  return (
    <li
      aria-label={voz.nome}
      aria-current={selecionada ? 'true' : undefined}
      className={`bloco-secundario flex items-start justify-between gap-3 transition-[border-color,background-color,box-shadow] duration-150 ${
        selecionada
          ? 'border-acento/60 bg-acento-repouso shadow-[0_0_0_3px_var(--acento-repouso)]'
          : 'hover:border-borda-controle'
      }`}
    >
      <div className="min-w-0">
        <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-bold text-texto-principal">
          {curto}
          {emUso ? <Selo tom="positivo">{copy.lista.escolhida}</Selo> : null}
        </p>
        {subtitulo ? (
          <p className="m-0 text-[12.5px] font-semibold text-texto-secundario">{subtitulo}</p>
        ) : null}
        <p className="m-0 text-[12.5px] text-texto-apoio">
          {voz.sotaque ? `${genero} · ${voz.sotaque}` : genero}
        </p>
        {voz.descricao ? (
          <p className="mt-1 mb-0 text-[13px] text-texto-secundario">
            {voz.descricao}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="botao-secundario shrink-0 px-3 py-1.5 text-[13px]"
        aria-label={copy.voz.ouvir(voz.nome)}
        onClick={aoOuvir}
      >
        {copy.voz.ouvirCurto}
      </button>
    </li>
  )
}

/**
 * O som e o texto que ele diz, lado a lado. O texto fica à vista porque a
 * promessa da tela é "a sua abertura", e quem ouve precisa poder conferir que
 * é ela.
 */
function Audicao({ audicao }: { audicao: EstadoDaAudicao }) {
  switch (audicao.tipo) {
    case 'nenhuma':
      return (
        <p className="m-0 text-[13px] text-texto-apoio">{copy.amostra.convite}</p>
      )
    case 'gerando':
      return (
        <p role="status" className="m-0 flex items-center gap-3 text-[13px] text-texto-apoio">
          <span aria-hidden="true" className="sinal sinal-processando h-8 w-8" />
          {copy.voz.gerando}
        </p>
      )
    case 'pendente':
      return <CaixaDeErro tom="atencao">{audicao.pendencia.mensagem}</CaixaDeErro>
    case 'falha':
      return (
        <CaixaDeErro>
          {audicao.motivo === 'falha-de-comunicacao'
            ? copy.amostra.falha
            : copy.falhas[audicao.motivo]}
        </CaixaDeErro>
      )
    case 'pronta':
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="sinal sinal-falando mt-0.5 h-8 w-8" />
            <p className="m-0 rounded-cartao rounded-tl-pequeno border border-positivo-borda bg-positivo-fundo px-3.5 py-2.5 text-[13.5px] leading-relaxed text-texto-principal">
              {audicao.amostra.texto}
            </p>
          </div>
          <audio
            aria-label={copy.amostra.audio}
            controls
            autoPlay
            src={fonteDaAmostra(audicao.amostra)}
            className="w-full rounded-controle"
          />
        </div>
      )
  }
}
