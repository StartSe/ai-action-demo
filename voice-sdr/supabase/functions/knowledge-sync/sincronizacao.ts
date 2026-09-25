// knowledge-sync: a base de conhecimento chega ao provedor e às quatro
// publicações (L-09, RF-310, US-064).
//
// A Sarah consulta a base durante a conversa, mas quem a lê é o provedor de
// voz, não o nosso banco. Esta função leva cada entrada de `knowledge_entries`
// para lá como documento e anexa o conjunto às **quatro** publicações da conta
// (T-01): base anexada só à de descoberta deixaria o lembrete, o resgate e o
// acompanhamento sem resposta para a mesma pergunta.
//
// Uma passagem faz, entrada por entrada:
//
// - **Enviar** a que não tem `provider_doc_id`.
// - **Atualizar** a que mudou depois de indexada — mudou quer dizer que o
//   sha-256 do documento de agora difere de `indexed_hash`. O provedor não
//   reescreve o texto de um documento, então atualizar é remover o antigo,
//   voltar a entrada a pendente e enviar o novo. A ordem é essa de propósito:
//   criar o novo antes deixaria, na falha da remoção, um documento lá fora sem
//   ponteiro nenhum aqui.
// - **Remover** a marcada em `removed_at`: o documento sai no provedor e só
//   depois a linha sai daqui. Remoção remota que falha deixa a linha marcada
//   para a próxima passagem. 404 conta como removido, porque o identificador
//   veio do próprio provedor e a resposta diz que ele já não tem o documento.
// - **Não tocar** na que está indexada com o mesmo hash.
//
// E depois, publicação por publicação, **anexa** a lista inteira dos
// documentos vigentes. Três decisões, todas com teste:
//
// 1. **Idempotente.** A segunda passagem seguida não envia, não atualiza e não
//    remove documento nenhum: o teste conta as chamadas do dublê. O anexo, esse
//    sim, vai a toda passagem, e é idempotente por natureza — substitui a
//    lista do agente pela mesma lista. Pular o anexo quando nenhuma entrada
//    mudou seria errado: a publicação que `agent-publish` criou depois da
//    última sincronização nasceu sem base, e só o anexo seguinte a completa.
// 2. **Falha por entrada.** Cada entrada tem desfecho próprio, e uma que caiu
//    não trava as outras. O motivo vai para `sync_error`, que é o que a tela
//    mostra depois.
// 3. **`indexed_at` só depois do 2xx.** A marca é gravada por
//    `marcar_conhecimento_indexado`, que só é chamado com o identificador que o
//    provedor devolveu. Gravar antes do envio é o erro de R-05 repetido em
//    outro lugar: a tela diria "indexada" sobre uma entrada que a Sarah não lê.
//
// **Duas suposições sobre o provedor**, do mesmo estado de T-01
// (`assumida-nao-verificada`, docs/decisao-do-agente.md), que só a
// sincronização real no CI confirma:
//
// - Remover um documento anexado é aceito (o adaptador pede a remoção forçada)
//   e o tira dos agentes. Por isso a remoção vem antes do anexo sem travar.
// - A atualização de agente que `agent-publish` faz não apaga a lista de
//   documentos. Se apagar, cada publicação deixa a Sarah sem base até a
//   sincronização seguinte, e o conserto é `agent-publish` levar a lista junto.
//
// **O que esta função não garante.** Entrada apagada no meio da passagem,
// depois de o documento dela nascer, faz a marcação voltar falsa; a função
// remove o documento recém-criado na hora. Se essa remoção também falhar, o
// documento fica órfão lá fora, e isso é dito no desfecho, não escondido.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e o
// provedor entram por `PortaDaSincronizacao`, implementada em `index.ts`.

