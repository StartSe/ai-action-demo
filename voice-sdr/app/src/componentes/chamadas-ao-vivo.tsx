import { useMemo, useState, useSyncExternalStore } from 'react'

import { criarLojaAoVivo, criarRelogio } from '@/chamadas/ao-vivo'
import { useServicoDeChamadas } from '@/chamadas/contexto'
import { formatarDuracao, segundosDesde } from '@/chamadas/discador'
import { useOperacao } from '@/chamadas/operacao'
import type { ChamadaAoVivo } from '@/chamadas/tipos'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { Painel } from '@/componentes/painel'
import { aoVivo as copy } from '@/copy/chamadas'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { podeDiscar } from '@/equipe/papeis'

/**
 * As chamadas em curso da conta (RF-416), pela assinatura de `call_live`.
 *
 * A lista chega pela loja de `chamadas/ao-vivo.ts`, lida por
 * `useSyncExternalStore`, e a duração corre por um relógio próprio a cada
 * segundo, a partir de `iniciadaEm`. A transcrição não passa por aqui: quem a
 * quer abre a ficha da chamada.
 *
 * Encerrar é por chamada e chama `call-cancel`. O Observador vê a lista sem o
 * botão, pela mesma regra de quem disca: encerrar a ligação de alguém é agir
 * sobre o funil.
 */
export function ChamadasAoVivo() {
  const servico = useServicoDeChamadas()
  const loja = useMemo(() => criarLojaAoVivo(servico), [servico])
  const estado = useSyncExternalStore(loja.assinar, loja.ler)

  return (
    <Painel titulo={copy.titulo} apoio={copy.apoio}>
      {estado.fase === 'carregando' ? <Carregando texto={copy.carregando} /> : null}
      {estado.fase === 'erro' ? <CaixaDeErro>{copy.erro}</CaixaDeErro> : null}
      {estado.fase === 'pronto' && estado.chamadas.length === 0 ? (
        <p className="m-0 text-[13.5px] text-texto-apoio">{copy.vazio}</p>
      ) : null}
      {estado.fase === 'pronto' && estado.chamadas.length > 0 ? (
        <Lista chamadas={estado.chamadas} />
      ) : null}
    </Painel>
  )
}

function Lista({ chamadas }: { chamadas: readonly ChamadaAoVivo[] }) {
  const relogio = useMemo(() => criarRelogio(), [])
  const agora = useSyncExternalStore(relogio.assinar, relogio.ler)
  const operacao = useOperacao()
  const podeEncerrar = operacao.papel !== null && podeDiscar(operacao.papel)

  return (
    <ul aria-label={copy.lista} className="m-0 flex list-none flex-col gap-2 p-0">
      {chamadas.map((chamada) => (
        <Linha
          key={chamada.chamadaId}
          chamada={chamada}
          agora={agora}
          podeEncerrar={podeEncerrar}
        />
      ))}
    </ul>
  )
}

/**
 * O estado do sinal da IA (motion system, seção 07) para cada status de
 * `call_live`: chamando são os anéis carmim de quem disca, em conversa é o
 * núcleo que fala. Na fila fica o sinal em repouso. Decorativo: o status vai
 * escrito ao lado.
 */
const SINAL_DO_STATUS: Readonly<Record<string, string>> = {
  ringing: 'sinal-discando',
  in_progress: 'sinal-falando',
}

function nomeDoProposito(proposito: string): string {
  return (PROPOSITO_EM_PORTUGUES as Readonly<Record<string, string>>)[proposito] ?? proposito
}

function Linha({
  chamada,
  agora,
  podeEncerrar,
}: {
  chamada: ChamadaAoVivo
  agora: number
  podeEncerrar: boolean
}) {
  const servico = useServicoDeChamadas()
  const [encerrando, definirEncerrando] = useState(false)
  const [resposta, definirResposta] = useState<string | null>(null)
  const proposito = nomeDoProposito(chamada.proposito)

  async function encerrar() {
    definirEncerrando(true)
    const resultado = await servico.encerrar(chamada.chamadaId)
    definirEncerrando(false)
    definirResposta(resultado.mensagem)
  }

  return (
    <li className="bloco-secundario flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13.5px]">
      <span aria-hidden="true" className={`sinal h-9 w-9 ${SINAL_DO_STATUS[chamada.status] ?? ''}`} />
      <div className="flex min-w-0 flex-col">
        <span className="font-bold text-texto-principal">{proposito}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-texto-apoio">
          <span>{copy.status[chamada.status] ?? chamada.status}</span>
          {chamada.leadId ? null : <span>{copy.semLead}</span>}
        </span>
      </div>
      <span className="flex items-center gap-2 font-bold text-menta-2">
        <span aria-hidden="true" className="ao-vivo" />
        <span className="val" aria-label={copy.duracao}>
          {formatarDuracao(segundosDesde(chamada.iniciadaEm, agora))}
        </span>
      </span>
      {podeEncerrar ? (
        <button
          type="button"
          className="botao-perigo ml-auto px-3 py-1.5 text-[12.5px]"
          aria-label={copy.rotuloDoEncerrar(proposito)}
          disabled={encerrando}
          onClick={() => {
            void encerrar()
          }}
        >
          {encerrando ? copy.encerrando : copy.encerrar}
        </button>
      ) : null}
      {resposta ? (
        <p role="status" className="m-0 w-full text-[12.5px] text-texto-apoio">
          {resposta}
        </p>
      ) : null}
    </li>
  )
}
