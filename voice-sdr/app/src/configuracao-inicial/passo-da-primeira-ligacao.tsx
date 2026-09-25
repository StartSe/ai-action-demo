import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { criarLojaAoVivo, criarRelogio } from '@/chamadas/ao-vivo'
import { useServicoDeChamadas } from '@/chamadas/contexto'
import {
  bloqueioAntesDeDiscar,
  formatarDuracao,
  segundosDesde,
} from '@/chamadas/discador'
import { useOperacao } from '@/chamadas/operacao'
import type { ResultadoDaLigacao } from '@/chamadas/tipos'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstimativaDeCusto } from '@/componentes/estimativa-de-custo'
import { NumerosDeTeste } from '@/componentes/numeros-de-teste'
import { Seletor } from '@/componentes/seletor'
import {
  FORA_DA_JANELA,
  faseDaLigacao,
  foraDaJanelaDoTeste,
  passoQueResolve,
} from '@/configuracao-inicial/primeira-ligacao'
import { faltaParaLigar } from '@/configuracao-inicial/progresso'
import type { ConfiguracaoInicial, PassoId } from '@/configuracao-inicial/tipos'
import { aoVivo as copyDoAoVivo, discador as copyDoDiscador } from '@/copy/chamadas'
import {
  PASSOS_EM_PORTUGUES,
  configuracaoInicial as copyDaConfiguracao,
} from '@/copy/configuracao-inicial'
import { useServicoDeDiscagem } from '@/discagem/contexto'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeDefinirPoliticaDeDiscagem } from '@/equipe/papeis'
import type { NumeroDeTeste } from '@/discagem/tipos'

const copy = copyDaConfiguracao.ligacao

/** A mesma chave do cadastro: o número cadastrado aqui aparece sem recarregar. */
const CHAVE_DOS_NUMEROS = ['numeros-de-teste'] as const
/** A mesma chave de /config/discagem: ajustar a janela lá muda o aviso aqui. */
const CHAVE_DA_POLITICA = ['politica-de-discagem'] as const
/** Onde a janela se ajusta. */
const CAMINHO_DA_DISCAGEM = '/config/discagem'

/** A ficha da chamada, que tem a transcrição. */
function enderecoDaFicha(chamadaId: string): string {
  return `/chamadas/${encodeURIComponent(chamadaId)}`
}

type LigacaoProps = {
  configuracao: ConfiguracaoInicial
  aoIrPara: (passo: PassoId) => void
  aoDeclarar: (chamadaId: string) => void
}

/** O cadastro do número, se falta, ou o botão de ligar. */
/**
 * A primeira ligação de teste: sem número de teste, o cadastro de
 * `/config/discagem`; com ele, liga pelo serviço de chamadas, o mesmo do
 * discador, com o propósito de descoberta.
 */
export function Ligacao({ configuracao, aoIrPara, aoDeclarar }: LigacaoProps) {
  const discagem = useServicoDeDiscagem()
  // Cadastrar número de teste é escrita de admin, como em /config/discagem:
  // o papel vem da mesma carga (e da mesma chave) da tela de equipe.
  const equipe = useServicoDeEquipe()
  const cargaDaEquipe = useQuery({ queryKey: ['equipe'], queryFn: () => equipe.carregar() })
  const podeEditar =
    cargaDaEquipe.data?.ok === true &&
    podeDefinirPoliticaDeDiscagem(cargaDaEquipe.data.equipe.papelDoUsuario)
  const lista = useQuery({
    queryKey: CHAVE_DOS_NUMEROS,
    queryFn: () => discagem.numerosDeTeste(),
  })
  // A janela, para dizer antes do botão que a ligação de teste também a
  // respeita (D-11). Falha aqui não trava nada: a guarda decide do mesmo jeito.
  const politica = useQuery({ queryKey: CHAVE_DA_POLITICA, queryFn: () => discagem.carregar() })
  const [agora] = useState(() => new Date().toISOString())
  const carga = politica.data
  const foraDaJanela =
    carga?.ok && carga.politica
      ? foraDaJanelaDoTeste(carga.politica.janela, carga.fusoDaConta, agora)
      : null

  if (lista.isPending) return <Carregando texto={copy.carregando} />
  if (typeof lista.data === 'string' || lista.data === undefined) {
    return <CaixaDeErro>{copy.falhaDosNumeros}</CaixaDeErro>
  }

  if (lista.data.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-texto-secundario">{copy.semNumero}</p>
        <NumerosDeTeste podeEditar={podeEditar} />
      </div>
    )
  }

  return (
    <Discagem
      foraDaJanela={foraDaJanela}
      numeros={lista.data}
      falta={faltaParaLigar(configuracao)}
      aoIrPara={aoIrPara}
      aoDeclarar={aoDeclarar}
      jaDeclarada={configuracao.ligacaoDeTeste}
    />
  )
}