import { hashEmHexadecimal } from '../_shared/hash-de-segredo.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import { eFalhaDoProvedor, traduzirErroDoProvedor } from '../_shared/provedor/erros.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  MENSAGENS,
  MENSAGENS_DA_ENTRADA,
  MENSAGENS_DA_PUBLICACAO,
  STATUS,
  type MotivoDaEntrada,
  type MotivoDaPublicacao,
  type MotivoLocal,
} from './respostas.ts'

/** O provedor de voz, como `integrations-status/provedores.ts` o nomeia. */
export const PROVEDOR_DE_VOZ = 'voz'

/** A chave dele no cofre. */
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/** Quem sincroniza: a hierarquia de `has_role(account_id, 'admin')`. */
export const PAPEIS_QUE_SINCRONIZAM: ReadonlySet<string> = new Set(['owner', 'admin'])

/** O nome do documento no provedor não passa disto; o texto leva a pergunta inteira. */
export const TAMANHO_MAXIMO_DO_NOME = 120

/** O caminho gravado em `integration_events` quando o adaptador não informa outro. */
export const ENDERECOS_PADRAO = {
  enviar: 'convai/knowledge-base/text',
  remover: 'convai/knowledge-base/:id',
  anexar: 'convai/agents/:id',
} as const

export interface UsuarioDaSessao {
  readonly id: string
}

/** Uma linha de `knowledge_entries`, com as chaves da tabela. */
export interface EntradaDaBase {
  readonly id: string
  readonly question: string
  readonly answer: string
  readonly provider_doc_id: string | null
  readonly indexed_hash: string | null
  readonly removed_at: string | null
}

/** Uma linha de `agent_publications`, só com o que o anexo precisa. */
export interface PublicacaoDaConta {
  readonly purpose: string
  readonly provider_agent_id: string | null
}

/** O documento como ele vai ao provedor. É sobre ele que o hash é calculado. */
export interface Documento {
  readonly nome: string
  readonly texto: string
}

export interface PedidoDeEnvio {
  readonly contaId: string
  readonly entradaId: string
  readonly documento: Documento
  /** A chave do provedor, já resolvida pela cascata. Não sai daqui. */
  readonly credencial: string
}

export interface PedidoDeRemocao {
  readonly contaId: string
  readonly documentoId: string
  readonly credencial: string
}

export interface DocumentoAnexado {
  readonly id: string
  readonly nome: string
}

export interface PedidoDeAnexo {
  readonly contaId: string
  readonly proposito: Proposito
  readonly providerAgentId: string
  /** A lista inteira: o anexo substitui a do agente, não acrescenta. */
  readonly documentos: readonly DocumentoAnexado[]
  readonly credencial: string
}

export interface RespostaDoEnvio extends EnvelopeDoProvedor {
  /** O identificador do documento lá dentro. Obrigatório quando `ok`. */
  readonly documentoId?: string | null
}

/** Uma linha de `integration_events`, com as chaves da tabela. */
export interface EventoDeIntegracao {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number | null
  /** A entrada, nas idas por documento; nulo no anexo, que é da conta inteira. */
  readonly correlation_id: string | null
}

/**
 * A camada de dados e o provedor. `index.ts` a implementa; o teste a dubla. As
 * idas ao provedor nunca levantam: falha chega como `ok: false`.
 */
