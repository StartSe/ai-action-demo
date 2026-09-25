// playbook-draft: o primeiro roteiro, escrito a partir da descrição do negócio
// (L-08, RF-305, US-063).
//
// Começar de uma folha em branco é onde a configuração inicial para. A pessoa
// descreve o negócio em linguagem natural, escolhe o propósito, e esta função
// pede ao modelo a camada 2 daquele playbook e a grava como versão nova.
//
// **O MODELO É `claude-opus-5`.** É a decisão da seção 10 do PRD de produto:
// o opus fica com a redação de roteiro, e o sonnet com a classificação (P-03,
// `call-classify/classificacao.ts`). Aqui a qualidade do texto é o produto —
// é ele que a Sarah vai falar — e ninguém espera por ele ao vivo: quinze ou
// quarenta segundos numa tela de configuração não custam uma ligação.
//
// **NUNCA PUBLICA** (RF-307). O rascunho nasce `draft`, sempre: a linha que a
// porta recebe tem `status: 'draft'` no tipo, e a porta não tem método que
// publique. Publicar continua sendo ato explícito de quem administra, pela
// tela. Um rascunho que se publicasse sozinho poria na boca da Sarah um texto
// que ninguém leu.
//
// **SÓ A CAMADA 2.** O rascunho escreve `body_script`. A camada 1 é constante
// do repositório e não passa por aqui; a camada 3 (`body_house`) é da conta, e
// a versão nova a **carrega** da versão vigente, sem mudar uma letra — versão
// nova com o jeito da casa em branco apagaria, na publicação seguinte, o que a
// conta escreveu. Nenhuma versão existente é alterada: versão é linha.
//
// **A VARIANTE SEM AGENDA (O-06).** Enquanto o propósito não tiver ferramenta
// de agenda, o pedido proíbe oferecer horário e o texto devolvido passa pelo
// crivo de `_shared/agente/rascunho-de-roteiro.ts`. Se o modelo insistir, a
// função recusa (`promete_horario`) em vez de gravar: gravar e avisar deixaria
// no histórico uma versão pronta para ser publicada com a promessa dentro.
//
// **O PROMPT NÃO FICA EM CLARO NA OBSERVABILIDADE.** A chamada ao modelo vira
// linha em `integration_events`, e o texto enviado — que carrega a descrição
// do negócio — viaja sob a chave `prompt`, que o gatilho de redação troca por
// `[redigido]` antes de a linha existir (migração
// `20260923200000_redacao_do_prompt.sql`). O que fica legível é o resumo:
// modelo, propósito, variante e tamanhos. O roteiro devolvido não entra no
// registro; ele vai para `playbook_versions`, que é onde mora.
//
// Módulo portável: sem Deno, sem rede, sem banco. O modelo e a camada de dados
// entram por `PortaDoRascunho`, implementada em `index.ts`.

import { ferramentasDoProposito } from '../_shared/agente/compilador.ts'
import {
  ESQUEMA_DO_RASCUNHO,
  montarPedidoDeRascunho,
  prometeHorario,
} from '../_shared/agente/rascunho-de-roteiro.ts'
import type { ModeloResolvido, Tarefa } from '../_shared/modelo/resolucao.ts'
import { escolherVariante, PROPOSITOS, type Proposito, type Variante } from '../_shared/playbook/camada-um.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

import { MENSAGENS, NOTA_DO_RASCUNHO, STATUS, type MotivoDoRascunho } from './respostas.ts'

/**
 * A tarefa desta função na tabela de `_shared/modelo/resolucao.ts`. O modelo em
 * si não mora mais aqui: ele é da conta (US-246), e o padrão de quem não
 * escolheu é o daquela tabela — opus, pela decisão da seção 10 do PRD.
 */
export const TAREFA_DO_RASCUNHO: Tarefa = 'draft'

/** Como o modelo aparece em `integration_events.provider`, o mesmo de `call-classify`. */
export const PROVEDOR_DO_MODELO = 'modelo'

/**
 * Quem pede rascunho. É a hierarquia de `has_role(account_id, 'admin')`, a
 * mesma da política de inserção de `playbook_versions`: roteiro é
 * configuração, e o Operador trabalha o funil dentro dela.
 */
export const PAPEIS_QUE_ESCREVEM: ReadonlySet<string> = new Set(['owner', 'admin'])

/**
 * Os limites da descrição, em caracteres. Abaixo do mínimo o modelo inventa o
 * negócio em vez de descrevê-lo; acima do máximo a descrição deixa de ser
 * descrição e o custo do pedido cresce sem melhorar o roteiro.
 */
export const LIMITES_DA_DESCRICAO = { minimo: 40, maximo: 4_000 } as const

/** O maior roteiro aceito de volta. Mais do que isso não é roteiro de ligação. */
export const TAMANHO_MAXIMO_DO_ROTEIRO = 12_000

export interface UsuarioDaSessao {
  readonly id: string
}

