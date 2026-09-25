import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { privacidade as copy } from '@/copy/privacidade'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeAlterarPrivacidade, quemAlteraPrivacidade } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { useServicoDePrivacidade } from '@/privacidade/contexto'
import {
  estadoDaGravacao,
  mudancasDe,
  previaDoAviso,
  rascunhoDe,
  reduzPrazo,
  validarPrivacidade,
  type EstadoDaGravacao,
  type RascunhoDaPrivacidade,
} from '@/privacidade/privacidade'
import type {
  CampoDaPrivacidade,
  GravacaoNoProvedor,
  IdentidadeDaPrevia,
  MotivoDeFalhaDaPrivacidade,
  PrivacidadeDaConta,
} from '@/privacidade/tipos'
import { useServicoDaSarah } from '@/sarah/contexto'

// O papel vem da mesma carga da tela de equipe, e por isso da mesma chave.
const CHAVE_DA_EQUIPE = ['equipe'] as const
const CHAVE_DA_PRIVACIDADE = ['privacidade'] as const

export function TelaDePrivacidade({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeEquipe()

  const consulta = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servico.carregar(),
  })

  if (consulta.isPending) {
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
          {copyDaEquipe.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      </Moldura>
    )
  }

  // Quem não é dono vê a privacidade em leitura, com a negativa acima: ela
  // explica por que uma chamada não tem gravação, e todo membro precisa disso.
  const podeAlterar = podeAlterarPrivacidade(carga.equipe.papelDoUsuario)

  return (
    <Moldura embutida={dentroDoAssistente}>
      {podeAlterar ? null : <Negativa donos={quemAlteraPrivacidade(carga.equipe.membros)} />}
      <PrivacidadeDaTela podeAlterar={podeAlterar} />
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
      <div className="flex flex-col gap-6">{children}</div>
    </AreaDeTrabalho>
  )
}

