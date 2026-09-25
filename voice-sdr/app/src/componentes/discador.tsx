import { PROPOSITOS, type Proposito } from '@compartilhado/playbook/camada-um.ts'
import { faltaParaAbrir } from '@compartilhado/discagem/portao.ts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'

import { useServicoDeChamadas } from '@/chamadas/contexto'
import {
  bloqueioAntesDeDiscar,
  destinoDoLead,
  destinosDoDiscador,
  type Destino,
} from '@/chamadas/discador'
import { useOperacao } from '@/chamadas/operacao'
import type { Discador as DadosDoDiscador, ResultadoDaLigacao } from '@/chamadas/tipos'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { EstimativaDeCusto } from '@/componentes/estimativa-de-custo'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Seletor } from '@/componentes/seletor'
import { discador as copy } from '@/copy/chamadas'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { podeDiscar } from '@/equipe/papeis'

const CHAVE_DO_DISCADOR = ['discador'] as const

/** Onde a lista de teste se cadastra, como a frase da guarda diz. */
const ONDE_CADASTRAR = '/config/discagem'

/** O lead da ficha, quando o discador é o dela. */
export interface LeadDaFicha {
  id: string
  nome: string
  telefone: string
}

interface Recusa {
  mensagem: string
  alternativa: string | null
}

/**
 * O discador manual (RF-401), no painel e na ficha do lead.
 *
 * Três decisões explicam o desenho:
 *
 * 1. **Só se oferece o que a guarda deixaria passar.** Com o portão fechado
 *    (US-074) a lista tem só os números de teste, e a tela diz por quê e onde
 *    cadastrar. A regra é `podeDiscarPara`, e não há outro caminho para o
 *    número: o seletor é a única entrada. Quem recusa de verdade continua
 *    sendo o servidor.
 * 2. **A recusa aparece e fica.** Motivo e alternativa (RF-407), em
 *    `role="alert"`, até a pessoa fechar ou tentar de novo. Nenhum
 *    temporizador a apaga: recusa que pisca é recusa que ninguém leu.
 * 3. **Um uuid por tentativa, gerado aqui.** Ele é a chave de idempotência de
 *    `call-place`: o segundo clique leva a mesma chave e volta `ja_existia`.
 *    Além disso a tela não manda o segundo pedido enquanto o primeiro viaja.
 */
