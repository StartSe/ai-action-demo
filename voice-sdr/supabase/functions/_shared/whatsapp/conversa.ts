// O motor da conversa por WhatsApp: a mesma assistente, por texto.
//
// **A mesma identidade e o mesmo roteiro.** O sistema é o prompt das três
// camadas que `_shared/agente/compilador.ts` compila para a publicação do
// propósito (regras travadas, roteiro publicado, jeito da casa), com as
// variáveis do lead preenchidas aqui — nunca um `{marcador}` cru — e o bloco
// do canal (`INSTRUCAO_DO_CANAL`) no fim, que vence o que for de voz. Não há
// segunda versão do texto da assistente para o WhatsApp: mudar o roteiro na
// tela muda a ligação e a mensagem juntas.
//
// **A identidade é a publicada.** Quem monta o contexto lê a assistente do
// retrato que a publicação gravou (`_shared/agente/retrato-da-publicacao.ts`),
// não da linha em edição: o WhatsApp muda quando a voz muda, na publicação. O
// jeito do canal (`identidade.jeito`) soma ao jeito da casa só aqui.
//
// **As ferramentas são as da ligação.** O modelo recebe, por function calling,
// as ferramentas nossas do propósito na fatia do canal (`FATIA_DO_WHATSAPP`),
// com os mesmos nomes e as mesmas descrições da publicação, porque a camada 1
// manda chamar `tool-dnc`, `tool-transfer` e as outras pelo nome. Quem executa
// é quem chama o motor, pelo mapa `ferramentas`: o motor só conversa.
//
// **A resposta passa por crivo antes de sair** (`conferirResposta`): sem
// marcador, sem identificador, sem horário que não esteja numa oferta da
// conversa, dentro do tamanho. Recusada, o modelo tem uma chance de reescrever;
// recusada de novo, nada sai e quem chama abre item na fila.
//
// **Sem modelo conectado, o motor não inventa resposta**: devolve `sem_modelo`
// e quem chama cala e abre o item na fila.
//
// Módulo portável: sem `Deno`, sem rede. O modelo entra por `rodada`.

import {
  compilarPublicacao,
  DESCRICOES_DAS_FERRAMENTAS,
  ferramentasDoProposito,
  type Fatia,
  type PlaybookPublicado,
  type PoliticaDaConta,
} from '../agente/compilador.ts'
import type {
  ChamadaDeFerramenta,
  FerramentaDoModelo,
  MensagemDoModelo,
  PedidoDaRodada,
  RespostaDaRodada,
} from '../modelo/conversa-com-ferramentas.ts'
import type { Proposito } from '../playbook/camada-um.ts'
import type { LinhaDeCriterio } from '../qualificacao/avaliacao.ts'
import { GATILHO_DE_ABERTURA, INSTRUCAO_DE_ABERTURA, INSTRUCAO_DO_CANAL } from '../speech/whatsapp.ts'
import type { ResultadoDaExecucaoDireta } from '../tools/execucao-direta.ts'

/**
 * A fatia cujas ferramentas o canal oferece. É a da agenda (F5): o WhatsApp
 * nasce com qualificação e marcação, que já têm executor nesta base, sem
 * esperar a integração subir `FATIA_PUBLICADA` para a voz.
 */
export const FATIA_DO_WHATSAPP: Fatia = 'F5'

/** Quantas mensagens do histórico vão ao modelo. */
export const MENSAGENS_DO_HISTORICO = 30

/** Quantas idas ao modelo uma resposta pode gastar, com as ferramentas. */
export const MAXIMO_DE_RODADAS = 5

/** O tamanho máximo da mensagem que sai. Acima disso é texto de e-mail. */
export const TAMANHO_MAXIMO = 1000

/** O teto de saída de cada ida, em tokens. */
export const TETO_DE_SAIDA = 800

