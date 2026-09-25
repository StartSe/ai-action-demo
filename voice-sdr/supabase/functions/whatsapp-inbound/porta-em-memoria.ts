// O canal de WhatsApp em memória: conversas, mensagens, bloqueios, fila e
// envios, com as mesmas regras dos RPCs da migração (uma conversa ativa por
// número, `messageId` único por conta, reivindicação da resposta). Serve aos
// testes da entrada e da resposta, e a quem quiser dublar o canal inteiro.
//
// Não é arquivo de teste: não importa vitest.

import type { MensagemDoHistorico, PortaDoMotor } from '../_shared/whatsapp/conversa.ts'
import type {
  AgenteDaConta,
  ConversaGravada,
  ItemDaConversaNaFila,
  LeadDaConversa,
  PortaDaResposta,
  SaidaParaGravar,
} from '../_shared/whatsapp/resposta.ts'
import {
  lerMidiaDaMensagem,
  type Buscar,
  type EventoDaLeitura,
  type PortaDaMidia,
} from '../_shared/whatsapp/midia.ts'
import { modoAtendeONumero, type ModoDoWhatsapp } from '../_shared/whatsapp/modo.ts'
import type { CredenciaisDaZapi, EnvioDaZapi } from '../_shared/whatsapp/zapi.ts'

import type { LeadParaRegistrar, PortaDaEntrada } from './entrada.ts'
import type { PortasExtrasDoCanal } from './portas-do-supabase.ts'

export interface MensagemEmMemoria {
  readonly id: string
  readonly conversaId: string
  readonly direcao: 'in' | 'out'
  readonly autor: 'lead' | 'assistente' | 'humano' | 'sistema'
  readonly autorId: string | null
  readonly texto: string
  readonly midia: string | null
  readonly idDoProvedor: string | null
  status: string
  /** `media_status` e `media_text`. */
  estadoDaLeitura: 'pendente' | 'lida' | 'falhou' | null
  leitura: string | null
  readonly em: number
}

export interface CanalEmMemoria {
  readonly porta: PortaDaEntrada & PortaDaResposta & PortasExtrasDoCanal
  readonly conversas: Map<string, ConversaGravada & { replyingAt: number | null }>
  readonly mensagens: MensagemEmMemoria[]
  readonly leads: Map<string, LeadParaRegistrar & { id: string }>
  readonly bloqueados: Set<string>
  readonly fila: (ItemDaConversaNaFila | { tipo: 'bloqueio'; conversaId: string })[]
  readonly envios: { telefone: string; texto: string }[]
  readonly eventos: { conversaId: string; acao: string }[]
  /** Membros da porta tocados, na ordem. */
  readonly tocados: string[]
  ligado: boolean
  /**
   * O modo do canal. O padrão do dublê é `todos`, ao contrário do banco
   * (`teste`): os testes que não são sobre o modo não precisam cadastrar o
   * número de exemplo na lista.
   */
  modo: ModoDoWhatsapp
  numerosDeTeste: Set<string>
  credenciais: CredenciaisDaZapi | null
  agente: AgenteDaConta | null
  motor: PortaDoMotor
  envioFalha: boolean
  /** O `fetch` do download da mídia. Padrão: nenhum arquivo existe (404). */
  buscarMidia: Buscar
  /** O modelo das tarefas de mídia. Padrão: sem modelo conectado. */
  modeloDaMidia: PortaDaMidia['lerComModelo']
  /** O que a leitura de mídia registrou em `integration_events`. */
  readonly eventosDeIntegracao: EventoDaLeitura[]
}

export interface OpcoesDoCanal {
  readonly agente?: AgenteDaConta | null
  readonly motor?: PortaDoMotor
}