/** O playbook do propósito, com o que a versão nova precisa herdar dele. */
export interface PlaybookDoProposito {
  readonly id: string
  /**
   * `body_house` da versão vigente: a publicada, ou a mais nova quando nenhuma
   * foi publicada. É o que a versão nova carrega sem mexer.
   */
  readonly body_house: string
}

export interface PedidoAoModelo {
  /** Já resolvido pela conta: o adaptador só o repassa ao provedor da porta. */
  readonly modelo: string
  /** Por qual porta falar. Viaja no pedido para o adaptador não resolver de novo. */
  readonly porta: string
  /** De quem é a credencial, quando a porta é a da conta. */
  readonly contaId: string
  readonly sistema: string
  readonly mensagem: string
  /** O formato da resposta, em JSON Schema. */
  readonly esquema: Readonly<Record<string, unknown>>
}

export interface RespostaDoModelo extends EnvelopeDoProvedor {
  /** O texto que o modelo devolveu, quando `ok`. */
  readonly texto?: string | null
  readonly tokensDeEntrada?: number | null
  readonly tokensDeSaida?: number | null
}

/** A linha que o rascunho grava em `playbook_versions`, com as chaves da tabela. */
export interface LinhaDoRascunho {
  readonly account_id: string
  readonly playbook_id: string
  /** Sempre `draft`: o tipo não deixa escrever outro (RF-307). */
  readonly status: 'draft'
  readonly body_script: string
  readonly body_house: string
  readonly change_note: string
  readonly author_id: string
}

/** O que a gravação devolve: o número vem do gatilho, e não daqui. */
export interface VersaoGravada {
  readonly id: string
  readonly version: number
}

export interface EventoDeIntegracao {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number | null
  /** Nulo: rascunho não nasce de ligação nenhuma. */
  readonly correlation_id: null
}

/**
 * A camada de dados e o modelo. `index.ts` a implementa; o teste a dubla.
 * Não há método que publique nem que altere versão existente.
 */
export interface PortaDoRascunho {
  /** Usuário dono deste JWT, ou null quando o token não vale mais. */
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Papel do usuário na conta, ou null quando ele não é membro dela. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  playbookDoProposito(contaId: string, proposito: Proposito): Promise<PlaybookDoProposito | null>
  /**
   * A descrição do negócio quando o pedido não traz uma (US-063): o que já foi
   * escrito em `agents.company_name` e `agents.offer_line`, na configuração da
   * Sarah. String vazia quando a conta ainda não escreveu nada — aí a recusa é
   * `descricao_curta`, como se a descrição tivesse vindo em branco.
   */
  descricaoPadraoDaConta(contaId: string): Promise<string>
  /** De qual modelo esta conta fala, e por qual porta (US-246). */
  modeloDaConta(contaId: string): Promise<ModeloResolvido>
  /** Nunca levanta: falha de rede e recusa chegam como `ok: false`. */
  perguntarAoModelo(pedido: PedidoAoModelo): Promise<RespostaDoModelo>
  gravarRascunho(linha: LinhaDoRascunho): Promise<VersaoGravada>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly proposito: unknown
  readonly descricao: unknown
}

export interface CorpoDoRascunho {
  readonly ok: true
  readonly contaId: string
  readonly proposito: Proposito
  readonly versaoId: string
  readonly versao: number
  readonly status: 'draft'
  readonly roteiro: string
  /** O registro da chamada ao modelo não foi gravado. Não muda o rascunho. */
  readonly semRegistro: boolean
}

export interface RecusaDoRascunho {
  readonly ok: false
  readonly motivo: MotivoDoRascunho
  readonly mensagem: string
}

export interface RespostaDoRascunho {
  readonly status: number
  readonly corpo: CorpoDoRascunho | RecusaDoRascunho
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Escreve o rascunho. Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderRascunho(pedido: PedidoDaBorda, porta: PortaDoRascunho): Promise<RespostaDoRascunho> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const proposito = lerProposito(pedido.proposito)
  if (!proposito) return recusa('proposito_invalido')

  // Descrição explícita (mesmo inválida) recusa aqui, sem tocar a porta: é o
  // que os testes de "recusado sem tocar a porta" cobram. Só a ausência
  // completa da chave — corpo que não trouxe descrição nenhuma — abre espaço
  // para o padrão da conta, buscado mais abaixo, depois de confirmar quem
  // pediu (US-063: a tela pode chamar sem descrição, e a borda completa com o
  // que a conta já escreveu em Identidade).
  const descricaoExplicita =
    pedido.descricao === undefined || pedido.descricao === null
      ? null
      : typeof pedido.descricao === 'string'
        ? pedido.descricao.trim()
        : ''
  if (descricaoExplicita !== null) {
    if (descricaoExplicita.length < LIMITES_DA_DESCRICAO.minimo) return recusa('descricao_curta')
    if (descricaoExplicita.length > LIMITES_DA_DESCRICAO.maximo) return recusa('descricao_longa')
  }

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_ESCREVEM.has(papel)) return recusa('papel_insuficiente')

    const descricao = descricaoExplicita ?? (await porta.descricaoPadraoDaConta(contaId)).trim()
    if (descricao.length < LIMITES_DA_DESCRICAO.minimo) return recusa('descricao_curta')
    if (descricao.length > LIMITES_DA_DESCRICAO.maximo) return recusa('descricao_longa')

    return await escrever({ contaId, proposito, descricao, autorId: usuario.id }, porta)
  } catch {
    return recusa('falha_interna')
  }
}