export interface IdentidadeDoCanal {
  readonly nome: string
  readonly empresa: string
  readonly oferta: string | null
  readonly nuncaAfirmar: readonly string[]
  /**
   * O jeito da assistente só no WhatsApp (`agents.whatsapp_channel_style`, do
   * retrato publicado). Entra depois do jeito da casa, como na voz o dela.
   */
  readonly jeito?: string | null
}

export interface LeadDoCanal {
  readonly nome: string | null
  readonly empresa: string | null
  readonly cidade: string | null
  /** O que se sabe do lead (briefing), em texto curto. */
  readonly contexto: string | null
}

export interface MensagemDoHistorico {
  readonly direcao: 'in' | 'out'
  readonly autor: 'lead' | 'assistente' | 'humano' | 'sistema'
  /** O que o lead escreveu (a legenda, na mídia). */
  readonly texto: string
  readonly midia: string | null
  /** A transcrição do áudio ou a descrição da imagem (`media_text`). */
  readonly leitura?: string | null
  /** `media_status`, com a pendente vencida já lida como `falhou`. */
  readonly estadoDaLeitura?: 'pendente' | 'lida' | 'falhou' | null
}

export interface ContextoDaConversa {
  readonly proposito: Proposito
  readonly identidade: IdentidadeDoCanal
  readonly playbook: PlaybookPublicado
  readonly politica: PoliticaDaConta
  readonly criteriosDaConta?: readonly LinhaDeCriterio[]
  readonly lead: LeadDoCanal | null
  /** Da mais antiga para a mais nova. O motor usa as últimas `MENSAGENS_DO_HISTORICO`. */
  readonly historico: readonly MensagemDoHistorico[]
  /** Início das ofertas de horário já gravadas na conversa, em ISO. */
  readonly ofertas: readonly string[]
  /** O fuso em que o lead lê os horários. */
  readonly fusoDoLead: string
  /** A assistente abre a conversa (whatsapp-send `iniciar`). */
  readonly abertura?: boolean
  /** Agora, em ISO: o modelo precisa saber que dia é para falar de agenda. */
  readonly agora: string
}

/** Uma ferramenta que o canal sabe executar. */
export type ExecutorDoCanal = (entrada: Readonly<Record<string, unknown>>) => Promise<ResultadoDaExecucaoDireta>

export interface PortaDoMotor {
  /** Uma ida ao modelo da conta, já com a conta e o modelo resolvidos. */
  rodada(pedido: Omit<PedidoDaRodada, 'modelo'>): Promise<RespostaDaRodada>
  readonly ferramentas: ReadonlyMap<string, ExecutorDoCanal>
}

export interface FerramentaUsada {
  readonly nome: string
  readonly ok: boolean
  readonly erro: string | null
}

export type MotivoDaRecusaDaResposta = 'vazia' | 'marcador' | 'identificador' | 'longa' | 'horario_fora_da_oferta'

export type ResultadoDaConversa =
  | { readonly tipo: 'resposta'; readonly texto: string; readonly ferramentas: readonly FerramentaUsada[] }
  | { readonly tipo: 'sem_modelo'; readonly ferramentas: readonly FerramentaUsada[] }
  | {
      readonly tipo: 'falha'
      readonly motivo: 'modelo_falhou' | 'rodadas_esgotadas' | MotivoDaRecusaDaResposta
      readonly ferramentas: readonly FerramentaUsada[]
    }

// O sistema ---------------------------------------------------------------------------

const MARCADOR = /\{\{\s*[A-Za-z0-9_]+\s*\}\}|\{[A-Za-z0-9_]+\}/g

function textoOuVazio(valor: string | null | undefined): string {
  return valor?.trim() ?? ''
}

/** As ferramentas que este propósito tem no canal, na ordem do catálogo. */
export function ferramentasDoCanal(proposito: Proposito, disponiveis: Iterable<string>): string[] {
  const temExecutor = new Set(disponiveis)
  return ferramentasDoProposito(proposito, FATIA_DO_WHATSAPP).filter((nome) => temExecutor.has(nome))
}