export function Discador({ lead }: { lead?: LeadDaFicha }) {
  const servico = useServicoDeChamadas()
  const operacao = useOperacao()

  const consulta = useQuery({
    queryKey: CHAVE_DO_DISCADOR,
    queryFn: () => servico.carregarDiscador(),
  })

  if (consulta.isPending || !operacao.carregada) {
    return (
      <Moldura>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const carga = consulta.data
  if (!carga?.ok) {
    return (
      <Moldura>
        <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      </Moldura>
    )
  }

  if (operacao.papel !== null && !podeDiscar(operacao.papel)) {
    return (
      <Moldura>
        <NegativaPorPapel aviso={copy.negativa} administradores={operacao.administradores} />
      </Moldura>
    )
  }

  return (
    <Moldura>
      <Formulario discador={carga.discador} lead={lead} />
    </Moldura>
  )
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <Painel titulo={copy.titulo} apoio={copy.apoio}>
      {children}
    </Painel>
  )
}

function Formulario({ discador, lead }: { discador: DadosDoDiscador; lead?: LeadDaFicha }) {
  const falta = faltaParaAbrir(discador.portao)
  const portaoFechado = falta.length > 0

  const destinos: Destino[] = lead
    ? [destinoDoLead(lead, discador)].filter((destino) => destino !== null)
    : destinosDoDiscador(discador)

  return (
    <div className="flex flex-col gap-4">
      {/* Sem destino nenhum, quem explica é o vazio, com o mesmo endereço. */}
      {portaoFechado && (lead || destinos.length > 0) ? <AvisoDoPortao falta={falta} /> : null}

      {lead && destinos.length === 0 ? (
        <CaixaDeErro tom="atencao">
          {portaoFechado ? copy.portaoFechado.leadForaDaLista : copy.portaoFechado.telefoneInvalido}
        </CaixaDeErro>
      ) : null}

      {!lead && destinos.length === 0 ? (
        <EstadoVazio
          titulo={copy.vazio.titulo}
          explicacao={copy.vazio.explicacao}
          acao={{ rotulo: copy.vazio.acao, endereco: ONDE_CADASTRAR }}
        />
      ) : null}

      {destinos.length > 0 ? <Escolhas discador={discador} destinos={destinos} /> : null}
    </div>
  )
}

function AvisoDoPortao({ falta }: { falta: readonly (keyof typeof copy.portaoFechado.falta)[] }) {
  return (
    <div className="bloco-secundario px-4 py-3 text-[13.5px]">
      <p className="m-0 font-semibold text-texto-principal">{copy.portaoFechado.titulo}</p>
      <p className="mt-1 mb-0 text-texto-apoio">{copy.portaoFechado.explicacao}</p>
      <ul className="mt-2 mb-0 pl-5 text-texto-apoio">
        {falta.map((item) => (
          <li key={item}>{copy.portaoFechado.falta[item]}</li>
        ))}
      </ul>
      <a href={ONDE_CADASTRAR} className="botao-link mt-2 inline-block">
        {copy.portaoFechado.cadastrar}
      </a>
    </div>
  )
}

function novaReferencia(): string {
  return crypto.randomUUID()
}

function Escolhas({ discador, destinos }: { discador: DadosDoDiscador; destinos: Destino[] }) {
  const servico = useServicoDeChamadas()
  const operacao = useOperacao()

  const [chaveDoDestino, definirChaveDoDestino] = useState<string | null>(null)
  const [proposito, definirProposito] = useState<Proposito>('discovery')
  const [linhaId, definirLinhaId] = useState('')
  const [referencia, definirReferencia] = useState(novaReferencia)
  const [enviando, definirEnviando] = useState(false)
  const [recusa, definirRecusa] = useState<Recusa | null>(null)
  const [aviso, definirAviso] = useState<string | null>(null)
  // O estado `enviando` só vale depois do próximo desenho; dois cliques no
  // mesmo quadro passariam os dois. A trava de verdade é esta.
  const emVoo = useRef(false)

  // O destino à vista se deriva: o escolhido, se ainda estiver na lista, senão
  // o primeiro. Sincronizar por efeito o lint desta base recusa.
  const destino = destinos.find((cada) => cada.chave === chaveDoDestino) ?? destinos[0]

  async function ligar() {
    if (emVoo.current || !destino) return

    const bloqueio = bloqueioAntesDeDiscar(operacao.freio, operacao.papel)
    if (bloqueio) {
      definirAviso(null)
      definirRecusa(copy.bloqueio[bloqueio])
      return
    }

    emVoo.current = true
    definirEnviando(true)
    definirRecusa(null)
    definirAviso(null)

    let resultado: ResultadoDaLigacao
    try {
      resultado = await servico.discar({
        telefone: destino.telefone,
        leadId: destino.leadId,
        proposito,
        linhaId: linhaId || null,
        referencia,
      })
    } catch {
      resultado = { ok: false, motivo: 'sem_resposta', mensagem: '', alternativa: null }
    }

    emVoo.current = false
    definirEnviando(false)
    // A tentativa acabou, e a próxima é outra ligação: chave nova.
    definirReferencia(novaReferencia())
    if (resultado.ok) {
      definirAviso(resultado.mensagem)
    } else {
      definirRecusa({
        mensagem: resultado.mensagem || copy.semResposta,
        alternativa: resultado.alternativa,
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Seletor
          rotulo={copy.destino}
          valor={destino?.chave ?? ''}
          aoTrocar={definirChaveDoDestino}
        >
          {destinos.map((cada) => (
            <option key={cada.chave} value={cada.chave}>
              {copy.destinoRotulo(cada.deTeste ? copy.deTeste(cada.rotulo) : cada.rotulo, cada.telefone)}
            </option>
          ))}
        </Seletor>
        <Seletor
          rotulo={copy.proposito}
          valor={proposito}
          aoTrocar={(valor) => definirProposito(valor as Proposito)}
        >
          {PROPOSITOS.map((cada) => (
            <option key={cada} value={cada}>
              {PROPOSITO_EM_PORTUGUES[cada]}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo={copy.origem} valor={linhaId} aoTrocar={definirLinhaId}>
          <option value="">{copy.rodizio}</option>
          {discador.linhas.map((linha) => (
            <option key={linha.id} value={linha.id}>
              {copy.destinoRotulo(linha.rotulo, linha.e164)}
            </option>
          ))}
        </Seletor>
      </div>

      <EstimativaDeCusto />

      {/* Ligar é o botão menta do design system ("iniciar ligação"): confirma
          e avança, e não disputa com o carmim de quem para a operação. Enquanto
          o pedido viaja, o sinal da IA disca ao lado. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="botao-menta"
          disabled={enviando}
          onClick={() => {
            void ligar()
          }}
        >
          {enviando ? copy.discando : copy.discar}
        </button>
        {enviando ? <span aria-hidden="true" className="sinal sinal-discando h-7 w-7" /> : null}
      </div>

      {recusa ? (
        <CaixaDeErro>
          <p className="m-0 font-semibold">{copy.recusaTitulo}</p>
          <p className="mt-1 mb-0">{recusa.mensagem}</p>
          {recusa.alternativa ? <p className="mt-1 mb-0">{recusa.alternativa}</p> : null}
          <button
            type="button"
            className="botao-link mt-2"
            onClick={() => definirRecusa(null)}
          >
            {copy.fecharRecusa}
          </button>
        </CaixaDeErro>
      ) : null}

      {aviso ? (
        <p
          role="status"
          className="m-0 flex items-center gap-2 rounded-controle border border-positivo-borda bg-positivo-fundo px-3.5 py-2.5 text-[13.5px] text-texto-secundario"
        >
          <span aria-hidden="true" className="ao-vivo" />
          {aviso}
        </p>
      ) : null}
    </div>
  )
}