function lerProposito(valor: unknown): Proposito | null {
  return typeof valor === 'string' && (PROPOSITOS as readonly string[]).includes(valor)
    ? (valor as Proposito)
    : null
}

/** A variante do propósito, pelo conjunto de ferramentas que a publicação leva. */
export function varianteDoProposito(proposito: Proposito): Variante {
  return escolherVariante(ferramentasDoProposito(proposito))
}

interface Encomenda {
  readonly contaId: string
  readonly proposito: Proposito
  readonly descricao: string
  readonly autorId: string
}

async function escrever(encomenda: Encomenda, porta: PortaDoRascunho): Promise<RespostaDoRascunho> {
  const { contaId, proposito, descricao, autorId } = encomenda

  // `criar_playbooks_para` cria os quatro junto com a conta: ausente é defeito
  // da instalação, não estado que a tela resolva.
  const playbook = await porta.playbookDoProposito(contaId, proposito)
  if (!playbook) return recusa('falha_interna')

  const variante = varianteDoProposito(proposito)
  const texto = montarPedidoDeRascunho({ proposito, variante, descricao })
  const resolvido = await porta.modeloDaConta(contaId)
  const pedido: PedidoAoModelo = {
    modelo: resolvido.modelo,
    porta: resolvido.porta,
    contaId,
    ...texto,
    esquema: ESQUEMA_DO_RASCUNHO,
  }

  const resposta = await porta.perguntarAoModelo(pedido)
  const roteiro = resposta.ok && typeof resposta.texto === 'string' ? lerRoteiro(resposta.texto) : null

  const registrado = await rastrear(porta, {
    account_id: contaId,
    direction: 'outbound',
    provider: PROVEDOR_DO_MODELO,
    endpoint: resposta.endpoint ?? 'v1/messages',
    request: {
      model: pedido.modelo,
      // A porta e a origem da escolha entram no registro: é como se explica
      // depois por que esta conta gastou no provedor dela.
      porta: resolvido.porta,
      modelo_da_conta: resolvido.escolhidoPelaConta,
      purpose: proposito,
      variante,
      caracteres_da_descricao: descricao.length,
      // Redigido pelo gatilho de `integration_events` antes de gravar: o nome
      // da chave é o que o casa. Ver o cabeçalho.
      prompt: pedido.mensagem,
    },
    response: {
      ok: resposta.ok,
      entrada: resposta.tokensDeEntrada ?? null,
      saida: resposta.tokensDeSaida ?? null,
      caracteres_do_roteiro: roteiro?.length ?? null,
    },
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: null,
  })

  if (!resposta.ok || typeof resposta.texto !== 'string') {
    // Credencial que falta não é indisponibilidade: tem conserto numa tela.
    return recusa(
      resposta.codigo === 'sem_credencial' ? 'modelo_nao_conectado' : 'modelo_indisponivel',
    )
  }
  if (roteiro === null) return recusa('resposta_ilegivel')
  if (variante === 'sem_agenda' && prometeHorario(roteiro)) return recusa('promete_horario')

  const gravada = await porta.gravarRascunho({
    account_id: contaId,
    playbook_id: playbook.id,
    status: 'draft',
    body_script: roteiro,
    body_house: playbook.body_house,
    change_note: NOTA_DO_RASCUNHO,
    author_id: autorId,
  })

  return {
    status: 201,
    corpo: {
      ok: true,
      contaId,
      proposito,
      versaoId: gravada.id,
      versao: gravada.version,
      status: 'draft',
      roteiro,
      semRegistro: !registrado,
    },
  }
}

/** O roteiro do JSON combinado, ou nulo quando o texto não é ele. */
export function lerRoteiro(texto: string): string | null {
  let dado: unknown
  try {
    dado = JSON.parse(texto)
  } catch {
    return null
  }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) return null
  const roteiro = (dado as { roteiro?: unknown }).roteiro
  if (typeof roteiro !== 'string') return null
  const limpo = roteiro.trim()
  if (limpo === '' || limpo.length > TAMANHO_MAXIMO_DO_ROTEIRO) return null
  return limpo
}

async function rastrear(porta: PortaDoRascunho, evento: EventoDeIntegracao): Promise<boolean> {
  try {
    await porta.registrarEventoDeIntegracao(evento)
    return true
  } catch {
    // Observabilidade perdida não derruba o rascunho; o corpo diz que faltou.
    return false
  }
}

function recusa(motivo: MotivoDoRascunho): RespostaDoRascunho {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