/** O esquema de argumentos que o modelo recebe, a partir da descrição publicada. */
export function declaracaoDaFerramenta(nome: string): FerramentaDoModelo {
  const descricao = DESCRICOES_DAS_FERRAMENTAS.get(nome)
  if (descricao === undefined) throw new Error(`${nome} não tem descrição em DESCRICOES_DAS_FERRAMENTAS`)
  const propriedades: Record<string, unknown> = {}
  for (const campo of descricao.campos) {
    propriedades[campo.chave] = {
      type: campo.tipo ?? 'string',
      description: campo.descricao,
      ...(campo.valores ? { enum: [...campo.valores] } : {}),
    }
  }
  return {
    nome,
    descricao: descricao.descricao,
    parametros: {
      type: 'object',
      properties: propriedades,
      required: descricao.campos.filter((campo) => campo.obrigatorio).map((campo) => campo.chave),
    },
  }
}

/**
 * O sistema da conversa: as três camadas do propósito, as variáveis do lead e
 * o bloco do canal. Levanta se sobrar marcador: prompt com `{x}` cru é defeito
 * de compilação, e não resposta que se manda.
 */
export async function montarSistema(contexto: ContextoDaConversa, ferramentas: readonly string[]): Promise<string> {
  const { configuracao } = await compilarPublicacao({
    proposito: contexto.proposito,
    identidade: {
      nome: contexto.identidade.nome,
      empresa: contexto.identidade.empresa,
      oferta: contexto.identidade.oferta,
      nuncaAfirmar: contexto.identidade.nuncaAfirmar,
      // Voz e primeira fala não entram no prompt: são da ligação.
      vozId: '',
      ajustesDeVoz: {},
      primeiraFala: '',
      jeitoDoCanal: contexto.identidade.jeito ?? null,
    },
    playbookPublicado: contexto.playbook,
    politica: contexto.politica,
    fatia: FATIA_DO_WHATSAPP,
    criteriosDaConta: contexto.criteriosDaConta ?? [],
  })

  const valores: Readonly<Record<string, string>> = {
    nome_do_lead: textoOuVazio(contexto.lead?.nome),
    empresa_do_lead: textoOuVazio(contexto.lead?.empresa),
    cidade_do_lead: textoOuVazio(contexto.lead?.cidade),
    contexto_do_lead: textoOuVazio(contexto.lead?.contexto),
    nome_do_especialista: '',
  }
  // Os da chamada viram o valor do lead; os do provedor de voz
  // (`{{system__...}}`) e qualquer outro somem, porque aqui não há quem os
  // preencha.
  const prompt = configuracao.playbook.prompt.replace(MARCADOR, (original) => {
    const chave = original.replace(/[{}\s]/g, '').toLowerCase()
    return valores[chave] ?? ''
  })

  const blocos = [
    prompt,
    INSTRUCAO_DO_CANAL,
    `Ferramentas disponíveis nesta conversa: ${ferramentas.length > 0 ? ferramentas.join(', ') : 'nenhuma'}.`,
    `Agora é ${contexto.agora} (UTC). A pessoa está no fuso ${contexto.fusoDoLead}.`,
  ]
  if (contexto.abertura) blocos.push(INSTRUCAO_DE_ABERTURA)
  const sistema = blocos.join('\n\n')

  const sobra = sistema.match(MARCADOR)
  if (sobra) throw new Error(`marcador cru no sistema do WhatsApp: ${sobra.join(', ')}`)
  return sistema
}

/**
 * A mídia do lead como o modelo a lê: a transcrição do áudio no lugar da fala,
 * a descrição da imagem entre colchetes, e o aviso do que não deu para abrir.
 */
