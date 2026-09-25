// As etapas do assistente depois do resumo: publicar, ligar o número, fazer a
// primeira ligação de teste e o fecho. Com elas, o assistente de abertura é o
// tutorial inteiro, e cada etapa diz antes por que existe.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { Selo } from '@/componentes/selo'
import { FormularioDoPasso } from '@/configuracao-inicial/formulario-do-passo'
import { ETAPA_DO_PASSO, sarahNoAr, type EtapaDoInicio } from '@/configuracao-inicial/inicio'
import { Ligacao } from '@/configuracao-inicial/passo-da-primeira-ligacao'
import { useServicoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import {
  classeDoPasso,
  declararLigacaoDeTeste,
  passoResolvido,
} from '@/configuracao-inicial/progresso'
import { CAMINHO_DA_TELA, telasDoPasso } from '@/configuracao-inicial/telas-do-passo'
import type { ConfiguracaoInicial, PassoId } from '@/configuracao-inicial/tipos'
import { BLOQUEIO_EM_PORTUGUES, PASSOS_EM_PORTUGUES } from '@/copy/configuracao-inicial'
import { OfertaDaLigacaoAoLeadNovo } from '@/discagem/ligacao-ao-lead-novo'
import { useTextosDoInicio } from '@/configuracao-inicial/textos'
import { useServicoDaSarah } from '@/sarah/contexto'
import type { RelatorioDaPublicacao } from '@/sarah/tipos'

/** As mesmas chaves das telas: o que o assistente grava aparece lá sem recarregar. */
const CHAVE_DOS_PLAYBOOKS = ['sarah-playbooks'] as const
const CHAVE_DA_IDENTIDADE = ['sarah-identidade'] as const
const CHAVE_DA_VOZ = ['sarah-voz'] as const
const CHAVE_DA_CONFIGURACAO = ['configuracao-inicial'] as const

/** Quanto do roteiro aparece antes de publicar. */
const TAMANHO_DO_TRECHO = 320

function PorQue({ children }: { children: string }) {
  return (
    <p className="m-0 rounded-cartao border border-borda-suave bg-superficie-funda/50 px-4 py-3 text-[13px] leading-relaxed text-texto-secundario">
      {children}
    </p>
  )
}

/** O que falta para a publicação não recusar, na ordem em que se resolve. */
type FaltaParaPublicar = 'identidade' | 'voz' | 'primeiraFala'

/**
 * Publicar: o roteiro de descoberta vai ao ar e a Sarah é montada no provedor.
 * Antes, a etapa confere o que a publicação exige (identidade, voz, primeira
 * fala) e mostra o caminho de cada falta, para o botão nunca levar a uma
 * recusa. "No ar" é o agente montado no provedor, e não só o roteiro publicado
 * no banco: a publicação pode gravar a versão e o provedor recusar. Sem
 * roteiro, o caminho é o negócio, onde a IA o escreve junto com o resto.
 */
export function EtapaDePublicar({
  aoVoltarAoNegocio,
  aoIrPara,
  temRevisao,
}: {
  aoVoltarAoNegocio: () => void
  /** Leva à etapa que resolve o que falta. */
  aoIrPara: (etapa: EtapaDoInicio) => void
  /** Há uma revisão desta visita para onde voltar. */
  temRevisao: boolean
}) {
  const sarah = useServicoDaSarah()
  const copy = useTextosDoInicio()
  const cliente = useQueryClient()
  const carga = useQuery({ queryKey: CHAVE_DOS_PLAYBOOKS, queryFn: () => sarah.carregarPlaybooks() })
  const identidade = useQuery({ queryKey: CHAVE_DA_IDENTIDADE, queryFn: () => sarah.carregarIdentidade() })
  const voz = useQuery({ queryKey: CHAVE_DA_VOZ, queryFn: () => sarah.carregarVoz() })
  const [emCurso, definirEmCurso] = useState<'publicando' | null>(null)
  const [erro, definirErro] = useState<string | null>(null)
  const [relatorio, definirRelatorio] = useState<RelatorioDaPublicacao | null>(null)

  if (carga.isPending || identidade.isPending || voz.isPending) {
    return <Carregando texto={copy.publicar.carregando} />
  }
  const descoberta = carga.data?.ok
    ? carga.data.playbooks.playbooks.find((item) => item.proposito === 'discovery')
    : undefined
  const publicada = descoberta?.versoes.find((versao) => versao.estado === 'published')
  const rascunho = descoberta?.versoes.find((versao) => versao.estado === 'draft')
  const noAr = sarahNoAr(carga.data)

  const daSarah = identidade.data?.ok ? identidade.data.sarah.identidade : null
  const faltas: FaltaParaPublicar[] = []
  // A linha com só o nome (gravado na primeira pergunta) ainda não é
  // identidade: a publicação recusa sem empresa.
  if (!daSarah || !daSarah.empresa.trim()) faltas.push('identidade')
  if (voz.data?.ok && !voz.data.voz.vozEscolhida) faltas.push('voz')
  if (daSarah && !daSarah.primeiraFala.trim()) faltas.push('primeiraFala')

  async function reler() {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: CHAVE_DOS_PLAYBOOKS }),
      cliente.invalidateQueries({ queryKey: CHAVE_DA_IDENTIDADE }),
      cliente.invalidateQueries({ queryKey: CHAVE_DA_VOZ }),
      cliente.invalidateQueries({ queryKey: CHAVE_DA_CONFIGURACAO }),
    ])
  }

  /** Com rascunho, promove e publica; sem ele, monta de novo o que já está publicado. */
  async function publicar(versaoId: string | null) {
    definirEmCurso('publicando')
    definirErro(null)
    const resultado = versaoId
      ? await sarah.publicarPlaybook({ proposito: 'discovery', versaoId, nota: copy.publicar.nota })
      : await sarah.republicar()
    definirEmCurso(null)
    if (!resultado.ok) {
      definirErro(copy.publicar.naoPublicou)
    } else {
      definirRelatorio(resultado.relatorio)
      if (resultado.relatorio.recusa) definirErro(resultado.relatorio.recusa)
    }
    await reler()
  }

  const falhaDaDescoberta = relatorio?.propositos.find(
    (item) => item.proposito === 'discovery' && item.estado === 'falha',
  )
  const bloqueado = emCurso !== null || faltas.length > 0

  return (
    <div className="flex flex-col gap-3.5">
      <PorQue>{copy.publicar.porQue}</PorQue>

      {faltas.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2.5 rounded-cartao border border-atencao-borda bg-atencao-fundo px-4 py-3.5">
          <p className="m-0 text-[13px] font-bold text-atencao">{copy.publicar.faltaTitulo}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {faltas.map((falta) => (
              <li key={falta} className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-texto-secundario">
                <span>{copy.publicar.faltas[falta]}</span>
                {falta === 'voz' ? (
                  <button type="button" onClick={() => aoIrPara('voz')} className="botao-link">
                    {copy.publicar.escolherVoz}
                  </button>
                ) : temRevisao ? (
                  <button type="button" onClick={() => aoIrPara('sugestoes')} className="botao-link">
                    {copy.publicar.voltarARevisao}
                  </button>
                ) : (
                  <a href={CAMINHO_DA_TELA.identidade} className="botao-link">
                    {copy.publicar.abrirIdentidade}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {noAr && !rascunho ? (
        <div role="status" className="flex flex-col gap-1.5 rounded-cartao border border-positivo-borda bg-positivo-fundo/40 px-4 py-3.5">
          <Selo tom="positivo">{copy.publicar.noAr}</Selo>
          <p className="m-0 text-[13px] text-texto-secundario">{copy.publicar.noArExplicacao}</p>
        </div>
      ) : rascunho || publicada ? (
        <section
          aria-label={copy.publicar.rascunho}
          className="rounded-cartao border border-borda-suave bg-superficie-funda/50 px-4 py-3.5"
        >
          <p className="m-0 text-[12px] font-bold text-texto-apoio">{copy.publicar.rascunho}</p>
          <p className="mt-1 mb-0 text-[13px] whitespace-pre-line text-texto-principal">
            {trechoDoRoteiro((rascunho ?? publicada)?.roteiro ?? '')}
          </p>
          {!rascunho ? (
            <p className="mt-2 mb-0 text-[12.5px] text-texto-apoio">{copy.publicar.foraDoAr}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <a href={CAMINHO_DA_TELA.playbooks} className="botao-link">
              {copy.publicar.abrirRoteiros}
            </a>
            <button
              type="button"
              disabled={bloqueado}
              onClick={() => void publicar(rascunho?.id ?? null)}
              className="botao-primario"
            >
              {emCurso === 'publicando' ? copy.publicar.publicando : copy.publicar.publicar}
            </button>
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-3 rounded-cartao border border-dashed border-borda px-4 py-3.5">
          <p className="m-0 text-[13px] text-texto-secundario">{copy.publicar.semRoteiro}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={aoVoltarAoNegocio} className="botao-primario">
              {copy.publicar.voltarAoNegocio}
            </button>
            <a href={CAMINHO_DA_TELA.playbooks} className="botao-link">
              {copy.publicar.abrirRoteiros}
            </a>
          </div>
        </div>
      )}

      {falhaDaDescoberta?.mensagem ? (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {falhaDaDescoberta.mensagem}
        </p>
      ) : erro ? (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}

      {relatorio?.pendenciaDosWebhooks ? (
        <CaixaDeErro tom="atencao">{relatorio.pendenciaDosWebhooks}</CaixaDeErro>
      ) : null}

      <p className="m-0 text-[12px] text-texto-apoio">{copy.publicar.outrosPropositos}</p>
    </div>
  )
}

function trechoDoRoteiro(roteiro: string): string {
  return roteiro.length > TAMANHO_DO_TRECHO ? `${roteiro.slice(0, TAMANHO_DO_TRECHO).trimEnd()}…` : roteiro
}

/** O número: a tela de números embutida, com a razão antes. */
export function EtapaDoNumero({ configuracao }: { configuracao: ConfiguracaoInicial | null }) {
  const copy = useTextosDoInicio()
  const passo = configuracao?.passos.find((item) => item.passo === 'numero')
  return (
    <div className="flex flex-col gap-3.5">
      <PorQue>{copy.numero.porQue}</PorQue>
      {passo?.estado === 'aguardando_aprovacao' ? (
        <p role="status" className="m-0 rounded-cartao border border-atencao-borda bg-atencao-fundo px-4 py-3 text-[13px] text-atencao">
          {copy.numero.aguardando}
        </p>
      ) : passo && passoResolvido(passo) ? (
        <div>
          <Selo tom="positivo">{copy.numero.ligado}</Selo>
        </div>
      ) : null}
      <FormularioDoPasso passo="numero" />
    </div>
  )
}

/** A primeira ligação de teste, para o celular de quem configura. */
export function EtapaDaLigacao({
  configuracao,
  aoIrPara,
}: {
  configuracao: ConfiguracaoInicial | null
  aoIrPara: (etapa: EtapaDoInicio) => void
}) {
  const servico = useServicoDeConfiguracaoInicial()
  const cliente = useQueryClient()
  const copy = useTextosDoInicio()
  if (!configuracao) return null
  return (
    <div className="flex flex-col gap-3.5">
      <PorQue>{copy.ligacao.porQue}</PorQue>
      <Ligacao
        configuracao={configuracao}
        aoIrPara={(passo: PassoId) => aoIrPara(ETAPA_DO_PASSO[passo] ?? 'telefonia')}
        aoDeclarar={(chamadaId) =>
          void servico
            .salvar(declararLigacaoDeTeste(configuracao, chamadaId))
            .then(() => cliente.invalidateQueries({ queryKey: CHAVE_DA_CONFIGURACAO }))
        }
      />
    </div>
  )
}

/**
 * O fecho: o que foi feito e o que fica para quando quiser, com o caminho de
 * cada um. "Quando quiser" é tudo que não trava a primeira ligação, e não só o
 * que não trava nada: sem especialista a assistente liga e não marca reunião,
 * e o fecho que dissesse "não falta nada" esconderia isso até o primeiro lead.
 */
export function EtapaPronta({ configuracao }: { configuracao: ConfiguracaoInicial | null }) {
  const copy = useTextosDoInicio()
  const depois = (configuracao?.passos ?? [])
    .filter((passo) => classeDoPasso(passo) !== 'primeira-ligacao' && !passoResolvido(passo))
    .sort((um, outro) => um.ordem - outro.ordem)

  return (
    <div className="flex flex-col gap-5">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {copy.pronto.feito.map((item, indice) => (
          <li
            key={item}
            className="surgir flex items-center gap-3 rounded-controle border border-borda-suave bg-superficie-funda/50 px-3.5 py-2.5 text-[13.5px] font-semibold text-texto-principal"
            style={{ animationDelay: `${100 + indice * 120}ms` }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-positivo shadow-[0_0_0_4px_var(--positivo-fundo)]" />
            {item}
          </li>
        ))}
      </ul>

      {/* Opcional (D-03): a ligação ao lead novo nasce desligada, e o fecho
          é o lugar de oferecê-la, com o custo dito. */}
      <OfertaDaLigacaoAoLeadNovo />

      <section aria-label={copy.pronto.depoisTitulo} className="flex flex-col gap-2">
        <h3 className="m-0 text-[14px] font-extrabold text-texto-principal">{copy.pronto.depoisTitulo}</h3>
        {depois.length === 0 ? (
          <p className="m-0 text-[13px] text-texto-apoio">{copy.pronto.semPendencias}</p>
        ) : (
          <>
            <p className="m-0 text-[12.5px] text-texto-apoio">{copy.pronto.depois}</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {depois.map((passo) => {
                const tela = telasDoPasso(passo.passo)[0]
                const texto = PASSOS_EM_PORTUGUES[passo.passo]
                return (
                  <li
                    key={passo.passo}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-controle border border-borda-suave px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-texto-principal">{texto.titulo}</span>
                      <span className="block text-[12px] text-texto-apoio">{texto.explicacao}</span>
                      {passo.bloqueia.map((bloqueio) => (
                        <span key={bloqueio} className="block text-[12px] text-atencao">
                          {BLOQUEIO_EM_PORTUGUES[bloqueio]}
                        </span>
                      ))}
                    </span>
                    {tela ? (
                      <a href={CAMINHO_DA_TELA[tela]} className="botao-link">
                        {copy.pronto.abrir}
                      </a>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
