import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { AchadoNaTela, DiagnosticoNaTela, PropostaNaTela } from '@diagnostico/diagnostico.ts'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Dialogo } from '@/componentes/dialogo'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { diagnostico as copy, rotuloDoAlvo, telaDoAlvo } from '@/copy/diagnostico'
import {
  alvoDaProposta,
  comoPublicar,
  textoDoValor,
  tipoDaConfirmacao,
  tomDaSeveridade,
} from '@/diagnostico/apresentacao'
import { useServicoDeDiagnostico } from '@/diagnostico/contexto'
import { useServicoDaSarah } from '@/sarah/contexto'
import { formatarInstante } from '@/utilidades/datas'

type Confirmacao =
  | { readonly acao: 'aplicar' | 'descartar'; readonly proposta: PropostaNaTela }
  | { readonly acao: 'publicar'; readonly proposta: PropostaNaTela }

/**
 * O diagnóstico da ligação dentro da ficha da chamada.
 *
 * Quatro decisões explicam o desenho:
 *
 * 1. **O diagnóstico é do banco, não da aba.** A análise grava uma linha em
 *    `call_diagnoses`, e a ficha lê a mais nova ao abrir: quem recarrega vê a
 *    mesma análise, com o estado de cada proposta, em vez de pedir outra.
 * 2. **Aplicar e publicar são dois cliques, e a tela nomeia os dois.** Aplicar
 *    grava pelo caminho da tela daquele nível (o RPC confere o valor de antes
 *    e registra quem aprovou); publicar é o botão de sempre da Sarah. Uma
 *    proposta aplicada que publicasse sozinha poria no ar uma mudança aprovada
 *    por resumo.
 * 3. **O antes e o depois ficam lado a lado, inteiros.** Quem aprova precisa
 *    ler o texto que está aprovando.
 * 4. **A frase do achado vem da borda.** Título, evidência e sugestão são da
 *    tabela de `call-diagnose/regras.ts`; aqui só aparecem.
 */
