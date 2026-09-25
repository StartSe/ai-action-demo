import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { Painel } from '@/componentes/painel'
import { especialistas as copyDosEspecialistas } from '@/copy/especialistas'
import {
  DIAS_NA_ORDEM_DA_SEMANA,
  faixasDoDia,
  lerBloqueio,
  problemaDaFaixa,
  rotularNoFuso,
  separarBloqueios,
  type RascunhoDeBloqueio,
} from '@/especialistas/agenda'
import { useServicoDeEspecialistas } from '@/especialistas/contexto'
import type { Bloqueio, GravacaoDaAgenda } from '@/especialistas/tipos'

const copy = copyDosEspecialistas.agenda

const RASCUNHO_VAZIO: RascunhoDeBloqueio = {
  dataInicio: '',
  horaInicio: '',
  dataFim: '',
  horaFim: '',
  motivo: '',
}

function nomeDoDia(dia: number): string {
  return copy.dias[dia] ?? ''
}

/**
 * A agenda na ficha do especialista (US-176, RF-502 e RF-503).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **As horas aparecem no fuso do especialista, dito em cima.** É nesse fuso
 *    que a faixa vale (T-21). Quando a conta está em outro, cada bloqueio
 *    mostra também o horário da conta, porque é por ele que quem administra
 *    confere "estará fora na reunião das 10h?".
 * 2. **A ordem das horas se recusa aqui, com a frase do campo.** O check da
 *    tabela é a segunda linha; a sobreposição de bloqueio, não: só o banco
 *    enxerga todos os bloqueios, e a recusa dele (23P01) volta dizendo qual
 *    bloqueio já cobre o intervalo.
 * 3. **O vazio diz a consequência.** Sem faixa nenhuma a Sarah não oferece
 *    horário nenhum para esta pessoa, e é isso que quem abre a ficha precisa
 *    ler, e não só que a lista está vazia.
 */