function descreverMidia(mensagem: MensagemDoHistorico): string {
  if (!mensagem.midia) return ''
  const leitura = mensagem.estadoDaLeitura === 'lida' ? mensagem.leitura?.trim() : ''
  if (leitura && mensagem.midia === 'audio') return `[áudio da pessoa, transcrito] ${leitura}`
  if (leitura && mensagem.midia === 'imagem') return `[a pessoa mandou uma imagem. O que ela mostra: ${leitura}]`
  if (mensagem.midia === 'audio') return '[a pessoa mandou um áudio que não deu para ouvir]'
  if (mensagem.midia === 'imagem') return '[a pessoa mandou uma imagem que não deu para abrir]'
  return `[a pessoa mandou ${mensagem.midia}, que você não consegue abrir]`
}

/** O histórico no formato do modelo: lead é `user`, o resto é `assistant`. */
export function mensagensDoHistorico(historico: readonly MensagemDoHistorico[]): MensagemDoModelo[] {
  return historico.slice(-MENSAGENS_DO_HISTORICO).map((mensagem): MensagemDoModelo => {
    if (mensagem.direcao === 'in') {
      const texto = mensagem.texto.trim()
      return { role: 'user', content: [descreverMidia(mensagem), texto].filter(Boolean).join(' ') || '[mensagem vazia]' }
    }
    const prefixo = mensagem.autor === 'humano' ? '[mensagem de alguém do time] ' : ''
    return { role: 'assistant', content: `${prefixo}${mensagem.texto}` }
  })
}

// O crivo ---------------------------------------------------------------------------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** "14h", "14h30", "14:30", "às 9 h". */
const HORA_ESCRITA = /\b([01]?\d|2[0-3])\s*(?:h(?![a-zà-ú])|:)\s*([0-5]\d)?(?!\d)/gi

/** Tira o markdown que o modelo às vezes escreve apesar da instrução. */
export function limparMarkdown(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** Hora e minuto de um instante no fuso dado. Números pelo `Intl`, nunca frase. */
function horaLocal(iso: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const hora = Number(partes.find((parte) => parte.type === 'hour')?.value ?? '0') % 24
  const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value ?? '0')
  return `${hora}:${String(minuto).padStart(2, '0')}`
}

/**
 * O texto que pode sair, ou o motivo da recusa. Horário escrito na mensagem
 * precisa ser o de alguma oferta da conversa, no fuso do lead: é o que impede
 * a assistente de marcar "amanhã às 15h" que ninguém ofereceu (O-06).
 */
export function conferirResposta(
  bruto: string,
  ofertas: readonly string[],
  fusoDoLead: string,
): { readonly ok: true; readonly texto: string } | { readonly ok: false; readonly motivo: MotivoDaRecusaDaResposta } {
  const texto = limparMarkdown(bruto)
  if (texto === '') return { ok: false, motivo: 'vazia' }
  if (new RegExp(MARCADOR.source).test(texto)) return { ok: false, motivo: 'marcador' }
  if (UUID.test(texto)) return { ok: false, motivo: 'identificador' }
  if (texto.length > TAMANHO_MAXIMO) return { ok: false, motivo: 'longa' }

  const permitidas = new Set(ofertas.map((inicio) => horaLocal(inicio, fusoDoLead)))
  for (const casamento of texto.matchAll(HORA_ESCRITA)) {
    const hora = `${Number(casamento[1])}:${casamento[2] ?? '00'}`
    if (!permitidas.has(hora)) return { ok: false, motivo: 'horario_fora_da_oferta' }
  }
  return { ok: true, texto }
}

const FRASE_DA_RECUSA: Readonly<Record<MotivoDaRecusaDaResposta, string>> = {
  vazia: 'veio vazia',
  marcador: 'tem um marcador entre chaves',
  identificador: 'tem um identificador técnico',
  longa: `passa de ${TAMANHO_MAXIMO} caracteres`,
  horario_fora_da_oferta: 'cita um horário que não foi oferecido por tool-availability',
}

// O laço -----------------------------------------------------------------------------