export function DiagnosticoDaChamada({ chamadaId }: { chamadaId: string }) {
  const servico = useServicoDeDiagnostico()
  const sarah = useServicoDaSarah()
  const consulta = useQuery({
    queryKey: ['diagnostico', chamadaId],
    queryFn: () => servico.carregar(chamadaId),
  })

  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [ocupado, setOcupado] = useState(false)
  /** A frase do que aconteceu com cada proposta depois de decidir ou publicar. */
  const [avisos, setAvisos] = useState<Readonly<Record<string, { texto: string; tom: 'positivo' | 'perigo' }>>>({})
  /** A versão que cada aplicação de roteiro criou, para a publicação nomear. */
  const [versoes, setVersoes] = useState<Readonly<Record<string, { id: string | null; numero: number | null }>>>({})

  async function analisar() {
    setAnalisando(true)
    setErro(null)
    const resultado = await servico.analisar(chamadaId)
    setAnalisando(false)
    if (!resultado.ok) setErro(resultado.mensagem)
    setAvisos({})
    await consulta.refetch()
  }

  async function confirmar(diagnosticoId: string, pedido: Confirmacao) {
    setOcupado(true)
    const { proposta } = pedido
    if (pedido.acao === 'publicar') {
      const modo = comoPublicar(proposta)
      const versaoId = versoes[proposta.id]?.id ?? proposta.versaoId
      const resultado =
        modo.tipo === 'playbook' && versaoId
          ? await sarah.publicarPlaybook({ proposito: modo.proposito, versaoId, nota: copy.publicar.nota(chamadaId) })
          : await sarah.republicar()
      const recusa = resultado.ok ? resultado.relatorio.recusa : copy.publicar.falhou
      setAvisos((antes) => ({
        ...antes,
        [proposta.id]: recusa ? { texto: recusa, tom: 'perigo' } : { texto: copy.publicar.publicado, tom: 'positivo' },
      }))
    } else {
      const resultado =
        pedido.acao === 'aplicar'
          ? await servico.aplicar(diagnosticoId, proposta.id)
          : await servico.descartar(diagnosticoId, proposta.id)
      if (!resultado.ok) {
        setAvisos((antes) => ({ ...antes, [proposta.id]: { texto: resultado.mensagem, tom: 'perigo' } }))
      } else if (pedido.acao === 'aplicar') {
        setVersoes((antes) => ({ ...antes, [proposta.id]: { id: resultado.versaoId, numero: resultado.versao } }))
        setAvisos((antes) => ({ ...antes, [proposta.id]: { texto: copy.publicar.apoio, tom: 'positivo' } }))
      }
      await consulta.refetch()
    }
    setOcupado(false)
    setConfirmacao(null)
  }

  const carga = consulta.data
  const atual = carga?.ok ? carga.diagnostico : null

  return (
    <Painel rotulo={copy.titulo} titulo={copy.titulo} apoio={copy.apoio}>
      <div className="flex flex-col gap-4">
        {consulta.isPending ? (
          <p role="status" className="m-0 text-[13.5px] text-texto-apoio">
            {copy.carregando}
          </p>
        ) : null}
        {carga && !carga.ok ? <CaixaDeErro>{carga.mensagem}</CaixaDeErro> : null}
        {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={atual ? 'botao-secundario' : 'botao-primario'}
            disabled={analisando || consulta.isPending}
            onClick={() => void analisar()}
          >
            {atual ? copy.analisarDeNovo : copy.analisar}
          </button>
          {atual ? (
            <span className="text-[12.5px] text-texto-apoio">{copy.feitoEm(formatarInstante(atual.criadoEm))}</span>
          ) : null}
        </div>

        {analisando ? (
          <p role="status" className="bloco-secundario m-0 flex items-center gap-3 px-4 py-3 text-[13.5px]">
            <span aria-hidden="true" className="giro h-4 w-4 border-2" />
            {copy.analisando}
          </p>
        ) : null}

        {atual && !analisando ? (
          <Resultado
            diagnostico={atual}
            avisos={avisos}
            ocupado={ocupado}
            aoPedir={(pedido) => setConfirmacao(pedido)}
          />
        ) : null}
      </div>

      {confirmacao && atual ? (
        <Confirmar
          pedido={confirmacao}
          versao={versoes[confirmacao.proposta.id]?.numero ?? null}
          chamadaId={chamadaId}
          ocupado={ocupado}
          aoConfirmar={() => void confirmar(atual.id, confirmacao)}
          aoCancelar={() => setConfirmacao(null)}
        />
      ) : null}
    </Painel>
  )
}

function Resultado({
  diagnostico,
  avisos,
  ocupado,
  aoPedir,
}: {
  diagnostico: DiagnosticoNaTela
  avisos: Readonly<Record<string, { texto: string; tom: 'positivo' | 'perigo' }>>
  ocupado: boolean
  aoPedir: (pedido: Confirmacao) => void
}) {
  const { resumo } = diagnostico
  return (
    <div className="flex flex-col gap-5">
      {diagnostico.avisoDoModelo ? (
        <div className="bloco-secundario px-4 py-3 text-[13.5px]">
          <p className="m-0">{diagnostico.avisoDoModelo}</p>
          {diagnostico.caminhoDoAviso ? (
            <p className="mt-2 mb-0">
              <a href={diagnostico.caminhoDoAviso} className="botao-link">
                {copy.irParaIntegracoes}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {diagnostico.causaProvavel ? (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[14px] font-bold">{copy.leitura.causa}</h3>
          <p className="m-0 text-[14px] text-texto-principal">{diagnostico.causaProvavel}</p>
          {diagnostico.diagnostico ? (
            <>
              <h3 className="m-0 mt-2 text-[14px] font-bold">{copy.leitura.explicacao}</h3>
              <p className="m-0 text-[13.5px] whitespace-pre-line text-texto-secundario">{diagnostico.diagnostico}</p>
            </>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="m-0 text-[14px] font-bold">{copy.resumo.titulo}</h3>
        <dl className="m-0 mt-2 grid grid-cols-3 gap-x-6 gap-y-3 max-md:grid-cols-1">
          <Par titulo={copy.resumo.motivo} valor={resumo.motivo_do_fim} val />
          <Par titulo={copy.resumo.estado} valor={resumo.estado_da_conversa} val />
          <Par titulo={copy.resumo.duracao} valor={resumo.duracao_seg === null ? null : `${resumo.duracao_seg} s`} val />
          <Par titulo={copy.resumo.idioma} valor={resumo.idioma} val />
          <Par titulo={copy.resumo.llm} valor={resumo.llm} val />
        </dl>
      </div>

      <div>
        <h3 className="m-0 text-[14px] font-bold">{copy.achados.titulo}</h3>
        {diagnostico.achados.length === 0 ? (
          <p className="mt-2 mb-0 text-[13.5px] text-texto-apoio">{copy.achados.nenhum}</p>
        ) : (
          <ul aria-label={copy.achados.titulo} className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0">
            {diagnostico.achados.map((achado, indice) => (
              <Achado key={`${achado.codigo}-${indice}`} achado={achado} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="m-0 text-[14px] font-bold">{copy.propostas.titulo}</h3>
        {diagnostico.propostas.length === 0 ? (
          <p className="mt-2 mb-0 text-[13.5px] text-texto-apoio">{copy.propostas.nenhuma}</p>
        ) : (
          <ul aria-label={copy.propostas.titulo} className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
            {diagnostico.propostas.map((proposta) => (
              <Proposta
                key={proposta.id}
                proposta={proposta}
                aviso={avisos[proposta.id] ?? null}
                ocupado={ocupado}
                aoPedir={aoPedir}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Par({ titulo, valor, val = false }: { titulo: string; valor: string | null; val?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="rotulo-de-indicador">{titulo}</dt>
      <dd className={`m-0 font-semibold text-texto-principal ${val && valor ? 'val' : ''}`}>
        {valor ?? copy.resumo.semValor}
      </dd>
    </div>
  )
}

function Achado({ achado }: { achado: AchadoNaTela }) {
  return (
    <li className="rounded-controle border border-borda-suave bg-superficie-funda px-3.5 py-3">
      <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-texto-principal">
        <Selo tom={tomDaSeveridade(achado.severidade)}>{copy.severidade[achado.severidade]}</Selo>
        {achado.titulo}
      </p>
      <p className="mt-2 mb-0 text-[13px] text-texto-secundario">
        <span className="font-semibold">{copy.achados.evidencia}: </span>
        {achado.evidencia}
      </p>
      <p className="mt-1 mb-0 text-[13px] text-texto-apoio">
        <span className="font-semibold">{copy.achados.sugestao}: </span>
        {achado.sugestao}
      </p>
    </li>
  )
}

function Proposta({
  proposta,
  aviso,
  ocupado,
  aoPedir,
}: {
  proposta: PropostaNaTela
  aviso: { texto: string; tom: 'positivo' | 'perigo' } | null
  ocupado: boolean
  aoPedir: (pedido: Confirmacao) => void
}) {
  const alvo = alvoDaProposta(proposta)
  const estado =
    proposta.estado === 'aplicada'
      ? { tom: 'positivo' as const, texto: copy.propostas.aplicada }
      : proposta.estado === 'descartada'
        ? { tom: 'neutro' as const, texto: copy.propostas.descartada }
        : { tom: 'atencao' as const, texto: copy.propostas.pendente }
  const vazio = proposta.alvo === 'privacidade.aviso_de_gravacao' ? copy.propostas.avisoPadrao : copy.propostas.semValor

  return (
    <li aria-label={proposta.titulo} className="rounded-cartao border border-borda-suave bg-superficie-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="m-0 text-[14px] font-bold text-texto-principal">{proposta.titulo}</h4>
        <Selo tom={estado.tom}>{estado.texto}</Selo>
        <Selo tom="neutro">{alvo ? rotuloDoAlvo(alvo) : proposta.alvo}</Selo>
      </div>
      <p className="mt-1.5 mb-0 text-[13px] text-texto-apoio">
        {proposta.origem === 'regra' ? copy.propostas.pelaRegra : copy.propostas.peloModelo}. {proposta.razao}
      </p>

      {proposta.alvo === 'republicar' ? (
        <p className="mt-2 mb-0 text-[13px] text-texto-secundario">{copy.propostas.soPublicar}</p>
      ) : (
        <dl className="m-0 mt-3 grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Valor titulo={copy.propostas.antes} texto={textoDoValor(proposta.alvo, proposta.antes) ?? vazio} />
          <Valor titulo={copy.propostas.depois} texto={textoDoValor(proposta.alvo, proposta.depois) ?? vazio} />
        </dl>
      )}

      {aviso ? (
        <p
          role={aviso.tom === 'perigo' ? 'alert' : 'status'}
          className={`mt-3 mb-0 text-[13px] ${aviso.tom === 'perigo' ? 'text-perigo' : 'text-menta-2'}`}
        >
          {aviso.texto}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2.5">
        {proposta.estado === 'pendente' && alvo ? (
          <>
            <button
              type="button"
              className="botao-primario"
              disabled={ocupado}
              onClick={() => aoPedir({ acao: 'aplicar', proposta })}
            >
              {copy.propostas.aplicar}
            </button>
            <button
              type="button"
              className="botao-fantasma"
              disabled={ocupado}
              onClick={() => aoPedir({ acao: 'descartar', proposta })}
            >
              {copy.propostas.descartar}
            </button>
          </>
        ) : null}
        {proposta.estado === 'aplicada' ? (
          <button
            type="button"
            className="botao-menta"
            disabled={ocupado}
            onClick={() => aoPedir({ acao: 'publicar', proposta })}
          >
            {copy.publicar.botao}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function Valor({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="rotulo-de-indicador">{titulo}</dt>
      <dd className="m-0 rounded-controle border border-borda-suave bg-superficie-funda px-3 py-2 text-[13px] whitespace-pre-line text-texto-secundario">
        {texto}
      </dd>
    </div>
  )
}

function Confirmar({
  pedido,
  versao,
  chamadaId,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  pedido: Confirmacao
  versao: number | null
  chamadaId: string
  ocupado: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  const alvo = alvoDaProposta(pedido.proposta)

  if (pedido.acao === 'publicar') {
    const modo = comoPublicar(pedido.proposta)
    return (
      <Dialogo
        titulo={copy.publicar.confirmarTitulo}
        explicacao={modo.tipo === 'playbook' ? copy.publicar.explicacaoDoPlaybook(versao) : copy.publicar.explicacaoDaSarah}
        confirmar={copy.publicar.confirmar}
        cancelar={copy.confirmar.cancelar}
        ocupado={ocupado}
        aoConfirmar={aoConfirmar}
        aoCancelar={aoCancelar}
      >
        {modo.tipo === 'playbook' ? <p className="m-0 text-[13.5px] val">{copy.publicar.nota(chamadaId)}</p> : null}
      </Dialogo>
    )
  }

  if (pedido.acao === 'descartar') {
    return (
      <Dialogo
        titulo={copy.confirmar.descartarTitulo}
        explicacao={copy.confirmar.descartarExplicacao}
        confirmar={copy.confirmar.descartar}
        cancelar={copy.confirmar.cancelar}
        tom="perigo"
        ocupado={ocupado}
        aoConfirmar={aoConfirmar}
        aoCancelar={aoCancelar}
      />
    )
  }

  const tipo = alvo ? tipoDaConfirmacao(alvo) : 'nivel'
  const explicacao =
    tipo === 'publicacao'
      ? copy.confirmar.explicacaoDaPublicacao
      : tipo === 'roteiro' && alvo
        ? copy.confirmar.explicacaoDoRoteiro(rotuloDoAlvo(alvo))
        : copy.confirmar.explicacao(alvo ? telaDoAlvo(alvo) : pedido.proposta.alvo)

  return (
    <Dialogo
      titulo={copy.confirmar.titulo}
      explicacao={explicacao}
      confirmar={copy.confirmar.confirmar}
      cancelar={copy.confirmar.cancelar}
      ocupado={ocupado}
      aoConfirmar={aoConfirmar}
      aoCancelar={aoCancelar}
    >
      <p className="m-0 text-[14px] font-semibold">{pedido.proposta.titulo}</p>
    </Dialogo>
  )
}