export function AgendaDoEspecialista({
  especialistaId,
  fuso,
  fusoDaConta,
  somenteLeitura,
  relogio = Date.now,
}: {
  especialistaId: string
  /** O fuso gravado do especialista, não o que o formulário está editando. */
  fuso: string
  fusoDaConta: string
  somenteLeitura: boolean
  /** O relógio que separa bloqueio passado de próximo. Parâmetro para o teste. */
  relogio?: () => number
}) {
  const servico = useServicoDeEspecialistas()

  const [agora] = useState(relogio)
  const [dia, setDia] = useState<number>(1)
  const [inicio, setInicio] = useState('09:00')
  const [fim, setFim] = useState('12:00')
  const [rascunho, setRascunho] = useState<RascunhoDeBloqueio>(RASCUNHO_VAZIO)
  const [tentouBloquear, setTentouBloquear] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const consulta = useQuery({
    queryKey: ['especialistas', especialistaId, 'agenda'],
    queryFn: () => servico.carregarAgenda(especialistaId),
  })

  const outroFuso = fuso !== fusoDaConta
  const problemaDaNovaFaixa = problemaDaFaixa(inicio, fim)
  const leituraDoBloqueio = lerBloqueio(rascunho, fuso)
  const travado = somenteLeitura || ocupado

  const intervaloNoFuso = (bloqueio: Bloqueio, alvo: string) =>
    copy.bloqueios.intervalo(rotularNoFuso(bloqueio.inicio, alvo), rotularNoFuso(bloqueio.fim, alvo))

  async function escrever(acao: () => Promise<GravacaoDaAgenda>, sucesso: string): Promise<boolean> {
    setOcupado(true)
    setErro(null)
    setAviso(null)
    const resultado = await acao()
    setOcupado(false)
    if (!resultado.ok) {
      setErro(
        resultado.motivo === 'bloqueio-sobreposto'
          ? resultado.conflito
            ? copy.sobreposto(intervaloNoFuso(resultado.conflito, fuso), resultado.conflito.motivo)
            : copy.falhas['bloqueio-sobreposto']
          : copy.falhas[resultado.motivo],
      )
      return false
    }
    setAviso(sucesso)
    void consulta.refetch()
    return true
  }

  async function acrescentarFaixa() {
    if (problemaDaNovaFaixa) return
    await escrever(
      () => servico.acrescentarFaixa({ especialistaId, diaDaSemana: dia, inicio, fim }),
      copy.disponibilidade.acrescentada,
    )
  }

  async function acrescentarBloqueio() {
    setTentouBloquear(true)
    if (!leituraDoBloqueio.ok) return
    const { inicio: de, fim: ate, motivo } = leituraDoBloqueio
    const gravou = await escrever(
      () => servico.acrescentarBloqueio({ especialistaId, inicio: de, fim: ate, motivo }),
      copy.bloqueios.acrescentado,
    )
    if (gravou) {
      setRascunho(RASCUNHO_VAZIO)
      setTentouBloquear(false)
    }
  }

  if (consulta.isPending) return <Carregando texto={copy.carregando} />

  const carga = consulta.data
  if (!carga?.ok) {
    return (
      <CaixaDeErro>
        <p className="m-0">{copy.falha}</p>
        <button
          type="button"
          className="botao-secundario mt-3"
          onClick={() => void consulta.refetch()}
        >
          {copy.tentarDeNovo}
        </button>
      </CaixaDeErro>
    )
  }

  const { proximos, passados } = separarBloqueios(carga.bloqueios, agora)

  const linhaDoBloqueio = (bloqueio: Bloqueio) => (
    <li key={bloqueio.id} className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="val text-[13px] text-texto-principal">
          {intervaloNoFuso(bloqueio, fuso)}
        </span>
        {outroFuso ? (
          <span className="val text-[12px] text-texto-apoio">
            {copy.bloqueios.naConta(
              fusoDaConta,
              rotularNoFuso(bloqueio.inicio, fusoDaConta),
              rotularNoFuso(bloqueio.fim, fusoDaConta),
            )}
          </span>
        ) : null}
        <span className="text-[12px] text-texto-apoio">
          {bloqueio.motivo ?? copy.bloqueios.semMotivo}
        </span>
      </div>
      {somenteLeitura ? null : (
        <button
          type="button"
          className="botao-secundario"
          disabled={travado}
          aria-label={copy.bloqueios.rotuloDoRemover(intervaloNoFuso(bloqueio, fuso))}
          onClick={() =>
            void escrever(() => servico.removerBloqueio(bloqueio.id), copy.bloqueios.removido)
          }
        >
          {copy.bloqueios.remover}
        </button>
      )}
    </li>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[13px] text-texto-principal">
          {copy.fuso(fuso)}
        </p>
        {outroFuso ? (
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.fusoDaConta(fusoDaConta)}</p>
        ) : null}
        {somenteLeitura ? (
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.leitura}</p>
        ) : null}
      </div>

      {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}
      {aviso ? (
        <p role="status" className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">
          {aviso}
        </p>
      ) : null}

      <Painel
        rotulo={copy.disponibilidade.titulo}
        titulo={copy.disponibilidade.titulo}
        apoio={copy.disponibilidade.apoio}
      >
        <div className="flex flex-col gap-4">
          {carga.faixas.length === 0 ? (
            <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
          ) : (
            <ul
              aria-label={copy.disponibilidade.rotuloDaLista}
              className="m-0 flex list-none flex-col gap-2 p-0"
            >
              {DIAS_NA_ORDEM_DA_SEMANA.map((numero) => {
                const doDia = faixasDoDia(carga.faixas, numero)
                return (
                  <li
                    key={numero}
                    aria-label={nomeDoDia(numero)}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <span className="w-20 text-[13px] font-semibold">{nomeDoDia(numero)}</span>
                    {doDia.length === 0 ? (
                      <span className="text-[12.5px] text-texto-desativado">
                        {copy.disponibilidade.semFaixa}
                      </span>
                    ) : (
                      doDia.map((faixa) => (
                        <span key={faixa.id} className="flex items-center gap-1.5">
                          <span className="val text-[13px]">
                            {copy.disponibilidade.faixa(faixa.inicio, faixa.fim)}
                          </span>
                          {somenteLeitura ? null : (
                            <button
                              type="button"
                              className="botao-secundario"
                              disabled={travado}
                              aria-label={copy.disponibilidade.rotuloDoRemover(
                                nomeDoDia(numero),
                                faixa.inicio,
                                faixa.fim,
                              )}
                              onClick={() =>
                                void escrever(
                                  () => servico.removerFaixa(faixa.id),
                                  copy.disponibilidade.removida,
                                )
                              }
                            >
                              {copy.disponibilidade.remover}
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[13px] font-semibold">
              {copy.disponibilidade.novaFaixa}
            </legend>
            <LinhaDeCampos>
              <SeletorDeDia valor={dia} desabilitado={travado} aoTrocar={setDia} />
              <CampoDeTexto
                rotulo={copy.disponibilidade.inicio}
                type="time"
                value={inicio}
                disabled={travado}
                onChange={(evento) => setInicio(evento.target.value)}
              />
              <CampoDeTexto
                rotulo={copy.disponibilidade.fim}
                type="time"
                value={fim}
                disabled={travado}
                erro={
                  !somenteLeitura && problemaDaNovaFaixa
                    ? copy.problemasDaFaixa[problemaDaNovaFaixa]
                    : undefined
                }
                onChange={(evento) => setFim(evento.target.value)}
              />
            </LinhaDeCampos>
            {somenteLeitura ? null : (
              <div>
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={travado || problemaDaNovaFaixa !== null}
                  onClick={() => void acrescentarFaixa()}
                >
                  {copy.disponibilidade.acrescentar}
                </button>
              </div>
            )}
          </fieldset>
        </div>
      </Painel>

      <Painel rotulo={copy.bloqueios.titulo} titulo={copy.bloqueios.titulo} apoio={copy.bloqueios.apoio}>
        <div className="flex flex-col gap-4">
          {proximos.length === 0 ? (
            <p className="m-0 text-[13px] text-texto-apoio">{copy.bloqueios.nenhum}</p>
          ) : (
            <ul
              aria-label={copy.bloqueios.rotuloDaLista}
              className="m-0 flex list-none flex-col gap-3 p-0"
            >
              {proximos.map(linhaDoBloqueio)}
            </ul>
          )}

          {/* O passado fica recolhido: não fecha mais nada, e é só histórico. */}
          {passados.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-[13px] text-texto-apoio">
                {copy.bloqueios.passados(passados.length)}
              </summary>
              <ul
                aria-label={copy.bloqueios.rotuloDosPassados}
                className="m-0 mt-3 flex list-none flex-col gap-3 p-0"
              >
                {passados.map(linhaDoBloqueio)}
              </ul>
            </details>
          ) : null}

          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[13px] font-semibold">{copy.bloqueios.novo}</legend>
            <LinhaDeCampos>
              <CampoDeTexto
                rotulo={copy.bloqueios.dataInicio}
                type="date"
                value={rascunho.dataInicio}
                disabled={travado}
                onChange={(evento) => setRascunho({ ...rascunho, dataInicio: evento.target.value })}
              />
              <CampoDeTexto
                rotulo={copy.bloqueios.horaInicio}
                type="time"
                value={rascunho.horaInicio}
                disabled={travado}
                onChange={(evento) => setRascunho({ ...rascunho, horaInicio: evento.target.value })}
              />
            </LinhaDeCampos>
            <LinhaDeCampos>
              <CampoDeTexto
                rotulo={copy.bloqueios.dataFim}
                type="date"
                value={rascunho.dataFim}
                disabled={travado}
                onChange={(evento) => setRascunho({ ...rascunho, dataFim: evento.target.value })}
              />
              <CampoDeTexto
                rotulo={copy.bloqueios.horaFim}
                type="time"
                value={rascunho.horaFim}
                disabled={travado}
                onChange={(evento) => setRascunho({ ...rascunho, horaFim: evento.target.value })}
              />
            </LinhaDeCampos>
            <CampoDeTexto
              rotulo={copy.bloqueios.motivo}
              exemplo={copy.bloqueios.exemploDoMotivo}
              value={rascunho.motivo}
              disabled={travado}
              onChange={(evento) => setRascunho({ ...rascunho, motivo: evento.target.value })}
            />
            {/* O bloqueio só reclama depois da primeira tentativa: um formulário
                em branco não está errado, está por preencher. */}
            {!somenteLeitura && tentouBloquear && !leituraDoBloqueio.ok ? (
              <p className="m-0 text-[12.5px] text-perigo">
                {copy.problemasDoBloqueio[leituraDoBloqueio.problema]}
              </p>
            ) : null}
            {somenteLeitura ? null : (
              <div>
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={travado}
                  onClick={() => void acrescentarBloqueio()}
                >
                  {copy.bloqueios.acrescentar}
                </button>
              </div>
            )}
          </fieldset>
        </div>
      </Painel>
    </div>
  )
}

function SeletorDeDia({
  valor,
  desabilitado,
  aoTrocar,
}: {
  valor: number
  desabilitado: boolean
  aoTrocar: (dia: number) => void
}) {
  // Campo próprio porque `Seletor` não trava: quem só lê vê o dia, sem trocar.
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">{copy.disponibilidade.dia}</span>
      <select
        value={String(valor)}
        aria-label={copy.disponibilidade.dia}
        disabled={desabilitado}
        onChange={(evento) => aoTrocar(Number(evento.target.value))}
        className="campo cursor-pointer py-2 text-[13.5px]"
      >
        {DIAS_NA_ORDEM_DA_SEMANA.map((numero) => (
          <option key={numero} value={numero}>
            {nomeDoDia(numero)}
          </option>
        ))}
      </select>
    </label>
  )
}