export function criarCanalEmMemoria(opcoes: OpcoesDoCanal = {}): CanalEmMemoria {
  // Relógio lógico: cada escrita e cada reivindicação avança um tique. É o que
  // dá a "chegou depois do corte" uma resposta determinística.
  let relogio = 0
  const tique = () => (relogio += 1)
  let sequencia = 0
  // Uuid de verdade na forma, porque as bordas conferem a forma antes de ler.
  // O prefixo vira os primeiros dígitos, para a mensagem de falha dizer o que é.
  const PREFIXOS: Record<string, string> = { lead: '1ead', conversa: 'c0c0', msg: '3e55', zapi: '2a91' }
  const novoId = (prefixo: string) =>
    `${PREFIXOS[prefixo] ?? '0000'}0000-0000-4000-8000-${String((sequencia += 1)).padStart(12, '0')}`

  const estado: Omit<CanalEmMemoria, 'porta'> = {
    conversas: new Map(),
    mensagens: [],
    leads: new Map(),
    bloqueados: new Set(),
    fila: [],
    envios: [],
    eventos: [],
    tocados: [],
    ligado: true,
    modo: 'todos',
    numerosDeTeste: new Set(),
    credenciais: { instance_id: 'INST', token: 'TOK', client_token: 'SEG' },
    agente: opcoes.agente ?? null,
    motor: opcoes.motor ?? { ferramentas: new Map(), rodada: async () => ({ ok: false, codigo: 'sem_credencial' }) },
    envioFalha: false,
    buscarMidia: async () => new Response(null, { status: 404 }),
    modeloDaMidia: async () => ({ ok: false, codigo: 'sem_credencial', status: null, modelo: 'google/gemini-3.1-flash-lite' }),
    eventosDeIntegracao: [],
  }
  const canal = estado as CanalEmMemoria

  const mudar = (conversaId: string, de: string[], para: ConversaGravada['status'], acao: string): string => {
    const conversa = estado.conversas.get(conversaId)
    if (!conversa) return 'nao_encontrada'
    if (!de.includes(conversa.status)) return conversa.status === para ? 'mesmo_estado' : 'estado_incompativel'
    estado.conversas.set(conversaId, { ...conversa, status: para })
    estado.eventos.push({ conversaId, acao })
    return 'mudou'
  }

  const porta: PortaDaEntrada & PortaDaResposta & PortasExtrasDoCanal = {
    async telefoneDoLead(_conta, leadId) {
      return estado.leads.get(leadId)?.phone_e164 ?? null
    },
    async mudarEstado(_conta, conversaId, de, para, acao) {
      return mudar(conversaId, [...de], para, acao)
    },
    async atualizarEntregas(_conta, ids, status) {
      for (const mensagem of estado.mensagens) if (mensagem.idDoProvedor && ids.includes(mensagem.idDoProvedor)) mensagem.status = status
    },
    async mensagemExistente(_conta, idDoProvedor) {
      const achada = estado.mensagens.find((mensagem) => mensagem.idDoProvedor === idDoProvedor)
      return achada ? { conversaId: achada.conversaId } : null
    },
    async registrarLead(_conta, lead) {
      const existente = [...estado.leads.values()].find((item) => item.phone_e164 === lead.phone_e164)
      if (existente) return existente.id
      const id = novoId('lead')
      estado.leads.set(id, { ...lead, id })
      return id
    },
    async abrirConversa(conta, telefone, leadId) {
      const ativa = [...estado.conversas.values()].find((c) => c.phone_e164 === telefone && c.status !== 'encerrada')
      if (ativa) return { conversaId: ativa.id, criada: false }
      const id = novoId('conversa')
      estado.conversas.set(id, {
        id,
        account_id: conta,
        lead_id: leadId,
        phone_e164: telefone,
        status: 'assistente',
        purpose: 'discovery',
        slot_offers: [],
        replyingAt: null,
      })
      estado.eventos.push({ conversaId: id, acao: 'iniciada' })
      return { conversaId: id, criada: true }
    },
    async registrarEntrada(_conta, conversaId, mensagem) {
      const repetida = estado.mensagens.find((item) => item.idDoProvedor === mensagem.idDoProvedor)
      if (repetida) return { mensagemId: repetida.id, nova: false }
      const id = novoId('msg')
      estado.mensagens.push({
        id,
        conversaId,
        direcao: 'in',
        autor: 'lead',
        autorId: null,
        texto: mensagem.texto,
        midia: mensagem.midia,
        idDoProvedor: mensagem.idDoProvedor,
        status: 'recebida',
        estadoDaLeitura: mensagem.leitura,
        leitura: null,
        em: tique(),
      })
      return { mensagemId: id, nova: true }
    },
    async lerMidia(conta, mensagemId, midia, anexo) {
      return await lerMidiaDaMensagem(
        { contaId: conta, mensagemId, midia, anexo },
        {
          buscar: (url, init) => canal.buscarMidia(url, init),
          lerComModelo: (...argumentos) => canal.modeloDaMidia(...argumentos),
          async gravarLeitura(_conta, id, estadoDaLeitura, texto) {
            const mensagem = estado.mensagens.find((item) => item.id === id)
            if (mensagem) Object.assign(mensagem, { estadoDaLeitura, leitura: texto })
          },
          async registrarEvento(evento) {
            estado.eventosDeIntegracao.push(evento)
          },
        },
      )
    },
    async bloquear(_conta, telefone) {
      const criado = !estado.bloqueados.has(telefone)
      estado.bloqueados.add(telefone)
      return { criado }
    },
    async encerrarPorDescadastro(_conta, conversaId) {
      return mudar(conversaId, ['assistente', 'humano'], 'encerrada', 'encerrada')
    },
    async abrirItemDeBloqueio(_conta, conversa) {
      estado.fila.push({ tipo: 'bloqueio', conversaId: conversa.id })
    },

    async reivindicar(_conta, conversaId) {
      const conversa = estado.conversas.get(conversaId)
      if (!conversa || conversa.status !== 'assistente') return null
      if (conversa.replyingAt !== null) return null
      const instante = tique()
      estado.conversas.set(conversaId, { ...conversa, replyingAt: instante })
      return new Date(instante).toISOString()
    },
    async soltar(_conta, conversaId, corte) {
      const conversa = estado.conversas.get(conversaId)
      const corteMs = Date.parse(corte)
      if (conversa && conversa.replyingAt === corteMs) estado.conversas.set(conversaId, { ...conversa, replyingAt: null })
      return estado.mensagens.some((m) => m.conversaId === conversaId && m.direcao === 'in' && m.em > corteMs)
    },
    async lerConversa(_conta, conversaId) {
      const conversa = estado.conversas.get(conversaId)
      if (!conversa) return null
      return {
        id: conversa.id,
        account_id: conversa.account_id,
        lead_id: conversa.lead_id,
        phone_e164: conversa.phone_e164,
        status: conversa.status,
        purpose: conversa.purpose,
        slot_offers: conversa.slot_offers,
      }
    },
    async canalLigado() {
      return canal.ligado
    },
    async atendeONumero(_conta, telefone) {
      return modoAtendeONumero(canal.modo, canal.numerosDeTeste, telefone)
    },
    async numeroBloqueado(_conta, telefone) {
      return estado.bloqueados.has(telefone)
    },
    async credenciais() {
      return canal.credenciais
    },
    async enviar(_credenciais, telefone, texto): Promise<EnvioDaZapi> {
      if (canal.envioFalha) return { ok: false, codigo: '500', status: 500, idDoProvedor: null }
      estado.envios.push({ telefone, texto })
      return { ok: true, status: 200, idDoProvedor: novoId('zapi') }
    },
    async registrarSaida(saida: SaidaParaGravar) {
      const id = novoId('msg')
      estado.mensagens.push({
        id,
        conversaId: saida.conversaId,
        direcao: 'out',
        autor: saida.autor,
        autorId: saida.autorId,
        texto: saida.texto,
        midia: null,
        idDoProvedor: saida.envio.idDoProvedor ?? null,
        status: saida.envio.ok ? 'enviada' : 'falhou',
        estadoDaLeitura: null,
        leitura: null,
        em: tique(),
      })
      return id
    },
    async abrirItemNaFila(item) {
      estado.fila.push(item)
    },
    async agente() {
      return canal.agente
    },
    async lead(_conta, leadId): Promise<LeadDaConversa | null> {
      const lead = estado.leads.get(leadId)
      return lead ? { nome: lead.name, empresa: null, cidade: lead.city, contexto: null, fuso: lead.timezone } : null
    },
    async fusoDaConta() {
      return 'America/Sao_Paulo'
    },
    async historico(_conta, conversaId, limite): Promise<MensagemDoHistorico[]> {
      return estado.mensagens
        .filter((mensagem) => mensagem.conversaId === conversaId)
        .slice(-limite)
        .map((mensagem) => ({
          direcao: mensagem.direcao,
          autor: mensagem.autor,
          texto: mensagem.texto,
          midia: mensagem.midia,
          leitura: mensagem.leitura,
          estadoDaLeitura: mensagem.estadoDaLeitura,
        }))
    },
    async motor() {
      return canal.motor
    },
  }

  // Cada membro tocado entra na lista: é assim que "recusa antes de tocar a
  // porta" vira asserção.
  const vigiada = new Proxy(porta, {
    get(alvo, membro, receptor) {
      if (typeof membro === 'string') estado.tocados.push(membro)
      return Reflect.get(alvo, membro, receptor)
    },
  })
  return Object.assign(canal, { porta: vigiada })
}