export interface PortaDaSincronizacao {
  /** Usuário dono deste JWT, ou null quando o token não vale mais. */
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Papel do usuário na conta, ou null quando ele não é membro dela. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** Cascata de `_shared/secrets.ts`. Nunca resolvida à mão nesta função. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  entradasDaConta(contaId: string): Promise<readonly EntradaDaBase[]>
  publicacoesDaConta(contaId: string): Promise<readonly PublicacaoDaConta[]>
  enviarDocumento(pedido: PedidoDeEnvio): Promise<RespostaDoEnvio>
  removerDocumento(pedido: PedidoDeRemocao): Promise<EnvelopeDoProvedor>
  anexarDocumentos(pedido: PedidoDeAnexo): Promise<EnvelopeDoProvedor>
  /** `marcar_conhecimento_indexado`. Falso quando a entrada já não existe. */
  marcarIndexada(entradaId: string, documentoId: string, hash: string): Promise<boolean>
  /** `marcar_conhecimento_desindexado`. */
  marcarDesindexada(entradaId: string): Promise<boolean>
  /** `marcar_erro_do_conhecimento`. */
  marcarErro(entradaId: string, motivo: MotivoDaEntrada): Promise<boolean>
  /**
   * Apaga a linha, só se ela continuar marcada, depois de o documento sair do
   * provedor. Falso quando a marca foi desfeita no meio da passagem.
   */
  apagarEntrada(entradaId: string): Promise<boolean>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

/**
 * O desfecho de uma entrada. `inalterada` é sucesso, e é o desfecho da
 * idempotência: juntá-la a `enviada` esconderia o que a segunda passagem tem a
 * dizer.
 */
export type EstadoDaEntrada = 'enviada' | 'atualizada' | 'removida' | 'inalterada' | 'erro'

export interface ResultadoDaEntrada {
  readonly entradaId: string
  readonly estado: EstadoDaEntrada
  /** Null nos desfechos de sucesso. */
  readonly motivo: MotivoDaEntrada | null
  readonly mensagem: string | null
}

export type EstadoDaPublicacao = 'anexada' | 'sem_publicacao' | 'erro'

export interface ResultadoDaPublicacao {
  readonly proposito: Proposito
  readonly estado: EstadoDaPublicacao
  readonly motivo: MotivoDaPublicacao | null
  readonly mensagem: string | null
  /** Quantos documentos a publicação tem depois desta passagem, quando anexada. */
  readonly documentos: number | null
}

export interface CorpoDaSincronizacao {
  /**
   * O pedido foi processado e isto é o relatório. **Não** quer dizer que toda
   * entrada sincronizou — quem diz isso é `erros`, e quem diz qual é a lista.
   */
  readonly ok: true
  readonly contaId: string
  readonly entradas: readonly ResultadoDaEntrada[]
  readonly publicacoes: readonly ResultadoDaPublicacao[]
  readonly enviadas: number
  readonly atualizadas: number
  readonly removidas: number
  readonly inalteradas: number
  readonly erros: number
  /** Idas ao provedor cujo registro em `integration_events` não foi gravado. */
  readonly semRegistro: number
}

export interface CorpoDeRecusa {
  readonly ok: false
  readonly motivo: MotivoLocal
  readonly mensagem: string
}

export interface RespostaDaSincronizacao {
  readonly status: number
  readonly corpo: CorpoDaSincronizacao | CorpoDeRecusa
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly contaId: unknown
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Sincroniza a base da conta. Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderSincronizacao(
  pedido: PedidoDaBorda,
  porta: PortaDaSincronizacao,
): Promise<RespostaDaSincronizacao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_SINCRONIZAM.has(papel)) return recusa('papel_insuficiente')

    const resolucao = await porta.credencial(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
    if (!resolucao.ok) {
      return recusa(
        resolucao.motivo === 'plataforma_bloqueada'
          ? 'credencial_da_plataforma_bloqueada'
          : 'sem_credencial_de_voz',
      )
    }

    const corpo = await sincronizar(contaId, resolucao.valor, porta)
    // O identificador que o provedor devolve passa pelo corpo, e um provedor
    // que ecoasse parte da chave nele furaria a regra em silêncio.
    conferirQueNaoVazou(corpo, [resolucao.valor], 'a resposta da sincronização carregava a chave do provedor')
    return { status: 200, corpo }
  } catch {
    return recusa('falha_interna')
  }
}

/**
 * O documento de uma entrada. O nome é a pergunta encurtada, para o painel do
 * provedor dizer qual é qual; o texto leva pergunta e resposta inteiras,
 * porque é nele que a busca do provedor procura.
 */
