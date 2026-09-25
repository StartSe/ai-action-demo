// A porta do diagnóstico em memória: o banco, o cofre, a ElevenLabs e o
// modelo, todos dublados. Módulo de dado, sem `vitest` dentro: o teste da
// borda e o dublê da interface usam a mesma, e é o que faz a tela mostrar o
// que `atenderDiagnostico` concluiria de verdade sobre a fixture.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import type { ModeloResolvido } from '../_shared/modelo/resolucao.ts'
import type { RespostaDoModelo } from '../_shared/modelo/pergunta.ts'

import {
  agente,
  AGENTE_DE_EXEMPLO,
  configuracaoDasConversas,
  CONVERSA_DE_EXEMPLO,
  PODE_SIM_E_DESLIGA,
} from './conversas-de-exemplo.ts'
import type {
  ChamadaParaDiagnosticar,
  ConfiguracaoGravada,
  EventoDeIntegracao,
  LinhaDoDiagnostico,
  PedidoAoModelo,
  PortaDoDiagnostico,
  PublicacaoDoProposito,
} from './diagnostico.ts'
import { CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS, caminhoDaConversa, caminhoDoAgente } from './formato-do-provedor.ts'

export const CHAVE_DA_VOZ_DE_EXEMPLO = 'sk_voz_da_conta_exemplo_123'
export const USUARIO_DE_EXEMPLO = 'u-admin'

export const CONFIGURACAO_GRAVADA_DE_EXEMPLO: ConfiguracaoGravada = {
  vozId: 'voz_marina',
  estado: {
    identidade: {
      nome: 'Sarah',
      primeiraFala: 'Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, da {empresa}.',
      oferta: 'Rastreamento de frota.',
      nuncaAfirmar: [],
    },
    roteiros: {
      discovery: { roteiro: '1. Cumprimente.\n2. Pergunte pela frota.\n3. Encerre quando o lead aceitar.', jeitoDaCasa: '' },
    },
    voz: { stability: 0.5 },
    politica: {
      duracao_maxima: 600,
      intervalo_minimo: 60,
      tentativas_por_numero: 3,
      teto_diario: 200,
      simultaneidade: 2,
    },
    avisoDeGravacao: null,
  },
}

/** A resposta do modelo para o caso do "pode sim", no formato do esquema. */
export const RESPOSTA_DO_MODELO_DE_EXEMPLO = JSON.stringify({
  causa_provavel: 'A Sarah tratou o "pode sim" como aceite final e chamou a ferramenta de encerrar.',
  diagnostico:
    'A ligação durou 9 segundos. Depois da primeira fala, o lead disse "Pode sim." e a Sarah chamou end_call com a razão "O lead confirmou." O roteiro manda encerrar quando o lead aceitar, e a Sarah leu a permissão para falar como aceite.',
  propostas: [
    {
      alvo: 'roteiro.discovery',
      titulo: 'Não encerrar quando o lead só autoriza a conversa',
      razao: 'O passo 3 manda encerrar quando o lead aceitar, e "pode sim" é autorização para continuar.',
      texto: '1. Cumprimente.\n2. Pergunte pela frota.\n3. Resposta curta como "pode sim" é para seguir: faça a primeira pergunta.\n4. Encerre só depois de combinar o próximo passo.',
      lista: null,
      numero: null,
      ajustes: null,
    },
    {
      alvo: 'identidade.cargo',
      titulo: 'Alvo inventado',
      razao: 'Deve ser recusado.',
      texto: 'x',
      lista: null,
      numero: null,
      ajustes: null,
    },
  ],
})

export interface OpcoesDaPortaEmMemoria {
  readonly chamada?: Partial<ChamadaParaDiagnosticar> | null
  readonly papel?: string | null
  readonly publicacao?: PublicacaoDoProposito | null
  readonly configuracao?: ConfiguracaoGravada
  readonly semChave?: boolean
  /** O corpo de cada caminho do provedor. `number` responde aquele status sem corpo. */
  readonly provedor?: Readonly<Record<string, unknown>>
  /** O texto que o modelo devolve; `null` é o modelo fora do ar; `'sem_credencial'`, sem modelo conectado. */
  readonly modelo?: string | null | 'sem_credencial'
  /** O registro de integração que falha, para provar que ele não derruba a análise. */
  readonly registroFalha?: boolean
}

