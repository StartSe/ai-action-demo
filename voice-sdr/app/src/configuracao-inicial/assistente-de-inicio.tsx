import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { ContextoDoNegocio, SugestaoDaEtapa } from '@sugestoes/sugestoes.ts'

import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { MarcaDoProduto } from '@/componentes/marca-do-produto'
import {
  camposObrigatorios,
  completarObrigatorios,
  faltaParaAplicar,
  type SugestoesRevisadas,
} from '@/configuracao-inicial/aplicacao-das-sugestoes'
import { EntrevistaComASarah } from '@/configuracao-inicial/entrevista-com-a-sarah'
import { EscolhaDeVoz, type VozDaEscolha } from '@/configuracao-inicial/escolha-de-voz'
import { VOZES_DE_EXEMPLO } from '@/configuracao-inicial/vozes-de-exemplo-geradas'
import { ResumoDaConfiguracao } from '@/configuracao-inicial/resumo-da-configuracao'
import { useServicoDaConta } from '@/conta/contexto'
import { useServicoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import { useTextosDoInicio } from '@/configuracao-inicial/textos'
import {
  EtapaDaLigacao,
  EtapaDePublicar,
  EtapaDoNumero,
  EtapaPronta,
} from '@/configuracao-inicial/etapas-finais'
import { Selo } from '@/componentes/selo'
import {
  ETAPAS_DO_INICIO,
  contextoPronto,
  etapaInicial,
  faltaNaDescricao,
  lerVoltaDoOAuth,
  medicaoDaConfiguracao,
  podeSeguir,
  sarahNoAr,
  posicaoDaEtapa,
  vizinhaNestaVisita,
  type ConexoesDoInicio,
  type EtapaDoInicio,
} from '@/configuracao-inicial/inicio'
import { inicio as copy } from '@/copy/inicio'
import { PERMISSOES_DA_ELEVENLABS, textoDaInstrucao } from '@/copy/instrucoes-das-chaves'
import { useServicoDeIntegracoes } from '@/integracoes/contexto'
import type { ProvedorId } from '@/integracoes/tipos'
import { useServicoDaSarah } from '@/sarah/contexto'
import type { CondutorDeConversa } from '@/sarah/ensaio'
import { esquecerMarca, guardarMarca, lerMarcaGuardada } from '@/sarah/modelo'
import { CHAVE_DA_IDENTIDADE, nomeDaCarga, useNomeDaAssistente } from '@/sarah/nome-da-assistente'
import { useServicoDeWhatsapp } from '@/whatsapp/contexto'

type AssistenteDeInicioProps = {
  /** A pessoa chegou ao fim e foi para o painel. */
  aoConcluir: () => void
  /** A pessoa fechou no meio. Ele reabre onde parou na próxima entrada. */
  aoPular: () => void
  /**
   * Chamado a cada clique dentro do assistente. A rota usa para mantê-lo
   * aberto depois que a telefonia resolve o passo de credenciais, que é o que
   * o faria sumir no meio do caminho.
   */
  aoInteragir?: () => void
  /**
   * Quem conduz a conversa por voz, como no ensaio. Sem ele, a etapa do
   * negócio oferece só o formulário.
   */
  condutor?: CondutorDeConversa
}

const CONTEXTO_VAZIO: ContextoDoNegocio = { empresa: '', descricao: '', bomCliente: '' }

/**
 * O assistente de abertura, que é o tutorial inteiro, num cartão no meio da
 * tela. O nome vem primeiro, e daí em diante o texto chama a assistente por
 * ele. Modelo, voz e telefonia conectam os provedores; negócio pede o
 * contexto; sugestões mostra o que a IA propôs, e o resumo o aplica; publicar,
 * número e primeira ligação põem a assistente no ar. Ele abre na primeira coisa
 * que falta, medida no banco, para quem volta continuar de onde parou.
 *
 * Não usa `<dialog>`: `showModal` não existe em jsdom (docs/PRD-implementacao.md
 * seção 9.1), a mesma razão de `Dialogo`.
 */
export function AssistenteDeInicio({
  aoConcluir,
  aoPular,
  aoInteragir,
  condutor,
}: AssistenteDeInicioProps) {
  const sarah = useServicoDaSarah()
  const integracoes = useServicoDeIntegracoes()
  // O texto chama a assistente pelo nome gravado, e a medição usa o mesmo nome.
  const copy = useTextosDoInicio()
  const identidade = useQuery({ queryKey: CHAVE_DA_IDENTIDADE, queryFn: () => sarah.carregarIdentidade() })
  const nomeGravado = nomeDaCarga(identidade.data)

  // As mesmas chaves das telas de integrações: gravar aqui atualiza lá.
  const modelo = useQuery({ queryKey: ['modelo-da-sarah'], queryFn: () => sarah.carregarModelo() })
  const provedores = useQuery({ queryKey: ['integracoes'], queryFn: () => integracoes.carregar() })
  const servicoDaConfiguracao = useServicoDeConfiguracaoInicial()
  const cargaDaConfiguracao = useQuery({
    queryKey: ['configuracao-inicial'],
    queryFn: () => servicoDaConfiguracao.carregar(),
  })
  const configuracao = cargaDaConfiguracao.data?.ok ? cargaDaConfiguracao.data.configuracao : null
  // O roteiro só conta como feito com a Sarah montada no provedor: publicado
  // no banco e recusado lá, o tutorial ainda para na publicação.
  const playbooks = useQuery({ queryKey: ['sarah-playbooks'], queryFn: () => sarah.carregarPlaybooks() })
  const medido = medicaoDaConfiguracao(configuracao, nomeGravado)
  const medicao = { ...medido, roteiro: medido.roteiro && sarahNoAr(playbooks.data) }

  const [volta] = useState(() => lerVoltaDoOAuth(window.location.search))
  const [escolhida, definirEscolhida] = useState<EtapaDoInicio | null>(null)
  const [contextoEscrito, definirContexto] = useState<ContextoDoNegocio>(CONTEXTO_VAZIO)
  // A empresa nasce com a que já foi gravada, senão com o nome da conta da
  // fundação (D-10): a pessoa já disse, e não precisa dizer de novo. O valor à
  // vista se deriva enquanto ela não mexeu no campo; depois vale o escrito.
  const conta = useServicoDaConta()
  const nomeDaConta = useQuery({ queryKey: ['nome-da-conta'], queryFn: () => conta.carregarNomeDaConta() })
  const [empresaTocada, definirEmpresaTocada] = useState(false)
  const empresaGravada = identidade.data?.ok ? (identidade.data.sarah.identidade?.empresa.trim() ?? '') : ''
  const contexto: ContextoDoNegocio = empresaTocada
    ? contextoEscrito
    : { ...contextoEscrito, empresa: empresaGravada || nomeDaConta.data || '' }
  function mudarContexto(novo: ContextoDoNegocio) {
    if (novo.empresa !== contexto.empresa) definirEmpresaTocada(true)
    definirContexto(novo)
  }
  const [sugestoes, definirSugestoes] = useState<readonly SugestaoDaEtapa[] | null>(null)
  const [revisadas, definirRevisadas] = useState<SugestoesRevisadas | null>(null)
  // A voz vale já na entrevista e é gravada no resumo, depois da identidade:
  // antes dela a assistente da conta ainda não tem empresa para ir ao ar.
  const [vozEscolhida, definirVoz] = useState<VozDaEscolha | null>(null)
  // A voz que a conta já gravou, quando é uma das seis, vem marcada.
  const vozDaConta = useQuery({ queryKey: ['sarah-voz'], queryFn: () => sarah.carregarVoz() })
  const idGravado = vozDaConta.data?.ok ? vozDaConta.data.voz.vozEscolhida : null
  const catalogoDaConta = vozDaConta.data?.ok ? vozDaConta.data.voz.catalogo.vozes : []
  const voz: VozDaEscolha | null =
    vozEscolhida ??
    VOZES_DE_EXEMPLO.find((item) => item.id === idGravado) ??
    catalogoDaConta.find((item) => item.id === idGravado) ??
    null

  // A página atrás não rola enquanto o assistente estiver aberto.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  const lista = provedores.data?.ok ? provedores.data.integracoes : []
  const conexoes: ConexoesDoInicio = {
    modelo: modelo.data?.ok === true && modelo.data.estado.porta === 'openrouter',
    voz: lista.some((item) => item.provedor === 'voz' && item.estado === 'conectado'),
    telefonia: lista.some((item) => item.provedor === 'telefonia' && item.estado === 'conectado'),
  }

  const carregando =
    modelo.isPending ||
    provedores.isPending ||
    cargaDaConfiguracao.isPending ||
    playbooks.isPending ||
    identidade.isPending
  // A volta do OAuth abre no modelo, que é quem sabe concluí-la.
  const etapa = escolhida ?? (volta ? 'modelo' : etapaInicial(conexoes, medicao))
  const temSugestoes = sugestoes !== null
  const anterior = vizinhaNestaVisita(etapa, -1, temSugestoes)
  const seguinte = vizinhaNestaVisita(etapa, 1, temSugestoes)
  const larga =
    etapa === 'sugestoes' || etapa === 'resumo' || etapa === 'numero' || etapa === 'ligacao'

  return (
    <div className="veu z-40 max-md:px-3 max-md:py-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.rotulo}
        onClickCapture={() => {
          aoInteragir?.()
          // O primeiro clique fixa a etapa: sem isto, conectar a voz faria a
          // etapa recalculada saltar sozinha para a telefonia, antes de a
          // pessoa ver que a voz conectou.
          if (escolhida === null) definirEscolhida(etapa)
        }}
        className={`caixa-de-dialogo flex max-h-full w-full flex-col overflow-hidden rounded-maior bg-superficie-cartao bg-[image:var(--gradiente-cartao)] transition-[max-width] duration-500 ease-out max-md:rounded-grande ${
          larga ? 'max-w-[780px]' : 'max-w-[520px]'
        }`}
      >
        <header className="px-6 pt-6 max-md:px-4 max-md:pt-4">
          <div className="flex items-start justify-between gap-4">
            <p className="sobretitulo m-0">{copy.rotulo}</p>
            <p className="val m-0 text-[11.5px] text-texto-apoio">
              {copy.contagem(posicaoDaEtapa(etapa), ETAPAS_DO_INICIO.length)}
            </p>
          </div>
          <BarraDeEtapas atual={etapa} />
        </header>

        <div key={etapa} className="surgir min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-3 max-md:px-4">
          <h2 className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.03em] text-texto-principal max-md:text-[20px]">
            {copy.etapas[etapa].titulo}
          </h2>
          <p className="mt-2 mb-5 text-[13px] leading-relaxed text-texto-apoio">{copy.etapas[etapa].frase}</p>

          {carregando ? (
            <Carregando texto={copy.carregando} />
          ) : etapa === 'boasVindas' ? (
            <BoasVindas />
          ) : etapa === 'nome' ? (
            <EtapaDoNome
              nome={nomeGravado}
              aoGravar={() => {
                const depois = vizinhaNestaVisita('nome', 1, temSugestoes)
                if (depois) definirEscolhida(depois)
              }}
            />
          ) : etapa === 'plano' ? (
            <Plano />
          ) : etapa === 'modelo' ? (
            <EtapaDoModelo conectado={conexoes.modelo} volta={volta} />
          ) : etapa === 'voz' ? (
            <>
              <EtapaDeChave provedor="voz" />
              {conexoes.voz ? <EscolhaDeVoz escolhida={voz} aoEscolher={definirVoz} /> : null}
            </>
          ) : etapa === 'telefonia' ? (
            <EtapaDeChave provedor="telefonia" />
          ) : etapa === 'whatsapp' ? (
            <EtapaDoWhatsapp />
          ) : etapa === 'negocio' ? (
            <EtapaDoNegocio
              condutor={condutor}
              voz={voz}
              contexto={contexto}
              aoMudar={mudarContexto}
              aoGerar={(geradas) => {
                definirSugestoes(geradas)
                definirEscolhida('sugestoes')
              }}
            />
          ) : etapa === 'resumo' && revisadas ? (
            <ResumoDaConfiguracao
              revisadas={revisadas}
              aoSeguir={() => definirEscolhida('publicar')}
              aoRevisar={() => definirEscolhida('sugestoes')}
            />
          ) : etapa === 'publicar' ? (
            <EtapaDePublicar
              aoVoltarAoNegocio={() => definirEscolhida('negocio')}
              aoIrPara={definirEscolhida}
              temRevisao={revisadas !== null}
            />
          ) : etapa === 'numero' ? (
            <EtapaDoNumero configuracao={configuracao} />
          ) : etapa === 'ligacao' ? (
            <EtapaDaLigacao configuracao={configuracao} aoIrPara={definirEscolhida} />
          ) : etapa === 'pronto' ? (
            <EtapaPronta configuracao={configuracao} />
          ) : etapa === 'sugestoes' && sugestoes ? (
            <EtapaDasSugestoes
              contexto={contexto}
              sugestoes={sugestoes}
              iniciais={revisadas}
              aoRefazer={() => definirEscolhida('negocio')}
              aoAplicar={(revisao) => {
                definirRevisadas({ ...revisao, voz })
                definirEscolhida('resumo')
              }}
            />
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-borda-suave bg-superficie-funda/40 px-6 py-4 max-md:px-4 max-md:py-3.5">
          {anterior && etapa !== 'resumo' ? (
            <button type="button" onClick={() => definirEscolhida(anterior)} className="botao-secundario">
              {copy.voltar}
            </button>
          ) : null}
          {etapa !== 'resumo' && etapa !== 'pronto' ? (
            <button type="button" onClick={aoPular} className="botao-fantasma">
              {copy.pular}
            </button>
          ) : null}
          {etapa === 'pronto' ? (
            <button type="button" onClick={aoConcluir} className="botao-primario ml-auto">
              {copy.pronto.concluir}
            </button>
          ) : seguinte &&
            etapa !== 'sugestoes' &&
            etapa !== 'resumo' &&
            // O nome segue pelo botão de gravar, que é quem o grava.
            etapa !== 'nome' &&
            (etapa !== 'negocio' || medicao.agente) ? (
            <button
              type="button"
              disabled={!podeSeguir(etapa, conexoes, voz !== null, medicao)}
              onClick={() => definirEscolhida(seguinte)}
              className="botao-primario ml-auto"
            >
              {etapa === 'boasVindas' ? copy.boasVindas.comecar : copy.seguir}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}

function BoasVindas() {
  const copy = useTextosDoInicio()
  return (
    <div className="flex flex-col gap-5">
      <MarcaDoProduto />
      <p className="m-0 text-[15px] leading-relaxed text-texto-secundario">
        {copy.boasVindas.potencial}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {copy.boasVindas.destaques.map((destaque, indice) => (
          <li
            key={destaque}
            className="surgir flex items-center gap-3 rounded-controle border border-borda-suave bg-superficie-funda/50 px-3.5 py-2.5 text-[13.5px] font-semibold text-texto-principal"
            style={{ animationDelay: `${200 + indice * 140}ms` }}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-[image:var(--gradiente-sinal)]"
            />
            {destaque}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A primeira pergunta: como a assistente se apresenta. O campo nasce vazio de
 * propósito (a assistente não tem nome de fábrica), e gravar segue para a
 * próxima etapa. Com nome já gravado, o campo o mostra para trocar.
 */
function EtapaDoNome({ nome, aoGravar }: { nome: string | null; aoGravar: () => void }) {
  const sarah = useServicoDaSarah()
  const cliente = useQueryClient()
  // `null` é "ainda não tocado": o valor à vista é o gravado até a pessoa escrever.
  const [escrito, definirEscrito] = useState<string | null>(null)
  const [salvando, definirSalvando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)
  const valor = escrito ?? nome ?? ''

  async function salvar() {
    if (valor.trim() === '') {
      definirErro(copy.nome.falta)
      return
    }
    definirSalvando(true)
    definirErro(null)
    const gravacao = await sarah.salvarNome(valor)
    definirSalvando(false)
    if (!gravacao.ok) {
      definirErro(gravacao.motivo === 'sem-permissao' ? copy.nome.semPermissao : copy.nome.falha)
      return
    }
    await cliente.invalidateQueries({ queryKey: CHAVE_DA_IDENTIDADE })
    aoGravar()
  }

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        void salvar()
      }}
      className="flex flex-col gap-3.5"
    >
      <p className="m-0 text-[13.5px] leading-relaxed text-texto-secundario">{copy.nome.porQue}</p>
      <CampoDeTexto
        rotulo={copy.nome.rotulo}
        placeholder={copy.nome.exemplo}
        autoComplete="off"
        value={valor}
        onChange={(evento) => definirEscrito(evento.target.value)}
      />
      {erro ? (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}
      <button type="submit" disabled={salvando || valor.trim() === ''} className="botao-primario self-end">
        {salvando ? copy.nome.salvando : copy.nome.salvar}
      </button>
    </form>
  )
}

function Plano() {
  const copy = useTextosDoInicio()
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {copy.plano.itens.map((item, indice) => (
        <li
          key={item.titulo}
          className="surgir flex items-start gap-3.5 rounded-cartao border border-borda-suave bg-superficie-funda/50 px-4 py-3"
          style={{ animationDelay: `${100 + indice * 110}ms` }}
        >
          <span className="val grid h-7 w-7 shrink-0 place-items-center rounded-full border border-acento/25 bg-acento-repouso text-[12px] font-bold text-acento-tinta">
            {indice + 1}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[14px] font-bold text-texto-principal">{item.titulo}</p>
            <p className="mt-0.5 mb-0 text-[12.5px] leading-snug text-texto-apoio">{item.frase}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** A barra: um segmento por etapa, cheio até a atual. Sem índice escrito. */
function BarraDeEtapas({ atual }: { atual: EtapaDoInicio }) {
  const posicao = posicaoDaEtapa(atual)
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={ETAPAS_DO_INICIO.length}
      aria-valuenow={posicao}
      aria-label={copy.rotulo}
      className="mt-3.5 flex gap-1.5 max-md:gap-1"
    >
      {ETAPAS_DO_INICIO.map((etapa, indice) => (
        <span
          key={etapa}
          className={`h-1.5 flex-1 rounded-selo transition-colors duration-500 ${
            indice < posicao ? 'bg-[image:var(--gradiente-progresso)]' : 'bg-superficie-3'
          }`}
        />
      ))}
    </div>
  )
}

function EtapaDoModelo({
  conectado,
  volta,
}: {
  conectado: boolean
  volta: { codigo: string; estado: string | null } | null
}) {
  const sarah = useServicoDaSarah()
  const cliente = useQueryClient()
  const [emCurso, definirEmCurso] = useState<string | null>(null)
  const [erro, definirErro] = useState<string | null>(null)
  const [voltaTratada, definirVoltaTratada] = useState(false)
  const concluindo = volta !== null && !voltaTratada

  // A volta do OAuth, uma vez só: conclui, limpa a barra de endereço e mede de
  // novo. A recusa entra por promessa, porque escrever estado direto no corpo
  // do efeito dispara renderização em cascata.
  useEffect(() => {
    if (!volta) return
    let ativo = true
    const marca = volta.estado ?? lerMarcaGuardada()
    const passo = marca
      ? sarah.concluirConexaoDoModelo(volta.codigo, marca)
      : Promise.resolve({ ok: false as const, mensagem: copy.modelo.voltaSemMarca })
    void passo.then((resultado) => {
      if (!ativo) return
      esquecerMarca()
      window.history.replaceState(null, '', window.location.pathname)
      definirVoltaTratada(true)
      if (resultado.ok) void cliente.invalidateQueries({ queryKey: ['modelo-da-sarah'] })
      else definirErro(resultado.mensagem)
    })
    return () => {
      ativo = false
    }
  }, [volta, sarah, cliente])

  async function conectar() {
    definirEmCurso(copy.modelo.conectando)
    definirErro(null)
    const retorno = `${window.location.origin}${window.location.pathname}`
    const resultado = await sarah.iniciarConexaoDoModelo(retorno)
    if (!resultado.ok) {
      definirEmCurso(null)
      definirErro(resultado.mensagem)
      return
    }
    guardarMarca(resultado.url)
    window.location.assign(resultado.url)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie-funda/50 px-4 py-3.5 max-md:flex-wrap">
        <div className="min-w-0">
          <p className="m-0 text-[14px] font-bold text-texto-principal">{copy.modelo.openrouter}</p>
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.modelo.openrouterApoio}</p>
        </div>
        {conectado ? (
          <Selo tom="positivo">{copy.modelo.conectado}</Selo>
        ) : (
          <button
            type="button"
            onClick={() => void conectar()}
            disabled={emCurso !== null || concluindo}
            className="botao-primario"
          >
            {concluindo ? copy.modelo.concluindo : (emCurso ?? copy.modelo.conectar)}
          </button>
        )}
      </div>

      <div
        aria-disabled="true"
        className="flex items-center justify-between gap-3 rounded-cartao border border-dashed border-borda px-4 py-3.5 opacity-70 max-md:flex-wrap"
      >
        <div className="min-w-0">
          <p className="m-0 text-[14px] font-semibold text-texto-secundario">{copy.modelo.chatgpt}</p>
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.modelo.chatgptApoio}</p>
        </div>
        <Selo tom="neutro">{copy.modelo.emBreve}</Selo>
      </div>

      {erro ? (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

function EtapaDeChave({ provedor }: { provedor: Extract<ProvedorId, 'voz' | 'telefonia'> }) {
  const servico = useServicoDeIntegracoes()
  const cliente = useQueryClient()
  const carga = useQuery({ queryKey: ['integracoes'], queryFn: () => servico.carregar() })
  const [valores, definirValores] = useState<Record<string, string>>({})
  const [salvando, definirSalvando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)

  const integracao = carga.data?.ok
    ? carga.data.integracoes.find((item) => item.provedor === provedor)
    : undefined
  if (!integracao) {
    return (
      <p role="alert" className="m-0 text-[12.5px] text-perigo">
        {copy.chave.falha}
      </p>
    )
  }
  const conectado = integracao.estado === 'conectado'

  async function salvar() {
    definirSalvando(true)
    definirErro(null)
    // Campo em branco é "não mexi", como na tela de integrações.
    const preenchidos = Object.fromEntries(
      Object.entries(valores).filter(([, valor]) => valor.trim() !== ''),
    )
    const gravacao = await servico.salvar(provedor, preenchidos)
    if (!gravacao.ok) {
      definirSalvando(false)
      definirErro(copy.chave.falha)
      return
    }
    const teste = await servico.testar(provedor)
    definirSalvando(false)
    if (!teste.ok) {
      definirErro(copy.chave.falha)
      return
    }
    if (teste.integracao.estado !== 'conectado') {
      definirErro(teste.integracao.erro?.mensagem ?? copy.chave.recusada)
    } else {
      definirValores({})
    }
    await cliente.invalidateQueries({ queryKey: ['integracoes'] })
  }

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        void salvar()
      }}
      className="flex flex-col gap-3.5"
    >
      {integracao.chaves.map((chave) => (
        <CampoDeTexto
          key={chave.nome}
          rotulo={chave.rotulo}
          apoio={textoDaInstrucao(provedor, chave.nome)}
          type="password"
          autoComplete="off"
          placeholder={chave.preenchida ? '••••••••' : undefined}
          value={valores[chave.nome] ?? ''}
          onChange={(evento) =>
            definirValores((atuais) => ({ ...atuais, [chave.nome]: evento.target.value }))
          }
        />
      ))}

      {provedor === 'voz' ? (
        <div className="bloco-secundario flex flex-col gap-1.5 px-4 py-3">
          <p className="m-0 text-[12.5px] font-semibold">{copy.chave.permissoesDaVoz}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[12.5px] text-texto-apoio">
            {PERMISSOES_DA_ELEVENLABS.map((permissao) => (
              <li key={permissao}>{permissao}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={copy.chave.ondeAcharEndereco[provedor]}
          target="_blank"
          rel="noreferrer"
          className="botao-link"
        >
          {copy.chave.ondeAchar}
        </a>
        {conectado && Object.values(valores).every((valor) => valor.trim() === '') ? (
          <Selo tom="positivo">{copy.chave.conectado}</Selo>
        ) : (
          <button type="submit" disabled={salvando} className="botao-primario">
            {salvando ? copy.chave.salvando : copy.chave.salvar}
          </button>
        )}
      </div>

      {erro ? (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}
    </form>
  )
}

/**
 * O passo opcional do canal de WhatsApp (Z-API), logo depois da telefonia.
 * "Seguir" avança sem exigir a chave (`podeSeguir('whatsapp', ...)` é sempre
 * verdadeiro); quem preenche e salva também aciona `whatsapp-connect`, como
 * `/config/integracoes` faz para este provedor.
 */
function EtapaDoWhatsapp() {
  const servico = useServicoDeIntegracoes()
  const whatsapp = useServicoDeWhatsapp()
  const cliente = useQueryClient()
  const carga = useQuery({ queryKey: ['integracoes'], queryFn: () => servico.carregar() })
  const [valores, definirValores] = useState<Record<string, string>>({})
  const [salvando, definirSalvando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)
  const [conectado, definirConectado] = useState<string | null>(null)

  const integracao = carga.data?.ok
    ? carga.data.integracoes.find((item) => item.provedor === 'whatsapp')
    : undefined

  if (!integracao) {
    return <p className="m-0 text-[13px] text-texto-apoio">{copy.whatsappOpcional.aviso}</p>
  }

  async function salvar() {
    definirSalvando(true)
    definirErro(null)
    definirConectado(null)
    const preenchidos = Object.fromEntries(
      Object.entries(valores).filter(([, valor]) => valor.trim() !== ''),
    )
    const gravacao = await servico.salvar('whatsapp', preenchidos)
    if (!gravacao.ok) {
      definirSalvando(false)
      definirErro(copy.chave.falha)
      return
    }
    await servico.testar('whatsapp')
    const resultado = await whatsapp.conectar()
    definirSalvando(false)
    if (resultado.ok) {
      definirValores({})
      definirConectado(resultado.mensagem || copy.whatsappOpcional.conectado)
    } else {
      definirErro(resultado.mensagem || copy.whatsappOpcional.falhaAoConectar)
    }
    await cliente.invalidateQueries({ queryKey: ['integracoes'] })
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-[13px] text-texto-apoio">{copy.whatsappOpcional.aviso}</p>
      <p className="m-0 text-[13px] text-texto-apoio">{copy.whatsappOpcional.modoDeTeste}</p>

      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          void salvar()
        }}
        className="flex flex-col gap-3.5"
      >
        {integracao.chaves.map((chave) => (
          <CampoDeTexto
            key={chave.nome}
            rotulo={chave.rotulo}
            apoio={textoDaInstrucao('whatsapp', chave.nome)}
            type="password"
            autoComplete="off"
            placeholder={chave.preenchida ? '••••••••' : undefined}
            value={valores[chave.nome] ?? ''}
            onChange={(evento) =>
              definirValores((atuais) => ({ ...atuais, [chave.nome]: evento.target.value }))
            }
          />
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={copy.chave.ondeAcharEndereco.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="botao-link"
          >
            {copy.chave.ondeAchar}
          </a>
          <button type="submit" disabled={salvando} className="botao-primario">
            {salvando ? copy.whatsappOpcional.conectando : copy.chave.salvar}
          </button>
        </div>

        {erro ? (
          <p role="alert" className="m-0 text-[12.5px] text-perigo">
            {erro}
          </p>
        ) : null}
        {conectado ? (
          <p role="status" className="m-0 text-[12.5px] font-semibold text-positivo">
            {conectado}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function EtapaDoNegocio({
  condutor,
  voz,
  contexto,
  aoMudar,
  aoGerar,
}: {
  condutor?: CondutorDeConversa
  voz: VozDaEscolha | null
  contexto: ContextoDoNegocio
  aoMudar: (contexto: ContextoDoNegocio) => void
  aoGerar: (sugestoes: readonly SugestaoDaEtapa[]) => void
}) {
  const sarah = useServicoDaSarah()
  const copy = useTextosDoInicio()
  const [gerando, definirGerando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)
  // Com condutor, a conversa é a primeira escolha; o formulário continua ali.
  const [modo, definirModo] = useState<'escolha' | 'entrevista' | 'escrever'>(
    condutor ? 'escolha' : 'escrever',
  )
  const falta = faltaNaDescricao(contexto)

  if (condutor && modo === 'escolha') {
    return (
      <div className="flex flex-col gap-2.5">
        {/* A conversa é a escolha recomendada, e por isso já vem em destaque. */}
        <button
          type="button"
          onClick={() => definirModo('entrevista')}
          className="cartao-de-escolha cartao-de-escolha-ativo"
        >
          <span aria-hidden="true" className="sinal h-[52px] w-[52px]" />
          <span className="min-w-0">
            <span className="block text-[14px] font-extrabold text-texto-principal">
              {copy.entrevista.conversar}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-texto-apoio">
              {copy.entrevista.conversarApoio}
            </span>
          </span>
        </button>
        <button type="button" onClick={() => definirModo('escrever')} className="cartao-de-escolha">
          <span className="min-w-0">
            <span className="block text-[14px] font-extrabold text-texto-principal">
              {copy.entrevista.escrever}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-texto-apoio">
              {copy.entrevista.escreverApoio}
            </span>
          </span>
        </button>
      </div>
    )
  }

  if (condutor && modo === 'entrevista') {
    return (
      <EntrevistaComASarah
        condutor={condutor}
        voz={voz}
        aoGerar={aoGerar}
        aoEscrever={() => definirModo('escrever')}
        espera={<Gerando />}
      />
    )
  }

  async function gerar() {
    definirGerando(true)
    definirErro(null)
    const resultado = await sarah.sugerirConfiguracao(contexto)
    definirGerando(false)
    if (resultado.ok) aoGerar(resultado.etapas)
    else definirErro(resultado.mensagem ?? copy.chave.falha)
  }

  if (gerando) return <Gerando />

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        if (contextoPronto(contexto)) void gerar()
      }}
      className="flex flex-col gap-3.5"
    >
      <CampoDeTexto
        rotulo={copy.negocio.empresa.rotulo}
        placeholder={copy.negocio.empresa.exemplo}
        value={contexto.empresa}
        onChange={(evento) => aoMudar({ ...contexto, empresa: evento.target.value })}
      />
      <CampoDeTextoLongo
        rotulo={copy.negocio.descricao.rotulo}
        placeholder={copy.negocio.descricao.exemplo}
        rows={3}
        value={contexto.descricao}
        apoio={falta > 0 && contexto.descricao !== '' ? copy.negocio.curta(falta) : undefined}
        onChange={(evento) => aoMudar({ ...contexto, descricao: evento.target.value })}
      />
      <CampoDeTextoLongo
        rotulo={copy.negocio.bomCliente.rotulo}
        placeholder={copy.negocio.bomCliente.exemplo}
        rows={2}
        value={contexto.bomCliente}
        onChange={(evento) => aoMudar({ ...contexto, bomCliente: evento.target.value })}
      />

      {erro ? (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}

      <button type="submit" disabled={!contextoPronto(contexto)} className="botao-primario self-end">
        {copy.negocio.gerar}
      </button>
    </form>
  )
}

/**
 * A espera: o sinal da IA processando, os pontos pensando e a frase que troca
 * enquanto o modelo escreve.
 */
function Gerando() {
  const [indice, definirIndice] = useState(0)

  useEffect(() => {
    const relogio = window.setInterval(
      () => definirIndice((atual) => (atual + 1) % copy.gerando.length),
      1800,
    )
    return () => window.clearInterval(relogio)
  }, [])

  return (
    <div role="status" className="flex flex-col items-center gap-5 py-10">
      <span aria-hidden="true" className="sinal sinal-processando h-16 w-16" />
      <span aria-hidden="true" className="pontos-pensando">
        <span />
        <span />
        <span />
      </span>
      <p key={indice} className="trocar-frase m-0 text-center text-[14px] font-semibold text-texto-secundario">
        {copy.gerando[indice]}
      </p>
    </div>
  )
}

function EtapaDasSugestoes({
  contexto,
  sugestoes,
  iniciais = null,
  aoRefazer,
  aoAplicar,
}: {
  contexto: ContextoDoNegocio
  sugestoes: readonly SugestaoDaEtapa[]
  /** A revisão anterior, na volta do resumo: o que foi escrito continua ali. */
  iniciais?: SugestoesRevisadas | null
  aoRefazer: () => void
  aoAplicar: (revisadas: SugestoesRevisadas) => void
}) {
  const copy = useTextosDoInicio()
  // O nome gravado na primeira pergunta não volta como campo da revisão.
  const nomeGravado = useNomeDaAssistente()
  const [etapas] = useState(() =>
    completarObrigatorios(iniciais?.sugestoes ?? sugestoes, contexto, nomeGravado),
  )
  const [valores, definirValores] = useState<Record<string, string>>(() =>
    iniciais ? { ...iniciais.valores } : Object.fromEntries(
      etapas.flatMap((etapa) =>
        etapa.campos.map((campo) => [`${etapa.etapa}.${campo.campo}`, campo.valor]),
      ),
    ),
  )
  const [respostas, definirRespostas] = useState<Record<string, string>>(() => ({
    ...(iniciais?.respostas ?? {}),
  }))
  const faltam = faltaParaAplicar(valores, nomeGravado)
  const obrigatorios = new Set<string>(camposObrigatorios(nomeGravado))

  function concluir() {
    // Nada disto vai para o navegador: o negócio de uma conta guardado sem a
    // conta na chave ficava para a próxima que entrasse na mesma aba. O que
    // vale é o que cada tela grava.
    if (faltam.length > 0) return
    aoAplicar({ contexto, sugestoes: etapas, valores, respostas, voz: null })
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      {etapas.map((etapa, indice) => (
        <section
          key={etapa.etapa}
          aria-label={copy.sugestoes.etapas[etapa.etapa]}
          className="surgir rounded-cartao border border-borda-suave bg-superficie-funda/50 px-5 py-4 max-md:px-4"
          style={{ animationDelay: `${120 + indice * 140}ms` }}
        >
          <h3 className="titulo-de-secao m-0 mb-3">{copy.sugestoes.etapas[etapa.etapa]}</h3>

          <div className="flex flex-col gap-3">
            {etapa.campos.map((campo) => {
              const chave = `${etapa.etapa}.${campo.campo}`
              return (
                <CampoDeTextoLongo
                  key={chave}
                  rotulo={copy.sugestoes.campos[campo.campo] ?? campo.campo}
                  apoio={
                    campo.porque ||
                    (obrigatorios.has(chave) ? copy.sugestoes.obrigatorio : undefined)
                  }
                  rows={campo.campo === 'roteiro_de_descoberta' ? 5 : 2}
                  value={valores[chave] ?? ''}
                  onChange={(evento) =>
                    definirValores((atuais) => ({ ...atuais, [chave]: evento.target.value }))
                  }
                />
              )
            })}

            {etapa.perguntas.length > 0 ? (
              <div className="mt-1 flex flex-col gap-3 rounded-controle border border-informacao-borda bg-informacao-fundo px-4 py-3.5">
                <p className="m-0 text-[12px] font-bold text-informacao">{copy.sugestoes.perguntas}</p>
                {etapa.perguntas.map((pergunta, posicao) => {
                  const chave = `${etapa.etapa}.${posicao}`
                  return (
                    <CampoDeTexto
                      key={chave}
                      rotulo={pergunta.pergunta}
                      placeholder={pergunta.exemplo || undefined}
                      value={respostas[chave] ?? ''}
                      onChange={(evento) =>
                        definirRespostas((atuais) => ({ ...atuais, [chave]: evento.target.value }))
                      }
                    />
                  )
                })}
              </div>
            ) : null}
          </div>
        </section>
      ))}

      {faltam.length > 0 ? (
        <p role="status" className="m-0 text-[12.5px] text-atencao">
          {copy.sugestoes.falta(faltam.map((chave) => copy.sugestoes.campos[chave.split('.')[1] ?? ''] ?? chave))}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2.5 pt-1">
        <button type="button" onClick={aoRefazer} className="botao-secundario">
          {copy.sugestoes.refazer}
        </button>
        <button type="button" onClick={concluir} disabled={faltam.length > 0} className="botao-primario">
          {copy.sugestoes.concluir}
        </button>
      </div>
    </div>
  )
}