export function documentoDaEntrada(entrada: Pick<EntradaDaBase, 'question' | 'answer'>): Documento {
  const pergunta = entrada.question.trim()
  const resposta = entrada.answer.trim()
  const nome =
    pergunta.length > TAMANHO_MAXIMO_DO_NOME
      ? `${pergunta.slice(0, TAMANHO_MAXIMO_DO_NOME - 1).trimEnd()}…`
      : pergunta
  return { nome, texto: `Pergunta: ${pergunta}\n\nResposta: ${resposta}` }
}

/**
 * O sha-256 do documento, que é o que `indexed_hash` guarda. Cobre o que vai
 * ao provedor e nada além: etiqueta e origem mudam a tela, não a Sarah, e
 * trocá-las não reenvia nada.
 */
export function hashDoDocumento(documento: Documento): Promise<string> {
  return hashEmHexadecimal(JSON.stringify([documento.nome, documento.texto]))
}

interface Passagem {
  readonly contaId: string
  readonly credencial: string
  readonly porta: PortaDaSincronizacao
  /** Os documentos vigentes depois da passagem, na ordem das entradas. */
  readonly vigentes: DocumentoAnexado[]
  semRegistro: number
}

async function sincronizar(
  contaId: string,
  credencial: string,
  porta: PortaDaSincronizacao,
): Promise<CorpoDaSincronizacao> {
  const passagem: Passagem = { contaId, credencial, porta, vigentes: [], semRegistro: 0 }

  const entradas: ResultadoDaEntrada[] = []
  for (const entrada of await porta.entradasDaConta(contaId)) {
    entradas.push(await sincronizarEntrada(entrada, passagem))
  }

  const registradas = new Map(
    (await porta.publicacoesDaConta(contaId)).map((linha) => [linha.purpose, linha]),
  )
  const publicacoes: ResultadoDaPublicacao[] = []
  for (const proposito of PROPOSITOS) {
    publicacoes.push(await anexar(proposito, registradas.get(proposito), passagem))
  }

  const contar = (estado: EstadoDaEntrada) => entradas.filter((item) => item.estado === estado).length
  return {
    ok: true,
    contaId,
    entradas,
    publicacoes,
    enviadas: contar('enviada'),
    atualizadas: contar('atualizada'),
    removidas: contar('removida'),
    inalteradas: contar('inalterada'),
    erros: contar('erro'),
    semRegistro: passagem.semRegistro,
  }
}

async function sincronizarEntrada(entrada: EntradaDaBase, passagem: Passagem): Promise<ResultadoDaEntrada> {
  if (entrada.removed_at !== null) return remover(entrada, passagem)

  const documento = documentoDaEntrada(entrada)
  const hash = await hashDoDocumento(documento)

  if (entrada.provider_doc_id === null) return enviar(entrada, documento, hash, 'enviada', passagem)

  if (entrada.indexed_hash === hash) {
    passagem.vigentes.push({ id: entrada.provider_doc_id, nome: documento.nome })
    return sucesso(entrada.id, 'inalterada')
  }

  // Mudou depois de indexada: sai o antigo, volta a pendente, entra o novo.
  const removido = await removerNoProvedor(entrada.id, entrada.provider_doc_id, passagem)
  if (removido !== null) {
    // O antigo continua lá e continua valendo: a Sarah lê a versão anterior
    // até a próxima passagem, o que é melhor do que não ler nada.
    passagem.vigentes.push({ id: entrada.provider_doc_id, nome: documento.nome })
    return falhar(entrada.id, removido === 'recusado' ? 'remocao_recusada' : 'remocao_indisponivel', passagem)
  }

  try {
    await passagem.porta.marcarDesindexada(entrada.id)
  } catch {
    // A linha continua apontando para o documento que já saiu. Na próxima
    // passagem o hash continua diferente, a remoção responde 404, e o
    // caminho se refaz sozinho.
    return falhar(entrada.id, 'falha_ao_gravar', passagem)
  }

  return enviar(entrada, documento, hash, 'atualizada', passagem)
}

