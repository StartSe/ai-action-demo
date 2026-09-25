import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { MENSAGENS_DA_ENTRADA } from '@conhecimento/respostas.ts'

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
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { conhecimento as copy } from '@/copy/conhecimento'
import {
  escreverEtiquetas,
  estadoDaEntrada,
  lerEtiquetas,
  podeGravar,
  quantasEsperam,
  TETO_DA_LISTA,
  type EstadoDaEntrada,
} from '@/sarah/conhecimento'
import { useServicoDaSarah } from '@/sarah/contexto'
import { useNomeDaAssistente } from '@/sarah/nome-da-assistente'
import type { EntradaDeConhecimento } from '@/sarah/tipos'

/** O tom de cada estado. `alterada` é âmbar porque está no ar com texto velho. */
const TOM_DO_ESTADO: Record<EstadoDaEntrada, TomDoSelo> = {
  pendente: 'neutro',
  indexada: 'positivo',
  alterada: 'atencao',
  removendo: 'neutro',
  erro: 'perigo',
}

/**
 * `/sarah/conhecimento`: o que a Sarah sabe responder (US-085, RF-310).
 *
 * Quatro decisões explicam o desenho:
 *
 * 1. **Salvar não ensina a Sarah.** A gravação vai para o banco; quem leva ao
 *    provedor é a sincronização, que é botão separado. A frase de sucesso diz
 *    isso — senão a pessoa sai daqui achando que a Sarah já aprendeu.
 * 2. **O estado sai das colunas.** Não há campo `status` na tabela, e o selo é
 *    calculado de `provider_doc_id`, `indexed_at`, `sync_error` e `removed_at`.
 *    Um campo de estado seria uma segunda verdade que divergiria na primeira
 *    falha de sincronização.
 * 3. **`alterada` é um estado à parte de `indexada`.** A entrada está no ar,
 *    mas com o texto anterior — e é justamente esse o caso em que alguém acha
 *    que corrigiu a Sarah e não corrigiu.
 * 4. **Remover tem dois desfechos, e a tela diz qual foi.** A entrada que
 *    nunca chegou ao provedor some; a indexada fica marcada até o provedor
 *    confirmar, porque esquecer no banco não faz o provedor esquecer.
 */