function Negativa({ donos }: { donos: readonly Membro[] }) {
  return (
    <CaixaDeErro tom="atencao">
      <p className="m-0 font-medium">{copy.leitura.aviso}</p>
      {donos.length ? (
        <>
          <p className="mt-3 mb-1.5">{copy.leitura.pedirAcesso}</p>
          <ul aria-label={copy.leitura.pedirAcesso} className="m-0 flex list-none flex-col gap-1 p-0">
            {donos.map((membro) => (
              <li key={membro.usuarioId}>
                {membro.nome} <span className="val text-[12.5px]">{membro.email}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 mb-0">{copy.leitura.semDono}</p>
      )}
    </CaixaDeErro>
  )
}

/** Os quatro estados: carregando, falha, vazio e a privacidade. */
function PrivacidadeDaTela({ podeAlterar }: { podeAlterar: boolean }) {
  const servico = useServicoDePrivacidade()

  const consulta = useQuery({
    queryKey: CHAVE_DA_PRIVACIDADE,
    queryFn: () => servico.carregar(),
  })

  if (consulta.isPending) return <Carregando texto={copy.carregando} />

  const carga = consulta.data
  if (!carga?.ok) {
    return <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  }

  if (!carga.privacidade) {
    return <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
  }

  const aoRepublicar = async () => {
    await consulta.refetch()
  }

  return (
    <>
      <EstadoNoProvedor
        estado={estadoDaGravacao(carga.privacidade, carga.noProvedor)}
        noProvedor={carga.noProvedor}
        podeRepublicar={podeAlterar}
        aoRepublicar={aoRepublicar}
      />
      {podeAlterar ? (
        <Formulario
          privacidade={carga.privacidade}
          identidade={carga.identidade}
          aoGravar={aoRepublicar}
        />
      ) : (
        <Leitura privacidade={carga.privacidade} identidade={carga.identidade} />
      )}
    </>
  )
}

type Republicacao =
  | { estado: 'republicando' }
  | { estado: 'republicada' }
  | { estado: 'recusada'; mensagem: string }

/**
 * O estado medido da gravação. Com a gravação desligada aqui e propósito no ar
 * com a configuração anterior, a tela diz que o provedor ainda grava, e o
 * botão de republicar fica ao lado da frase.
 */
function EstadoNoProvedor({
  estado,
  noProvedor,
  podeRepublicar,
  aoRepublicar,
}: {
  estado: EstadoDaGravacao
  noProvedor: GravacaoNoProvedor
  podeRepublicar: boolean
  aoRepublicar: () => Promise<void>
}) {
  const sarah = useServicoDaSarah()
  const [republicacao, definirRepublicacao] = useState<Republicacao | null>(null)

  async function republicar() {
    definirRepublicacao({ estado: 'republicando' })
    const resultado = await sarah.republicar()
    if (!resultado.ok) {
      definirRepublicacao({ estado: 'recusada', mensagem: copy.gravacao.falhaAoRepublicar })
      return
    }
    if (resultado.relatorio.recusa) {
      definirRepublicacao({ estado: 'recusada', mensagem: resultado.relatorio.recusa })
      return
    }
    definirRepublicacao({ estado: 'republicada' })
    await aoRepublicar()
  }

  if (estado !== 'desligada-no-painel') {
    return (
      <section aria-label={copy.rotulos.gravacaoLigada} className="flex flex-col gap-2">
        <p role="status" className="m-0 flex items-center gap-2 text-[13.5px] font-semibold text-texto-principal">
          {/* O ponto acompanha a frase: menta gravando, apagado desligada. */}
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              estado === 'ligada' ? 'bg-menta-2' : 'bg-texto-desativado'
            }`}
          />
          {estado === 'ligada' ? copy.gravacao.ligada : copy.gravacao.desligada}
        </p>
        {republicacao?.estado === 'republicada' ? (
          <p className="m-0 text-[12.5px] text-positivo">{copy.gravacao.republicada}</p>
        ) : null}
      </section>
    )
  }

  return (
    <section aria-label={copy.gravacao.noPainel.titulo}>
      <CaixaDeErro tom="atencao">
        <p className="m-0 font-medium">{copy.gravacao.noPainel.titulo}</p>
        <p className="mt-1.5 mb-0">{copy.gravacao.noPainel.explicacao}</p>
        <p className="mt-1.5 mb-0">
          {copy.gravacao.noPainel.propositos(noProvedor.propositosPendentes.length)}
        </p>
        {podeRepublicar ? (
          <div className="mt-3">
            <button
              type="button"
              className="botao-secundario"
              disabled={republicacao?.estado === 'republicando'}
              onClick={republicar}
            >
              {republicacao?.estado === 'republicando'
                ? copy.gravacao.republicando
                : copy.gravacao.republicar}
            </button>
          </div>
        ) : null}
      </CaixaDeErro>
      {republicacao?.estado === 'recusada' ? (
        <div className="mt-3">
          <CaixaDeErro>{republicacao.mensagem}</CaixaDeErro>
        </div>
      ) : null}
    </section>
  )
}

function PreviaDoAviso({
  gravacaoLigada,
  aviso,
  identidade,
}: {
  gravacaoLigada: boolean
  aviso: string
  identidade: IdentidadeDaPrevia | null
}) {
  return (
    <section aria-label={copy.aviso.previa} className="bloco-secundario">
      <h3 className="titulo-de-secao m-0">{copy.aviso.previa}</h3>
      {gravacaoLigada ? (
        <>
          <p className="mt-1 mb-2 text-[12.5px] text-texto-apoio">{copy.aviso.previaComLead}</p>
          {/* O aviso é fala da Sarah: vai no balão dela, ao lado do sinal. */}
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="sinal mt-0.5 h-8 w-8" />
            <p className="m-0 rounded-cartao rounded-tl-pequeno border border-positivo-borda bg-positivo-fundo px-3.5 py-2.5 text-[13.5px] leading-relaxed text-texto-principal">
              {previaDoAviso(aviso, identidade)}
            </p>
          </div>
        </>
      ) : (
        <p className="mt-1 mb-0 text-[12.5px] text-texto-apoio">{copy.aviso.semAviso}</p>
      )}
    </section>
  )
}

function Leitura({
  privacidade,
  identidade,
}: {
  privacidade: PrivacidadeDaConta
  identidade: IdentidadeDaPrevia | null
}) {
  const campos: CampoDaPrivacidade[] = ['gravacaoLigada', 'avisoDeGravacao', 'retencaoDias']
  return (
    <Painel>
      <dl aria-label={copy.titulo} className="m-0 flex flex-col gap-3">
        {campos.map((campo) => (
          <div key={campo}>
            <dt className="rotulo-de-indicador">{copy.rotulos[campo]}</dt>
            <dd className="m-0 mt-0.5 text-[14px] font-semibold text-texto-principal">
              {copy.confirmacao.valor(campo, privacidade)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <PreviaDoAviso
          gravacaoLigada={privacidade.gravacaoLigada}
          aviso={privacidade.avisoDeGravacao ?? ''}
          identidade={identidade}
        />
      </div>
      <p className="mt-4 mb-0 text-[12.5px] text-texto-apoio">{copy.retencao.explicacao}</p>
    </Painel>
  )
}

interface Confirmacao {
  antes: PrivacidadeDaConta
  depois: PrivacidadeDaConta
  campos: CampoDaPrivacidade[]
}

function Formulario({
  privacidade,
  identidade,
  aoGravar,
}: {
  privacidade: PrivacidadeDaConta
  identidade: IdentidadeDaPrevia | null
  aoGravar: () => Promise<void>
}) {
  const servico = useServicoDePrivacidade()
  const idDaGravacao = useId()
  const idDoExpurgo = useId()

  // `base` é o que está gravado: a diferença para o rascunho é o que vai ao
  // RPC, e a trilha registra só isso.
  const [base, definirBase] = useState(privacidade)
  const [rascunho, definirRascunho] = useState<RascunhoDaPrivacidade>(() => rascunhoDe(privacidade))
  const [motivo, definirMotivo] = useState('')
  const [expurgoEntendido, definirExpurgoEntendido] = useState(false)
  const [erroDaRetencao, definirErroDaRetencao] = useState(false)
  const [motivoFaltando, definirMotivoFaltando] = useState(false)
  const [aviso, definirAviso] = useState<'nada-mudou' | 'confirmar-expurgo' | null>(null)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaPrivacidade | null>(null)
  const [confirmacao, definirConfirmacao] = useState<Confirmacao | null>(null)
  const [salvando, definirSalvando] = useState(false)

  const validacao = validarPrivacidade(rascunho)
  const prazoMenor = validacao.ok && reduzPrazo(base, validacao.privacidade)
  const prazoNovo = validacao.ok ? validacao.privacidade.retencaoDias : null
  const desligando = base.gravacaoLigada && !rascunho.gravacaoLigada

  // A contagem é pedida enquanto se digita, e não no clique de salvar: o
  // número tem que estar na tela antes da decisão, que é o que o critério
  // pede. A chave é o prazo, então voltar a um prazo já contado não pergunta
  // de novo.
  const foraDoPrazo = useQuery({
    queryKey: ['privacidade', 'fora-do-prazo', prazoNovo],
    queryFn: () => servico.contarForaDoPrazo(prazoNovo ?? 0),
    enabled: prazoMenor,
  })

  const contagem = prazoMenor && foraDoPrazo.data?.ok ? foraDoPrazo.data.chamadas : null
  const contagemFalhou = prazoMenor && foraDoPrazo.data !== undefined && !foraDoPrazo.data.ok

  async function gravar(evento: FormEvent) {
    evento.preventDefault()
    definirAviso(null)
    definirFalha(null)
    definirConfirmacao(null)

    if (!validacao.ok) {
      definirErroDaRetencao(true)
      return
    }
    definirErroDaRetencao(false)

    const mudancas = mudancasDe(base, validacao.privacidade)
    if (Object.keys(mudancas).length === 0) {
      definirAviso('nada-mudou')
      return
    }

    if (prazoMenor && (contagem === null || !expurgoEntendido)) {
      definirAviso('confirmar-expurgo')
      return
    }

    const motivoEscrito = motivo.trim()
    if (!motivoEscrito) {
      definirMotivoFaltando(true)
      return
    }
    definirMotivoFaltando(false)

    definirSalvando(true)
    const resultado = await servico.salvar(mudancas, motivoEscrito)
    definirSalvando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    definirConfirmacao({
      antes: base,
      depois: resultado.privacidade,
      campos: (Object.keys(mudancas) as CampoDaPrivacidade[]),
    })
    definirBase(resultado.privacidade)
    definirRascunho(rascunhoDe(resultado.privacidade))
    definirMotivo('')
    definirExpurgoEntendido(false)
    await aoGravar()
  }

  return (
    <form onSubmit={gravar} noValidate className="flex flex-col gap-6">
      <Painel titulo={copy.rotulos.gravacaoLigada}>
        <div role="group" aria-label={copy.rotulos.gravacaoLigada} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={idDaGravacao}
              checked={rascunho.gravacaoLigada}
              onChange={(evento) =>
                definirRascunho((atual) => ({ ...atual, gravacaoLigada: evento.target.checked }))
              }
            />
            <label htmlFor={idDaGravacao} className="cursor-pointer text-[13.5px] font-semibold text-texto-principal">
              {copy.gravacao.ligar}
            </label>
          </div>
          {desligando ? (
            <p className="m-0 text-[12.5px] text-atencao">{copy.gravacao.exigeRepublicar}</p>
          ) : null}
        </div>
      </Painel>

      <Painel titulo={copy.rotulos.avisoDeGravacao}>
        <div className="flex flex-col gap-4">
          <CampoDeTextoLongo
            rotulo={copy.rotulos.avisoDeGravacao}
            apoio={`${copy.aviso.explicacao} ${copy.aviso.marcadores}`}
            rows={3}
            placeholder={copy.aviso.exemplo}
            value={rascunho.aviso}
            onChange={(evento) =>
              definirRascunho((atual) => ({ ...atual, aviso: evento.target.value }))
            }
          />
          <PreviaDoAviso
            gravacaoLigada={rascunho.gravacaoLigada}
            aviso={rascunho.aviso}
            identidade={identidade}
          />
        </div>
      </Painel>

      <Painel titulo={copy.rotulos.retencaoDias}>
        <div role="group" aria-label={copy.rotulos.retencaoDias} className="flex flex-col gap-2">
          <CampoDeTexto
            rotulo={copy.rotulos.retencaoDias}
            exemplo={copy.retencao.unidade}
            inputMode="numeric"
            value={rascunho.retencao}
            erro={erroDaRetencao && !validacao.ok ? copy.retencao.erros[validacao.retencao] : undefined}
            onChange={(evento) =>
              definirRascunho((atual) => ({ ...atual, retencao: evento.target.value }))
            }
          />
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.retencao.padrao}</p>
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.retencao.explicacao}</p>

          {prazoMenor && foraDoPrazo.isFetching && contagem === null ? (
            <p className="m-0 flex items-center gap-2 text-[12.5px] text-texto-apoio">
              <span aria-hidden="true" className="giro size-4! border-2!" />
              {copy.retencao.contando}
            </p>
          ) : null}
          {contagemFalhou ? <CaixaDeErro>{copy.retencao.falhaAoContar}</CaixaDeErro> : null}
          {contagem !== null && prazoNovo !== null ? (
            <CaixaDeErro tom="atencao">
              <p className="m-0">{copy.retencao.foraDoPrazo(contagem, prazoNovo)}</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id={idDoExpurgo}
                  checked={expurgoEntendido}
                  onChange={(evento) => definirExpurgoEntendido(evento.target.checked)}
                />
                <label htmlFor={idDoExpurgo}>{copy.retencao.confirmar}</label>
              </div>
            </CaixaDeErro>
          ) : null}
        </div>
      </Painel>

      <div className="flex flex-col gap-3">
        <CampoDeTexto
          rotulo={copy.motivo.rotulo}
          exemplo={copy.motivo.exemplo}
          value={motivo}
          erro={motivoFaltando ? copy.motivo.faltando : undefined}
          onChange={(evento) => definirMotivo(evento.target.value)}
        />
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.motivo.explicacao}</p>

        {aviso === 'nada-mudou' ? <CaixaDeErro tom="atencao">{copy.nadaMudou}</CaixaDeErro> : null}
        {aviso === 'confirmar-expurgo' ? (
          <CaixaDeErro tom="atencao">{copy.confirmarExpurgo}</CaixaDeErro>
        ) : null}
        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}
        {confirmacao ? <ConfirmacaoDoQueMudou confirmacao={confirmacao} /> : null}

        <div>
          <button type="submit" className="botao-primario" disabled={salvando}>
            {salvando ? copy.salvando : copy.salvar}
          </button>
        </div>
      </div>
    </form>
  )
}

function ConfirmacaoDoQueMudou({ confirmacao }: { confirmacao: Confirmacao }) {
  return (
    <div
      role="status"
      className="rounded-controle border border-positivo-borda bg-positivo-fundo px-4 py-3 text-[13.5px] text-texto-secundario"
    >
      <p className="m-0 font-bold text-positivo">{copy.confirmacao.titulo}</p>
      <ul aria-label={copy.confirmacao.titulo} className="mt-1.5 mb-0 pl-5">
        {confirmacao.campos.map((campo) => (
          <li key={campo}>{copy.confirmacao.linha(campo, confirmacao.antes, confirmacao.depois)}</li>
        ))}
      </ul>
    </div>
  )
}