async function enviar(
  entrada: EntradaDaBase,
  documento: Documento,
  hash: string,
  estado: 'enviada' | 'atualizada',
  passagem: Passagem,
): Promise<ResultadoDaEntrada> {
  const { contaId, credencial, porta } = passagem
  const resposta = await porta.enviarDocumento({ contaId, entradaId: entrada.id, documento, credencial })
  const documentoId = resposta.ok ? (resposta.documentoId?.trim() ?? '') : ''

  await rastrear(passagem, {
    account_id: contaId,
    direction: 'outbound',
    provider: PROVEDOR_DE_VOZ,
    endpoint: resposta.endpoint ?? ENDERECOS_PADRAO.enviar,
    request: {
      operacao: estado === 'enviada' ? 'enviar' : 'atualizar',
      caracteres_do_nome: documento.nome.length,
      caracteres_do_texto: documento.texto.length,
    },
    response: { ok: resposta.ok, documento: documentoId || null },
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: entrada.id,
  })

  // 2xx sem identificador não é documento que dê para anexar nem remover:
  // tratá-lo como sucesso marcaria indexada uma entrada que ninguém acha.
  if (!documentoId) {
    const motivo = eFalhaDoProvedor(traduzirErroDoProvedor(resposta.codigo, resposta.status).motivo)
      ? 'envio_indisponivel'
      : 'envio_recusado'
    return falhar(entrada.id, motivo, passagem)
  }

  let achou: boolean
  try {
    achou = await porta.marcarIndexada(entrada.id, documentoId, hash)
  } catch {
    // O documento existe e a linha não sabe. Tirá-lo de volta é o que evita um
    // órfão lá fora; a próxima passagem envia de novo.
    await removerNoProvedor(entrada.id, documentoId, passagem)
    return falhar(entrada.id, 'falha_ao_gravar', passagem)
  }

  if (!achou) {
    // A entrada foi apagada no meio da passagem: o documento recém-criado não
    // tem mais de quem ser. Se ele não sair, o órfão fica dito no desfecho.
    const removido = await removerNoProvedor(entrada.id, documentoId, passagem)
    if (removido !== null) {
      return falhar(entrada.id, removido === 'recusado' ? 'remocao_recusada' : 'remocao_indisponivel', passagem)
    }
    return sucesso(entrada.id, 'removida')
  }

  passagem.vigentes.push({ id: documentoId, nome: documento.nome })
  return sucesso(entrada.id, estado)
}

async function remover(entrada: EntradaDaBase, passagem: Passagem): Promise<ResultadoDaEntrada> {
  if (entrada.provider_doc_id !== null) {
    const removido = await removerNoProvedor(entrada.id, entrada.provider_doc_id, passagem)
    if (removido !== null) {
      // A Sarah ainda lê este documento, e a lista anexada precisa dizer isso.
      passagem.vigentes.push({ id: entrada.provider_doc_id, nome: documentoDaEntrada(entrada).nome })
      return falhar(entrada.id, removido === 'recusado' ? 'remocao_recusada' : 'remocao_indisponivel', passagem)
    }
  }

  try {
    if (!(await passagem.porta.apagarEntrada(entrada.id))) {
      // A marca foi desfeita enquanto o documento saía: a entrada fica, sem
      // documento, e a próxima passagem a envia de novo. Sem isto ela
      // continuaria apontando para um documento que já não existe.
      await passagem.porta.marcarDesindexada(entrada.id)
      return falhar(entrada.id, 'falha_ao_gravar', passagem)
    }
  } catch {
    // O documento já saiu; a linha fica, e a próxima passagem recebe 404 e a
    // apaga. Nada fica lá fora sem ponteiro.
    return falhar(entrada.id, 'falha_ao_gravar', passagem)
  }
  return sucesso(entrada.id, 'removida')
}