export function TelaDeConhecimento({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDaSarah()
  const nomeDaAssistente = useNomeDaAssistente()

  const [termo, setTermo] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [editando, setEditando] = useState<EntradaDeConhecimento | 'nova' | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const consulta = useQuery({
    queryKey: ['conhecimento', termo, etiqueta],
    queryFn: () =>
      servico.carregarConhecimento({
        ...(termo.trim() ? { termo: termo.trim() } : {}),
        ...(etiqueta ? { etiqueta } : {}),
      }),
  })

  const carga = consulta.data
  const base = carga?.ok ? carga.conhecimento : null
  const pendentes = base ? quantasEsperam(base.entradas) : 0

  async function salvar(pedido: { id: string | null; pergunta: string; resposta: string; etiquetas: string[] }) {
    setOcupado(copy.entrada.salvando)
    setErro(null)
    setAviso(null)
    const resultado = await servico.salvarEntrada(pedido)
    setOcupado(null)
    if (!resultado.ok) {
      setErro(copy.falhaGenerica)
      return
    }
    setEditando(null)
    setAviso(copy.entrada.salva)
    void consulta.refetch()
  }

  async function remover(id: string) {
    setOcupado(copy.falhaGenerica)
    setErro(null)
    setAviso(null)
    const resultado = await servico.removerEntrada(id)
    setOcupado(null)
    if (!resultado.ok) {
      setErro(copy.falhaGenerica)
      return
    }
    setAviso(resultado.desfecho === 'apagada' ? copy.remocao.apagada : copy.remocao.marcada)
    void consulta.refetch()
  }

  async function sincronizar() {
    setOcupado(copy.sincronizacao.emCurso)
    setErro(null)
    setAviso(null)
    const resultado = await servico.sincronizarConhecimento()
    setOcupado(null)
    if (!resultado.ok) {
      setErro(copy.falhaGenerica)
      return
    }
    if (resultado.relatorio.recusa) {
      setErro(resultado.relatorio.recusa)
      return
    }
    // O resultado por entrada vem com `estado`, e não com `ok`: `inalterada`
    // é sucesso e não conta como envio, e `erro` é a única falha.
    const falharam = resultado.relatorio.entradas.filter((item) => item.estado === 'erro').length
    const foram = resultado.relatorio.entradas.filter(
      (item) => item.estado !== 'erro' && item.estado !== 'inalterada',
    ).length
    setAviso(
      falharam > 0 ? copy.sincronizacao.comFalhas(falharam) : copy.sincronizacao.concluida(foram),
    )
    void consulta.refetch()
  }

  return (
    <AreaDeTrabalho
      titulo={copy.titulo}
      lead={copy.apoio(nomeDaAssistente)}
      embutida={dentroDoAssistente}
      acoes={
        <button
          type="button"
          className="botao-primario"
          disabled={ocupado !== null || base === null}
          onClick={() => void sincronizar()}
        >
          {pendentes > 0 ? copy.sincronizacao.comPendentes(pendentes) : copy.sincronizacao.botao}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}
        {aviso ? (
          <p role="status" className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">
            {aviso}
          </p>
        ) : null}

        {consulta.isPending ? <Carregando texto={copy.carregando} /> : null}
        {carga?.ok === false ? <CaixaDeErro>{copy.falha}</CaixaDeErro> : null}

        {editando ? (
          <Formulario
            entrada={editando === 'nova' ? null : editando}
            ocupado={ocupado}
            aoSalvar={salvar}
            aoCancelar={() => setEditando(null)}
          />
        ) : base ? (
          <div>
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado !== null}
              onClick={() => setEditando('nova')}
            >
              {copy.entrada.nova}
            </button>
          </div>
        ) : null}

        {base && base.totalDaConta === 0 ? (
          <EstadoVazio titulo={copy.vazia.titulo} explicacao={copy.vazia.explicacao} />
        ) : null}

        {base && base.totalDaConta > 0 ? (
          <Painel
            titulo={copy.lista.titulo}
            apoio={copy.lista.total(base.totalDaConta)}
            estado={
              pendentes === 0 ? <Selo tom="positivo">{copy.sincronizacao.semPendencia}</Selo> : null
            }
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <CampoDeTexto
                    rotulo={copy.lista.buscar}
                    exemplo={copy.lista.exemploDaBusca}
                    value={termo}
                    onChange={(evento) => setTermo(evento.target.value)}
                  />
                </div>
                <div className="flex min-w-[180px] flex-col gap-1.5">
                  <label htmlFor="conhecimento-etiqueta" className="text-[13px] font-semibold">
                    {copy.lista.etiqueta}
                  </label>
                  <select
                    id="conhecimento-etiqueta"
                    className="campo"
                    value={etiqueta}
                    onChange={(evento) => setEtiqueta(evento.target.value)}
                  >
                    <option value="">{copy.lista.todasAsEtiquetas}</option>
                    {base.etiquetas.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {base.truncada ? (
                <p className="m-0 text-[12.5px] text-texto-apoio">
                  {copy.lista.truncada(TETO_DA_LISTA)}
                </p>
              ) : null}

              {base.entradas.length === 0 ? (
                <p className="m-0 text-[13.5px] text-texto-apoio">{copy.lista.semResultado}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {base.entradas.map((entrada) => (
                    <Entrada
                      key={entrada.id}
                      entrada={entrada}
                      ocupado={ocupado}
                      aoEditar={() => setEditando(entrada)}
                      aoRemover={() => void remover(entrada.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Painel>
        ) : null}

        {ocupado ? (
          <p role="status" className="m-0 flex items-center gap-2.5 text-[13px] text-texto-apoio">
            <span aria-hidden="true" className="giro size-4! border-2!" />
            {ocupado}
          </p>
        ) : null}
      </div>
    </AreaDeTrabalho>
  )
}

function Entrada({
  entrada,
  ocupado,
  aoEditar,
  aoRemover,
}: {
  entrada: EntradaDeConhecimento
  ocupado: string | null
  aoEditar: () => void
  aoRemover: () => void
}) {
  const estado = estadoDaEntrada(entrada)

  return (
    <li className="rounded-cartao border border-borda-suave bg-superficie-funda px-4 py-3.5 transition-colors duration-150 hover:border-borda-controle">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className="m-0 text-[13.5px] font-bold text-texto-principal">{entrada.pergunta}</h3>
        <Selo tom={TOM_DO_ESTADO[estado]}>{copy.estados[estado]}</Selo>
      </header>

      <p className="m-0 mb-2 text-[13px] text-texto-secundario">{entrada.resposta}</p>

      <p className="m-0 mb-2 text-[12.5px] text-texto-apoio">
        {copy.explicacaoDoEstado[estado]}
        {/* O código do provedor vira frase: quem lê a tela não fala inglês de
            máquina, e a tradução mora em knowledge-sync/respostas.ts. */}
        {entrada.erro && Object.hasOwn(MENSAGENS_DA_ENTRADA, entrada.erro)
          ? ` ${MENSAGENS_DA_ENTRADA[entrada.erro as keyof typeof MENSAGENS_DA_ENTRADA]}`
          : null}
      </p>

      {entrada.etiquetas.length > 0 ? (
        <p className="m-0 mb-2 flex flex-wrap gap-1.5">
          {entrada.etiquetas.map((etiqueta) => (
            <span key={etiqueta} className="selo selo-neutro">
              {etiqueta}
            </span>
          ))}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado !== null || estado === 'removendo'}
          onClick={aoEditar}
        >
          {copy.lista.editar}
        </button>
        <button
          type="button"
          className="botao-perigo"
          disabled={ocupado !== null || estado === 'removendo'}
          onClick={aoRemover}
        >
          {copy.lista.remover}
        </button>
      </div>
    </li>
  )
}

function Formulario({
  entrada,
  ocupado,
  aoSalvar,
  aoCancelar,
}: {
  entrada: EntradaDeConhecimento | null
  ocupado: string | null
  aoSalvar: (pedido: {
    id: string | null
    pergunta: string
    resposta: string
    etiquetas: string[]
  }) => void
  aoCancelar: () => void
}) {
  const [pergunta, setPergunta] = useState(entrada?.pergunta ?? '')
  const [resposta, setResposta] = useState(entrada?.resposta ?? '')
  const [etiquetas, setEtiquetas] = useState(escreverEtiquetas(entrada?.etiquetas ?? []))

  const completa = podeGravar(pergunta, resposta)

  return (
    <Painel titulo={entrada ? copy.entrada.tituloEdicao : copy.entrada.tituloNova}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <CampoDeTexto
            rotulo={copy.entrada.pergunta}
            exemplo={copy.entrada.exemploDaPergunta}
            value={pergunta}
            disabled={ocupado !== null}
            onChange={(evento) => setPergunta(evento.target.value)}
          />
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.entrada.apoioDaPergunta}</p>
        </div>
        <CampoDeTextoLongo
          rotulo={copy.entrada.resposta}
          exemplo={copy.entrada.exemploDaResposta}
          apoio={copy.entrada.apoioDaResposta}
          rows={3}
          value={resposta}
          disabled={ocupado !== null}
          onChange={(evento) => setResposta(evento.target.value)}
        />
        <div className="flex flex-col gap-1">
          <CampoDeTexto
            rotulo={copy.entrada.etiquetas}
            exemplo={copy.entrada.exemploDasEtiquetas}
            value={etiquetas}
            disabled={ocupado !== null}
            onChange={(evento) => setEtiquetas(evento.target.value)}
          />
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.entrada.apoioDasEtiquetas}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="botao-primario"
            disabled={!completa || ocupado !== null}
            onClick={() =>
              aoSalvar({
                id: entrada?.id ?? null,
                pergunta: pergunta.trim(),
                resposta: resposta.trim(),
                etiquetas: lerEtiquetas(etiquetas),
              })
            }
          >
            {copy.entrada.salvar}
          </button>
          <button type="button" className="botao-secundario" onClick={aoCancelar}>
            {copy.entrada.cancelar}
          </button>
          {!completa ? (
            <span className="text-[12.5px] text-texto-apoio">{copy.entrada.incompleta}</span>
          ) : null}
        </div>
      </div>
    </Painel>
  )
}