function argumentos(chamada: ChamadaDeFerramenta): Readonly<Record<string, unknown>> | null {
  try {
    const lido: unknown = JSON.parse(chamada.function.arguments || '{}')
    return lido !== null && typeof lido === 'object' && !Array.isArray(lido) ? (lido as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Os inícios de horário que um resultado de ferramenta ofereceu ou marcou. */
function horariosDoResultado(resultado: ResultadoDaExecucaoDireta): string[] {
  const data = resultado.data ?? {}
  const ofertas = Array.isArray(data.offers) ? data.offers : []
  const inicios = ofertas
    .map((oferta) => (oferta && typeof oferta === 'object' ? (oferta as Record<string, unknown>).starts_at : null))
    .filter((inicio): inicio is string => typeof inicio === 'string')
  if (typeof data.starts_at === 'string') inicios.push(data.starts_at)
  return inicios
}

export async function conversar(contexto: ContextoDaConversa, porta: PortaDoMotor): Promise<ResultadoDaConversa> {
  const nomes = ferramentasDoCanal(contexto.proposito, porta.ferramentas.keys())
  const declaradas = nomes.map(declaracaoDaFerramenta)
  const mensagens: MensagemDoModelo[] = [
    { role: 'system', content: await montarSistema(contexto, nomes) },
    ...mensagensDoHistorico(contexto.historico),
  ]
  if (contexto.abertura || mensagens.length === 1) mensagens.push({ role: 'user', content: GATILHO_DE_ABERTURA })

  const usadas: FerramentaUsada[] = []
  const ofertas = [...contexto.ofertas]
  let reescreveu = false

  for (let rodada = 0; rodada < MAXIMO_DE_RODADAS; rodada += 1) {
    const resposta = await porta.rodada({ mensagens, ferramentas: declaradas, maxTokens: TETO_DE_SAIDA })
    if (!resposta.ok) {
      if (resposta.codigo === 'sem_credencial') return { tipo: 'sem_modelo', ferramentas: usadas }
      return { tipo: 'falha', motivo: 'modelo_falhou', ferramentas: usadas }
    }

    const chamadas = resposta.chamadas ?? []
    if (chamadas.length > 0) {
      mensagens.push({ role: 'assistant', content: resposta.texto ?? null, tool_calls: chamadas })
      for (const chamada of chamadas) {
        const nome = chamada.function.name
        const executor = nomes.includes(nome) ? porta.ferramentas.get(nome) : undefined
        const entrada = argumentos(chamada)
        let resultado: ResultadoDaExecucaoDireta
        if (executor === undefined) {
          resultado = { ok: false, data: null, speech: null, erro: 'ferramenta_desconhecida' }
        } else if (entrada === null) {
          resultado = { ok: false, data: null, speech: null, erro: 'argumentos_invalidos' }
        } else {
          try {
            resultado = await executor(entrada)
          } catch (erro) {
            resultado = { ok: false, data: null, speech: null, erro: `falha: ${erro instanceof Error ? erro.message : String(erro)}` }
          }
        }
        usadas.push({ nome, ok: resultado.ok, erro: resultado.erro })
        ofertas.push(...horariosDoResultado(resultado))
        mensagens.push({
          role: 'tool',
          tool_call_id: chamada.id,
          content: JSON.stringify({ ok: resultado.ok, data: resultado.data, speech: resultado.speech, erro: resultado.erro }),
        })
      }
      continue
    }

    const conferida = conferirResposta(resposta.texto ?? '', ofertas, contexto.fusoDoLead)
    if (conferida.ok) return { tipo: 'resposta', texto: conferida.texto, ferramentas: usadas }
    if (reescreveu) return { tipo: 'falha', motivo: conferida.motivo, ferramentas: usadas }
    reescreveu = true
    mensagens.push({ role: 'assistant', content: resposta.texto ?? '' })
    mensagens.push({
      role: 'user',
      content: `[aviso interno, não é da pessoa: a sua última mensagem não foi enviada porque ${FRASE_DA_RECUSA[conferida.motivo]}. Reescreva cumprindo as regras do canal.]`,
    })
  }
  return { tipo: 'falha', motivo: 'rodadas_esgotadas', ferramentas: usadas }
}