/**
 * Remove um documento no provedor. Devolve null quando ele saiu (2xx ou 404),
 * e a natureza da falha quando não saiu.
 */
async function removerNoProvedor(
  entradaId: string,
  documentoId: string,
  passagem: Passagem,
): Promise<'recusado' | 'indisponivel' | null> {
  const { contaId, credencial, porta } = passagem
  const resposta = await porta.removerDocumento({ contaId, documentoId, credencial })

  await rastrear(passagem, {
    account_id: contaId,
    direction: 'outbound',
    provider: PROVEDOR_DE_VOZ,
    endpoint: resposta.endpoint ?? ENDERECOS_PADRAO.remover,
    request: { operacao: 'remover', documento: documentoId },
    response: { ok: resposta.ok },
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: entradaId,
  })

  if (resposta.ok || resposta.status === 404) return null
  return eFalhaDoProvedor(traduzirErroDoProvedor(resposta.codigo, resposta.status).motivo)
    ? 'indisponivel'
    : 'recusado'
}

async function anexar(
  proposito: Proposito,
  registrada: PublicacaoDaConta | undefined,
  passagem: Passagem,
): Promise<ResultadoDaPublicacao> {
  const providerAgentId = registrada?.provider_agent_id?.trim() ?? ''
  // Sem agente lá fora não há onde anexar. `agent-publish` cria o agente, e a
  // sincronização seguinte o completa: por isso o anexo vai a toda passagem.
  if (!providerAgentId) {
    return { proposito, estado: 'sem_publicacao', motivo: null, mensagem: null, documentos: null }
  }

  const { contaId, credencial, porta, vigentes } = passagem
  const documentos = [...vigentes]
  const resposta = await porta.anexarDocumentos({ contaId, proposito, providerAgentId, documentos, credencial })

  await rastrear(passagem, {
    account_id: contaId,
    direction: 'outbound',
    provider: PROVEDOR_DE_VOZ,
    endpoint: resposta.endpoint ?? ENDERECOS_PADRAO.anexar,
    request: { operacao: 'anexar', purpose: proposito, documentos: documentos.map((item) => item.id) },
    response: { ok: resposta.ok },
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: null,
  })

  if (resposta.ok) {
    return { proposito, estado: 'anexada', motivo: null, mensagem: null, documentos: documentos.length }
  }

  const motivo: MotivoDaPublicacao = eFalhaDoProvedor(
    traduzirErroDoProvedor(resposta.codigo, resposta.status).motivo,
  )
    ? 'anexo_indisponivel'
    : 'anexo_recusado'
  return { proposito, estado: 'erro', motivo, mensagem: MENSAGENS_DA_PUBLICACAO[motivo], documentos: null }
}

async function falhar(
  entradaId: string,
  motivo: MotivoDaEntrada,
  passagem: Passagem,
): Promise<ResultadoDaEntrada> {
  try {
    await passagem.porta.marcarErro(entradaId, motivo)
  } catch {
    // O desfecho vai na resposta de qualquer jeito; perder o motivo gravado só
    // muda o que a tela mostra depois de recarregar.
  }
  return { entradaId, estado: 'erro', motivo, mensagem: MENSAGENS_DA_ENTRADA[motivo] }
}

function sucesso(entradaId: string, estado: Exclude<EstadoDaEntrada, 'erro'>): ResultadoDaEntrada {
  return { entradaId, estado, motivo: null, mensagem: null }
}

async function rastrear(passagem: Passagem, evento: EventoDeIntegracao): Promise<void> {
  try {
    await passagem.porta.registrarEventoDeIntegracao(evento)
  } catch {
    // Observabilidade perdida não desfaz o que o provedor já fez; o corpo conta.
    passagem.semRegistro += 1
  }
}

function recusa(motivo: MotivoLocal): RespostaDaSincronizacao {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