export interface PortaEmMemoria {
  readonly porta: PortaDoDiagnostico
  readonly gravados: (LinhaDoDiagnostico & { id: string; created_at: string })[]
  readonly eventos: EventoDeIntegracao[]
  readonly pedidosAoModelo: PedidoAoModelo[]
  readonly consultas: string[]
}

/** Os corpos padrão: o caso do "pode sim", com agente e avisos em ordem. */
export function provedorDeExemplo(sobre: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    [caminhoDaConversa(CONVERSA_DE_EXEMPLO)]: PODE_SIM_E_DESLIGA,
    [caminhoDoAgente(AGENTE_DE_EXEMPLO)]: agente(),
    [CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS]: configuracaoDasConversas(),
    ...sobre,
  }
}

export function criarPortaEmMemoria(opcoes: OpcoesDaPortaEmMemoria = {}): PortaEmMemoria {
  const gravados: PortaEmMemoria['gravados'] = []
  const eventos: EventoDeIntegracao[] = []
  const pedidosAoModelo: PedidoAoModelo[] = []
  const consultas: string[] = []
  const provedor = opcoes.provedor ?? provedorDeExemplo()
  const modelo = opcoes.modelo === undefined ? RESPOSTA_DO_MODELO_DE_EXEMPLO : opcoes.modelo

  const porta: PortaDoDiagnostico = {
    async usuarioDaSessao(jwt) {
      return jwt === 'invalido' ? null : { id: USUARIO_DE_EXEMPLO }
    },
    async papelNaConta() {
      return opcoes.papel === undefined ? 'admin' : opcoes.papel
    },
    async lerChamada(_contaId, chamadaId) {
      if (opcoes.chamada === null) return null
      return {
        id: chamadaId,
        status: 'ended',
        end_reason: 'completed',
        direction: 'outbound',
        duration_sec: 9,
        purpose: 'discovery',
        provider_conversation_id: CONVERSA_DE_EXEMPLO,
        ...opcoes.chamada,
      }
    },
    async lerPublicacao() {
      return opcoes.publicacao === undefined
        ? { provider_agent_id: AGENTE_DE_EXEMPLO, status: 'publicado' }
        : opcoes.publicacao
    },
    async lerConfiguracaoGravada() {
      return opcoes.configuracao ?? CONFIGURACAO_GRAVADA_DE_EXEMPLO
    },
    async credencialDaVoz() {
      return opcoes.semChave
        ? { ok: false, motivo: 'ausente' }
        : { ok: true, valor: CHAVE_DA_VOZ_DE_EXEMPLO, origem: 'conta' }
    },
    async consultarVoz(caminho, chave) {
      consultas.push(caminho)
      if (chave !== CHAVE_DA_VOZ_DE_EXEMPLO) return { ok: false, status: 401, latenciaMs: 1, corpo: null }
      const corpo = provedor[caminho]
      if (corpo === undefined) return { ok: false, status: 404, latenciaMs: 1, corpo: null }
      if (typeof corpo === 'number') return { ok: false, status: corpo, latenciaMs: 1, corpo: null }
      return { ok: true, status: 200, latenciaMs: 1, corpo }
    },
    async modeloDaConta(): Promise<ModeloResolvido> {
      return modelo === 'sem_credencial'
        ? { porta: 'platform', modelo: 'claude-opus-5', escolhidoPelaConta: false }
        : { porta: 'openrouter', modelo: 'anthropic/claude-opus-5', escolhidoPelaConta: true }
    },
    async perguntarAoModelo(pedido): Promise<RespostaDoModelo> {
      pedidosAoModelo.push(pedido)
      if (modelo === 'sem_credencial') return { ok: false, codigo: 'sem_credencial', status: null }
      if (modelo === null) return { ok: false, codigo: '503', status: 503 }
      return { ok: true, status: 200, texto: modelo, endpoint: 'api/v1/chat/completions' }
    },
    async gravarDiagnostico(linha) {
      const gravado = { ...linha, id: `d-${gravados.length + 1}`, created_at: '2026-09-24T13:05:00.000Z' }
      gravados.push(gravado)
      return { id: gravado.id, created_at: gravado.created_at }
    },
    async registrarEventoDeIntegracao(evento) {
      if (opcoes.registroFalha) throw new Error('registro fora do ar')
      eventos.push(evento)
    },
  }

  return { porta, gravados, eventos, pedidosAoModelo, consultas }
}