interface Recusa {
  mensagem: string
  alternativa: string | null
  /** O passo anterior que resolve a recusa, quando há um. */
  passo: PassoId | null
  /** Fora da janela: a recusa aponta Discagem, onde a janela se ajusta. */
  janela?: boolean
}

function novaReferencia(): string {
  return crypto.randomUUID()
}

type DiscagemProps = {
  foraDaJanela: { janela: string; abre: string | null } | null
  numeros: readonly NumeroDeTeste[]
  falta: readonly PassoId[]
  aoIrPara: (passo: PassoId) => void
  aoDeclarar: (chamadaId: string) => void
  jaDeclarada: string | null
}

/**
 * O pedido de ligação, com as travas do discador: a da tela
 * (`bloqueioAntesDeDiscar`) antes de chamar o servidor, e a chave de
 * idempotência por tentativa, com a trava do segundo clique no mesmo quadro.
 */
function Discagem({ foraDaJanela, numeros, falta, aoIrPara, aoDeclarar, jaDeclarada }: DiscagemProps) {
  const servico = useServicoDeChamadas()
  const operacao = useOperacao()

  const [idDoNumero, definirIdDoNumero] = useState<string | null>(null)
  const [referencia, definirReferencia] = useState(novaReferencia)
  const [enviando, definirEnviando] = useState(false)
  const [recusa, definirRecusa] = useState<Recusa | null>(null)
  const [chamadaId, definirChamadaId] = useState<string | null>(null)
  const emVoo = useRef(false)

  // O escolhido, se ainda estiver na lista, senão o primeiro.
  const numero = numeros.find((cada) => cada.id === idDoNumero) ?? numeros[0]
  const travado = falta.length > 0

  async function ligar() {
    if (emVoo.current || !numero || travado) return

    const bloqueio = bloqueioAntesDeDiscar(operacao.freio, operacao.papel)
    if (bloqueio) {
      definirRecusa({ ...copyDoDiscador.bloqueio[bloqueio], passo: null })
      return
    }

    emVoo.current = true
    definirEnviando(true)
    definirRecusa(null)

    let resultado: ResultadoDaLigacao
    try {
      resultado = await servico.discar({
        telefone: numero.e164,
        leadId: null,
        proposito: 'discovery',
        linhaId: null,
        referencia,
      })
    } catch {
      resultado = { ok: false, motivo: 'sem_resposta', mensagem: '', alternativa: null }
    }

    emVoo.current = false
    definirEnviando(false)
    definirReferencia(novaReferencia())
    if (resultado.ok) {
      definirChamadaId(resultado.chamadaId)
    } else {
      definirRecusa({
        mensagem: resultado.mensagem || copyDoDiscador.semResposta,
        alternativa: resultado.alternativa,
        passo: passoQueResolve(resultado.motivo),
        janela: resultado.motivo === FORA_DA_JANELA,
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {travado ? (
        <div className="rounded-cartao border border-atencao-borda bg-atencao-fundo px-4 py-3 text-[13.5px]">
          <p className="m-0 font-bold text-atencao">{copy.falta}</p>
          <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
            {falta.map((passo) => (
              <li key={passo} className="flex flex-wrap items-center gap-x-3">
                <span className="text-texto-secundario">{PASSOS_EM_PORTUGUES[passo].titulo}</span>
                <button
                  type="button"
                  className="botao-link"
                  onClick={() => aoIrPara(passo)}
                >
                  {copy.irPara(PASSOS_EM_PORTUGUES[passo].titulo)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {foraDaJanela ? (
        <div
          role="note"
          aria-label={copy.foraDaJanela.titulo}
          className="rounded-cartao border border-atencao-borda bg-atencao-fundo px-4 py-3 text-[13.5px]"
        >
          <p className="m-0 font-bold text-atencao">{copy.foraDaJanela.titulo}</p>
          <p className="mt-1 mb-0 text-texto-secundario">
            {copy.foraDaJanela.texto(foraDaJanela.janela, foraDaJanela.abre)}
          </p>
          <a href={CAMINHO_DA_DISCAGEM} className="botao-link mt-1 inline-block">
            {copy.foraDaJanela.ajustar}
          </a>
        </div>
      ) : null}

      <EstimativaDeCusto />

      <div className="flex flex-wrap items-end gap-3">
        {numeros.length > 1 ? (
          <Seletor rotulo={copy.destino} valor={numero?.id ?? ''} aoTrocar={definirIdDoNumero}>
            {numeros.map((cada) => (
              <option key={cada.id} value={cada.id}>
                {copy.destinoRotulo(cada.rotulo, cada.e164)}
              </option>
            ))}
          </Seletor>
        ) : numero ? (
          <p className="m-0 text-[13.5px] text-texto-secundario">
            {copy.destino}:{' '}
            <span className="val">{copy.destinoRotulo(numero.rotulo, numero.e164)}</span>
          </p>
        ) : null}

        {/* Iniciar ligação é o botão menta do design system. */}
        <button
          type="button"
          className="botao-menta"
          disabled={travado || enviando || !operacao.carregada}
          onClick={() => void ligar()}
        >
          {enviando ? copy.ligando : jaDeclarada || chamadaId ? copy.ligarDeNovo : copy.ligar}
        </button>
      </div>

      {recusa ? (
        <CaixaDeErro>
          <p className="m-0 font-semibold">{copyDoDiscador.recusaTitulo}</p>
          <p className="mt-1 mb-0">{recusa.mensagem}</p>
          {recusa.alternativa ? <p className="mt-1 mb-0">{recusa.alternativa}</p> : null}
          {recusa.janela ? (
            <p className="mt-1 mb-0">
              <a href={CAMINHO_DA_DISCAGEM} className="botao-link">
                {copy.foraDaJanela.ajustar}
              </a>
            </p>
          ) : null}
          {recusa.passo ? (
            <p className="mt-1 mb-0">
              {copy.resolveEm(PASSOS_EM_PORTUGUES[recusa.passo].titulo)}{' '}
              <button
                type="button"
                className="botao-link"
                onClick={() => {
                  if (recusa.passo) aoIrPara(recusa.passo)
                }}
              >
                {copy.irPara(PASSOS_EM_PORTUGUES[recusa.passo].titulo)}
              </button>
            </p>
          ) : null}
        </CaixaDeErro>
      ) : null}

      {/* A ligação declarada de uma visita anterior. A desta visita aparece
          no acompanhamento, com o mesmo endereço. */}
      {jaDeclarada && !chamadaId ? (
        <p role="status" className="m-0 text-[13px] text-texto-secundario">
          {copy.feita}{' '}
          <a href={enderecoDaFicha(jaDeclarada)} className="botao-link">
            {copy.abrirFicha}
          </a>
        </p>
      ) : null}

      {/* Uma chave por ligação: a acompanhada é sempre a última que saiu. */}
      {chamadaId ? (
        <Acompanhamento
          key={chamadaId}
          chamadaId={chamadaId}
          jaDeclarada={jaDeclarada === chamadaId}
          aoEncerrar={aoDeclarar}
        />
      ) : null}
    </div>
  )
}

type AcompanhamentoProps = {
  chamadaId: string
  jaDeclarada: boolean
  aoEncerrar: (chamadaId: string) => void
}

/**
 * O andamento da ligação, pela mesma assinatura de `call_live` que o painel
 * usa. Quando a chamada sai da lista, ela acabou: o passo mostra a ficha e
 * declara a ligação feita, uma vez só.
 */
function Acompanhamento({ chamadaId, jaDeclarada, aoEncerrar }: AcompanhamentoProps) {
  const servico = useServicoDeChamadas()
  const loja = useMemo(() => criarLojaAoVivo(servico), [servico])
  const estado = useSyncExternalStore(loja.assinar, loja.ler)
  const fase = faseDaLigacao(estado, chamadaId)
  const encerrada = fase.fase === 'encerrada'

  // A declaração é gravação no servidor, e não estado da tela: por isso o
  // efeito, e a trava para o desenho seguinte não gravar de novo.
  const declarada = useRef(jaDeclarada)
  useEffect(() => {
    if (!encerrada || declarada.current) return
    declarada.current = true
    aoEncerrar(chamadaId)
  }, [encerrada, chamadaId, aoEncerrar])

  if (fase.fase === 'conectando') return <Carregando texto={copy.conectando} />
  if (fase.fase === 'erro') return <CaixaDeErro tom="atencao">{copy.erroAoVivo}</CaixaDeErro>

  if (fase.fase === 'em-curso') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-cartao border border-positivo-borda bg-positivo-fundo px-4 py-2.5 text-[13.5px]">
        <span className="flex items-center gap-2 font-bold text-texto-principal">
          <span aria-hidden="true" className="ao-vivo" />
          {copy.emCurso}
        </span>
        <span className="text-texto-secundario">
          {copyDoAoVivo.status[fase.chamada.status] ?? fase.chamada.status}
        </span>
        <Duracao iniciadaEm={fase.chamada.iniciadaEm} />
      </div>
    )
  }

  return (
    <div role="status" className="bloco-secundario px-4 py-3 text-[13.5px]">
      <p className="m-0 text-texto-secundario">{copy.encerrada}</p>
      <a href={enderecoDaFicha(chamadaId)} className="botao-link mt-1.5 inline-block">
        {copy.abrirFicha}
      </a>
    </div>
  )
}

function Duracao({ iniciadaEm }: { iniciadaEm: string }) {
  const relogio = useMemo(() => criarRelogio(), [])
  const agora = useSyncExternalStore(relogio.assinar, relogio.ler)
  return (
    <span className="val" aria-label={copy.duracao}>
      {formatarDuracao(segundosDesde(iniciadaEm, agora))}
    </span>
  )
}
