// agent-publish: quatro publicações, uma por propósito (T-01, RF-313).
//
// É a publicação que decide quais ferramentas existem em cada chamada. Por isso
// ela não é uma operação: são quatro, uma por propósito, contra um provedor que
// **não tem transação**. Três decisões saem daí, e as três estão nos testes:
//
// 1. **Idempotência por hash.** Propósito cujo `published_hash` compilado é
//    igual ao que está gravado não vai ao provedor e não muda `published_at`.
//    Sem isso, abrir a tela de publicação e clicar duas vezes reescreveria as
//    quatro configurações, e o carimbo de "publicado em" passaria a medir o
//    último clique em vez da última mudança — que é a única coisa que ele tem a
//    dizer.
// 2. **Falha parcial não mente.** Cada propósito tem desfecho próprio, e a
//    resposta diz quais foram e quais não. Não existe "tudo ou nada" possível
//    aqui: desfazer no provedor as três publicações que deram certo porque a
//    quarta caiu seria tirar do ar uma Sarah que funciona.
// 3. **Falha de republicação não derruba o que está no ar.** Quando um
//    propósito já publicado falha numa nova tentativa, a linha dele fica
//    **intacta** — `provider_agent_id`, hash e data continuam descrevendo o que
//    o provedor tem agora, que é a versão anterior. Marcá-la como `falha` a
//    tiraria do índice parcial que `call-place` consulta, e uma republicação
//    malsucedida viraria uma parada de discagem naquele propósito. A divergência
//    entre o hash gravado e o compilado já é o que faz `estadoDePublicacao`
//    dizer `alteracoes_pendentes`, que é a informação verdadeira.
//
// 4. **Os webhooks do workspace vêm depois, e não derrubam nada.** Os quatro
//    agentes publicados buscam o contexto em `call-init`; o endereço dele e o
//    do aviso de fim (`call-events`) são configuração do workspace da
//    ElevenLabs da conta, que `webhooks.ts` garante numa passagem idempotente
//    pela leitura. Falhar ali vira `webhooks.estado = 'falha'` com frase, e o
//    relatório dos propósitos continua dizendo o que foi ao ar.
//
// **O que o hash não cobre, e a consequência.** Publicar no provedor e gravar a
// linha são dois sistemas, e não há transação entre eles. Se a escrita da linha
// falhar depois de o provedor aceitar, o `provider_agent_id` se perde e a
// publicação seguinte cria um segundo agente lá dentro em vez de atualizar o
// primeiro. O desfecho `falha_ao_gravar` existe para isso ficar dito em vez de
// virar dois agentes órfãos que ninguém explica. A limpeza deles é trabalho do
// painel do provedor, não desta função.
//
// **Segredos que saem por necessidade** (docs/PRD-implementacao.md seção 8,
// repetida aqui porque este é o módulo que os faz sair): a chave do provedor de
// voz vem de `_shared/secrets.ts`, nunca lida à mão; e o `x-tool-secret` da
// conta — `HMAC(chave_do_servidor, account_id)` — vai **dentro** da
// configuração publicada, porque é o provedor quem chama nossas ferramentas.
// "O valor nunca sai" vale para o navegador. A rede de segurança é
// `conferirQueNaoVazou`: se algum desses valores aparecer no corpo da resposta,
// o pedido inteiro vira `falha_interna` — é melhor não responder do que vazar.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDePublicacao`, implementada em `index.ts` e dublada no teste.

import type { LinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import {
  compilarPublicacao,
  estadoDePublicacao,
  type EstadoDePublicacao,
  type Fatia,
  type HashPorProposito,
  type PublicacaoCompilada,
  type PublicacaoRegistrada,
} from '../_shared/agente/compilador.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'
import { derivarSegredoDoInicio } from '../_shared/provedor/webhooks-da-conta.ts'
import { derivarSegredoDeFerramenta } from '../_shared/segredo-de-ferramenta.ts'
import { lerRetrato, montarRetrato, type RetratoDaPublicacao } from '../_shared/agente/retrato-da-publicacao.ts'

import { corpoDoProvedor, type CorpoDoProvedor } from './formato-do-provedor.ts'
import { garantirWebhooks, type PortaDosWebhooks, type ResultadoDosWebhooks } from './webhooks.ts'
import {
  MENSAGENS,
  MENSAGENS_DO_PROPOSITO,
  MENSAGEM_DA_PENDENCIA_DE_GRAVACAO,
  STATUS,
  type MotivoDoProposito,
  type MotivoLocal,
} from './respostas.ts'

/** O provedor de voz, como `integrations-status/provedores.ts` o nomeia. */
export const PROVEDOR_DE_VOZ = 'voz'

/** A chave dele no cofre. */
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/**
 * Quem publica. É a hierarquia de `has_role(account_id, 'admin')`: publicar é
 * configuração, e o Operador trabalha o funil dentro dela.
 */
export const PAPEIS_QUE_PUBLICAM: ReadonlySet<string> = new Set(['owner', 'admin'])

/** O caminho gravado em `integration_events` quando o adaptador não informa outro. */
export const ENDERECO_PADRAO_DA_PUBLICACAO = 'agents'

export interface UsuarioDaSessao {
  readonly id: string
}

/** A linha de `agents` da conta, com as chaves da tabela. */
export interface AgenteDaConta {
  readonly id: string
  readonly name: string
  /** Nula enquanto o tutorial não chegou ao negócio: o nome nasce antes. */
  readonly company_name: string | null
  readonly offer_line: string | null
  readonly never_claim: readonly string[]
  readonly voice_id: string | null
  readonly voice_settings: Readonly<Record<string, unknown>>
  readonly first_message: string | null
  /** Nula: a abertura padrão do WhatsApp. Vai ao ar no retrato. */
  readonly whatsapp_first_message?: string | null
  /** O jeito só na ligação: entra no prompt publicado. */
  readonly voice_channel_style?: string | null
  /** O jeito só no WhatsApp: vai ao ar no retrato. */
  readonly whatsapp_channel_style?: string | null
}

/** A linha de `account_settings` que a publicação lê (L-12, L-18, RF-807). */
export interface PoliticaLida {
  readonly max_duration_seconds: number
  readonly recording_enabled: boolean
  readonly recording_notice_text: string | null
  readonly retention_days: number
}

/** A versão publicada do roteiro de um propósito, com as chaves das tabelas. */
export interface RoteiroPublicado {
  readonly purpose: string
  readonly playbook_version_id: string
  readonly version: number
  readonly body_script: string
  readonly body_house: string
}

/** Uma linha de `agent_publications`, como ela está gravada. */
export interface PublicacaoNoBanco extends PublicacaoRegistrada {
  readonly provider_agent_id: string | null
  /**
   * `channel_snapshot`: o retrato do que esta linha pôs no ar. Ausente ou nulo
   * na publicação de antes dele, que o ganha na passagem seguinte.
   */
  readonly channel_snapshot?: unknown
}

/** O que a publicação manda ao provedor, já traduzido. */
export interface PedidoAoProvedor {
  readonly contaId: string
  readonly proposito: Proposito
  /** Nulo quando este propósito nunca foi publicado: é criação, não atualização. */
  readonly providerAgentId: string | null
  readonly corpo: CorpoDoProvedor
  /** A chave do provedor, já resolvida pela cascata. Não sai daqui. */
  readonly credencial: string
}

/**
 * O que o provedor respondeu. O envelope é de `_shared/provedor/resposta.ts`,
 * que três bordas compartilham; o que esta acrescenta é o identificador do
 * agente publicado.
 */
export interface RespostaDoProvedor extends EnvelopeDoProvedor {
  /** O identificador do agente lá dentro. Obrigatório quando `ok`. */
  readonly providerAgentId?: string | null
}

/** A linha que a publicação grava em `agent_publications`. */
export interface LinhaDePublicacao {
  readonly contaId: string
  readonly agenteId: string
  readonly proposito: Proposito
  readonly providerAgentId: string | null
  readonly publishedHash: string | null
  readonly publishedAt: string | null
  readonly status: 'publicado' | 'falha'
  /** O retrato do que foi ao ar (`retrato-da-publicacao.ts`). Nulo na linha de falha. */
  readonly retrato: RetratoDaPublicacao | null
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
  /** Nulo: publicar não nasce de ligação nenhuma. */
  readonly correlation_id: string | null
}

/**
 * A camada de dados. `index.ts` a implementa sobre o cliente do Supabase e
 * sobre a API do provedor; o teste a dubla.
 */
export interface PortaDePublicacao extends Omit<PortaDosWebhooks, 'registrarIdaDosWebhooks'> {
  /** Usuário dono deste JWT, ou null quando o token não vale mais. */
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Papel do usuário na conta, ou null quando ele não é membro dela. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  agenteDaConta(contaId: string): Promise<AgenteDaConta | null>
  politicaDaConta(contaId: string): Promise<PoliticaLida | null>
  /**
   * `evaluation_criteria` da conta, em `position`. Vão ao provedor pela mesma
   * função que `call-finalize` aplica (RF-313, US-142).
   */
  criteriosDeAvaliacao(contaId: string): Promise<readonly LinhaDeCriterio[]>
  /** Só as versões `published`, uma por propósito no máximo. */
  roteirosPublicados(contaId: string): Promise<readonly RoteiroPublicado[]>
  publicacoesRegistradas(contaId: string, agenteId: string): Promise<readonly PublicacaoNoBanco[]>
  /** Cascata de `_shared/secrets.ts`. Nunca resolvida à mão nesta função. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  /**
   * A chave do servidor que deriva o `x-tool-secret` de cada conta.
   *
   * **Não desce a cascata de `secrets.ts`, e é de propósito**: a cascata existe
   * para credencial *da conta*, e o degrau da plataforma nela é bloqueado em
   * produção justamente para uma conta não gastar o crédito da instalação. Esta
   * chave é o contrário disso — é nossa, é uma só para a instalação inteira, e
   * uma conta que tivesse a própria estaria assinando os pedidos das
   * ferramentas com uma chave que as ferramentas não reconhecem.
   */
  chaveDoServidorDeFerramentas(): string | null
  publicarNoProvedor(pedido: PedidoAoProvedor): Promise<RespostaDoProvedor>
  gravarPublicacao(linha: LinhaDePublicacao): Promise<void>
  /**
   * Só o retrato, na linha que já está no ar com este hash: é a publicação de
   * antes do retrato ganhando o dela sem mudar `published_at`.
   */
  gravarRetrato(pedido: {
    readonly contaId: string
    readonly agenteId: string
    readonly proposito: Proposito
    readonly retrato: RetratoDaPublicacao
  }): Promise<void>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

/**
 * O desfecho de um propósito.
 *
 * `inalterado` é sucesso, e é o desfecho da idempotência: o que está no ar já é
 * o que está no banco, e o provedor não foi chamado. Juntá-lo a `publicado`
 * esconderia exatamente o que a segunda publicação seguida tem a dizer.
 */
export type EstadoDoProposito = 'publicado' | 'inalterado' | 'falha'

export interface ResultadoDoProposito {
  readonly proposito: Proposito
  readonly estado: EstadoDoProposito
  /** Null nos dois desfechos de sucesso. */
  readonly motivo: MotivoDoProposito | null
  readonly mensagem: string | null
  /** O identificador no provedor, quando há um. */
  readonly providerAgentId: string | null
  /** O hash que está no ar depois desta passagem. Null quando nada está. */
  readonly publishedHash: string | null
}

/**
 * A pendência de L-18: a conta desligou a gravação, mas há propósito publicado
 * com a configuração antiga — ou seja, o provedor ainda pode estar guardando o
 * áudio. Quem a lê é a tela de privacidade (US-089).
 */
export interface PendenciaDeGravacao {
  readonly motivo: 'republicar_para_desligar_gravacao'
  readonly mensagem: string
  readonly propositos: readonly Proposito[]
}

export interface CorpoDaPublicacao {
  /**
   * O pedido foi processado e isto é o relatório. **Não** quer dizer que os
   * quatro propósitos foram — quem diz isso é `completo`, e quem diz o que
   * fazer em seguida é a lista de propósitos.
   */
  readonly ok: true
  readonly contaId: string
  readonly agenteId: string
  readonly propositos: readonly ResultadoDoProposito[]
  readonly publicados: number
  readonly inalterados: number
  readonly falhas: number
  /** Os quatro propósitos estão no ar com o hash de agora. */
  readonly completo: boolean
  /** Os três estados de RF-311, para o agente inteiro. */
  readonly estado: EstadoDePublicacao
  readonly pendenciaDeGravacao: PendenciaDeGravacao | null
  /**
   * Propósitos cujo rastro não foi gravado — o evento de integração, ou a linha
   * de falha. Não muda o desfecho de nenhum deles; muda o que a tela pode
   * prometer sobre o histórico.
   */
  readonly semRegistro: readonly Proposito[]
  /**
   * Os webhooks de início e de fim no workspace da ElevenLabs da conta
   * (`webhooks.ts`). Com `estado: 'falha'`, `mensagem` é a pendência que a tela
   * mostra; os propósitos continuam valendo como estão acima.
   */
  readonly webhooks: ResultadoDosWebhooks
}

export interface CorpoDeRecusa {
  readonly ok: false
  readonly motivo: MotivoLocal
  readonly mensagem: string
}

export interface RespostaDaPublicacao {
  readonly status: number
  readonly corpo: CorpoDaPublicacao | CorpoDeRecusa
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly contaId: unknown
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
}

export interface OpcoesDaPublicacao {
  /** Relógio injetável: o teste fixa o instante em vez de esperar por ele. */
  readonly agora?: () => Date
  /** O endereço base das funções de borda. Quem o conhece é o `index.ts`. */
  readonly enderecoDasFerramentas: string
  /**
   * A fatia cujas ferramentas vão ao ar. O `index.ts` não a passa, e vale
   * `FATIA_PUBLICADA`; o teste passa a fatia seguinte para provar o conjunto
   * dela antes de ela subir.
   */
  readonly fatia?: Fatia
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Erro interno com motivo próprio, para a recusa sair com a frase certa. */
class RecusaDoPedido extends Error {
  readonly motivo: MotivoLocal

  constructor(motivo: MotivoLocal) {
    super(motivo)
    this.motivo = motivo
  }
}

/**
 * Publica os quatro propósitos e devolve o relatório. Nunca levanta: exceção da
 * camada de dados vira `falha_interna`, porque quem publica precisa de uma
 * frase e não de um stack trace.
 */
export async function atenderPublicacao(
  pedido: PedidoDaBorda,
  porta: PortaDePublicacao,
  opcoes: OpcoesDaPublicacao,
): Promise<RespostaDaPublicacao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    // Operador recebe negativa com a frase de quem concede acesso: publicar é
    // configuração, e a tela precisa dizer a quem pedir.
    if (!PAPEIS_QUE_PUBLICAM.has(papel)) return recusa('papel_insuficiente')

    return await publicar(contaId, porta, opcoes)
  } catch (erro) {
    if (erro instanceof RecusaDoPedido) return recusa(erro.motivo)
    return recusa('falha_interna')
  }
}

/** O JWT do cabeçalho `Authorization: Bearer <jwt>`, ou null. */
export function extrairJwt(autorizacao: string | null): string | null {
  const achado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  return achado?.[1]?.trim() || null
}

async function publicar(
  contaId: string,
  porta: PortaDePublicacao,
  opcoes: OpcoesDaPublicacao,
): Promise<RespostaDaPublicacao> {
  const agora = opcoes.agora ?? (() => new Date())

  const agente = await porta.agenteDaConta(contaId)
  if (!agente) throw new RecusaDoPedido('sem_agente')
  // A coluna aceita nulo porque a tela salva rascunho incompleto o tempo todo;
  // quem cobra a completude é a publicação, que é onde ela passa a importar.
  // A empresa entra na mesma cobrança: o nome da assistente é gravado antes
  // dela, no começo do tutorial, e sem empresa a abertura não diz de quem ela
  // fala.
  const empresa = agente.company_name?.trim() ?? ''
  if (!agente.voice_id?.trim() || !agente.first_message?.trim() || empresa === '') {
    throw new RecusaDoPedido('agente_incompleto')
  }

  const politica = await porta.politicaDaConta(contaId)
  // `account_settings` nasce por gatilho junto da conta: linha ausente é
  // defeito da instalação, não estado que a tela possa resolver.
  if (!politica) throw new RecusaDoPedido('falha_interna')

  const resolucao = await porta.credencial(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
  if (!resolucao.ok) {
    throw new RecusaDoPedido(
      resolucao.motivo === 'plataforma_bloqueada'
        ? 'credencial_da_plataforma_bloqueada'
        : 'sem_credencial_de_voz',
    )
  }

  const chaveDoServidor = porta.chaveDoServidorDeFerramentas()?.trim() ?? ''
  if (!chaveDoServidor) throw new RecusaDoPedido('sem_chave_de_ferramentas')
  const segredoDeFerramenta = await derivarSegredoDeFerramenta(chaveDoServidor, contaId)

  const criteriosDaConta = await porta.criteriosDeAvaliacao(contaId)

  const roteiros = new Map(
    (await porta.roteirosPublicados(contaId)).map((roteiro) => [roteiro.purpose, roteiro]),
  )
  const registradas = new Map(
    (await porta.publicacoesRegistradas(contaId, agente.id)).map((linha) => [linha.purpose, linha]),
  )

  const resultados: ResultadoDoProposito[] = []
  const semRegistro: Proposito[] = []
  const hashCompilado: Record<string, string> = {}
  const noAr: PublicacaoRegistrada[] = []

  for (const proposito of PROPOSITOS) {
    const registrada = registradas.get(proposito)
    const roteiro = roteiros.get(proposito)

    if (!roteiro) {
      // Publicar um agente que não tem o que dizer é pior do que não publicar:
      // ele atenderia a ligação com a camada 1 e mais nada.
      hashCompilado[proposito] = ''
      resultados.push(
        await falharProposito(
          { contaId, agenteId: agente.id, proposito, registrada, motivo: 'sem_roteiro_publicado' },
          porta,
          semRegistro,
        ),
      )
      manterNoAr(noAr, proposito, registrada)
      continue
    }

    const playbookPublicado = {
      playbookVersionId: roteiro.playbook_version_id,
      versao: roteiro.version,
      camadaDois: roteiro.body_script,
      camadaTres: roteiro.body_house,
    }
    const compilada = await compilarPublicacao({
      proposito,
      fatia: opcoes.fatia,
      identidade: {
        nome: agente.name,
        empresa,
        oferta: agente.offer_line,
        nuncaAfirmar: agente.never_claim,
        vozId: agente.voice_id,
        ajustesDeVoz: agente.voice_settings,
        primeiraFala: agente.first_message,
        jeitoDoCanal: agente.voice_channel_style ?? null,
      },
      playbookPublicado,
      whatsapp: {
        abertura: agente.whatsapp_first_message ?? null,
        jeito: agente.whatsapp_channel_style ?? null,
      },
      politica: {
        duracaoMaximaSegundos: politica.max_duration_seconds,
        gravacaoLigada: politica.recording_enabled,
        avisoDeGravacao: politica.recording_notice_text,
        retencaoDias: politica.retention_days,
      },
      criteriosDaConta,
    })
    hashCompilado[proposito] = compilada.publishedHash
    // O retrato é o que o WhatsApp lê da assistente no ar. Tudo o que ele
    // carrega está no hash, então hash igual é retrato igual.
    const retrato = montarRetrato({
      identidade: { nome: agente.name, empresa, oferta: agente.offer_line, nuncaAfirmar: agente.never_claim },
      playbook: playbookPublicado,
      aberturaDoWhatsapp: agente.whatsapp_first_message ?? null,
      jeitoDoWhatsapp: agente.whatsapp_channel_style ?? null,
    })

    if (jaEstaNoAr(registrada, compilada.publishedHash)) {
      // Publicação de antes do retrato: ganha o dela, e só ele é escrito.
      // Falha aqui não muda o desfecho da voz, e fica em `semRegistro`.
      if (lerRetrato(registrada.channel_snapshot) === null) {
        try {
          await porta.gravarRetrato({ contaId, agenteId: agente.id, proposito, retrato })
        } catch {
          semRegistro.push(proposito)
        }
      }
      resultados.push({
        proposito,
        estado: 'inalterado',
        motivo: null,
        mensagem: null,
        providerAgentId: registrada.provider_agent_id,
        publishedHash: registrada.published_hash,
      })
      noAr.push(registrada)
      continue
    }

    const resultado = await publicarProposito(
      {
        contaId,
        agenteId: agente.id,
        proposito,
        registrada,
        compilada,
        credencial: resolucao.valor,
        segredoDeFerramenta,
        enderecoDasFerramentas: opcoes.enderecoDasFerramentas,
        publishedAt: agora().toISOString(),
        retrato,
      },
      porta,
      semRegistro,
    )
    resultados.push(resultado)

    if (resultado.estado === 'publicado') {
      noAr.push({
        purpose: proposito,
        status: 'publicado',
        published_hash: resultado.publishedHash,
      })
    } else {
      manterNoAr(noAr, proposito, registrada)
    }
  }

  // Depois dos quatro propósitos, e sem poder derrubá-los: ver `webhooks.ts`.
  const webhooks = await garantirWebhooks(
    {
      contaId,
      credencial: resolucao.valor,
      origemDaCredencial: resolucao.origem,
      enderecoDasFuncoes: opcoes.enderecoDasFerramentas,
      segredoDoInicio: await derivarSegredoDoInicio(chaveDoServidor, contaId),
    },
    {
      chamarApiDoProvedor: (ida) => porta.chamarApiDoProvedor(ida),
      webhookGuardado: (conta) => porta.webhookGuardado(conta),
      guardarWebhook: (conta, webhook) => porta.guardarWebhook(conta, webhook),
      registrarIdaDosWebhooks: (registro) =>
        porta.registrarEventoDeIntegracao({
          account_id: contaId,
          direction: 'outbound',
          provider: PROVEDOR_DE_VOZ,
          endpoint: registro.endpoint,
          // Só o resumo: o corpo leva o segredo do início, e a resposta da
          // criação leva o segredo do fim.
          request: { passo: 'webhooks', metodo: registro.metodo },
          response: { ok: registro.ok },
          status_code: registro.status,
          latency_ms: registro.latenciaMs,
          correlation_id: null,
        }),
    },
  )

  const corpo: CorpoDaPublicacao = montarCorpo({
    contaId,
    agenteId: agente.id,
    resultados,
    semRegistro,
    hashCompilado: hashCompilado as HashPorProposito,
    noAr,
    gravacaoLigada: politica.recording_enabled,
    webhooks: webhooks.resultado,
  })

  // O identificador que o provedor devolve passa pelo corpo, e um provedor que
  // ecoasse parte da chave nele furaria a regra em silêncio.
  conferirQueNaoVazou(
    corpo,
    [resolucao.valor, chaveDoServidor, segredoDeFerramenta, ...webhooks.segredos],
    'a resposta da publicação carregava o valor de um segredo',
  )
  return { status: 200, corpo }
}

/**
 * O propósito já está no ar com esta configuração?
 *
 * Os três pedaços são exigidos juntos: hash igual com status `falha` é o
 * resultado de uma tentativa que não foi ao ar, e hash igual sem
 * `provider_agent_id` não dá a `call-place` para onde discar. Em qualquer um
 * dos dois casos, pular a chamada ao provedor deixaria a conta parada achando
 * que está publicada.
 */
function jaEstaNoAr(
  registrada: PublicacaoNoBanco | undefined,
  publishedHash: string,
): registrada is PublicacaoNoBanco {
  return (
    registrada !== undefined &&
    registrada.status === 'publicado' &&
    registrada.published_hash === publishedHash &&
    registrada.provider_agent_id !== null
  )
}

interface PedidoDeUmProposito {
  readonly contaId: string
  readonly agenteId: string
  readonly proposito: Proposito
  readonly registrada: PublicacaoNoBanco | undefined
  readonly compilada: PublicacaoCompilada
  readonly credencial: string
  readonly segredoDeFerramenta: string
  readonly enderecoDasFerramentas: string
  readonly publishedAt: string
  readonly retrato: RetratoDaPublicacao
}

async function publicarProposito(
  pedido: PedidoDeUmProposito,
  porta: PortaDePublicacao,
  semRegistro: Proposito[],
): Promise<ResultadoDoProposito> {
  const corpo = corpoDoProvedor(pedido.compilada.configuracao, {
    enderecoDasFerramentas: pedido.enderecoDasFerramentas,
    segredoDeFerramenta: pedido.segredoDeFerramenta,
  })

  let resposta: RespostaDoProvedor
  try {
    resposta = await porta.publicarNoProvedor({
      contaId: pedido.contaId,
      proposito: pedido.proposito,
      providerAgentId: pedido.registrada?.provider_agent_id ?? null,
      corpo,
      credencial: pedido.credencial,
    })
  } catch {
    // Porta que levanta é provedor que não respondeu. O evento não é gravado
    // porque não houve ida ao provedor de que se possa dizer alguma coisa.
    return await falharProposito(
      { ...pedido, motivo: 'provedor_indisponivel' },
      porta,
      semRegistro,
    )
  }

  await registrarIda(pedido, corpo, resposta, porta, semRegistro)

  const providerAgentId = resposta.providerAgentId?.trim() || null
  if (!resposta.ok || !providerAgentId) {
    return await falharProposito(
      { ...pedido, motivo: classificarFalha(resposta) },
      porta,
      semRegistro,
    )
  }

  try {
    await porta.gravarPublicacao({
      contaId: pedido.contaId,
      agenteId: pedido.agenteId,
      proposito: pedido.proposito,
      providerAgentId,
      publishedHash: pedido.compilada.publishedHash,
      publishedAt: pedido.publishedAt,
      status: 'publicado',
      retrato: pedido.retrato,
    })
  } catch {
    // O provedor aceitou e o banco não registrou. Dizer "publicado" aqui faria
    // a tela mostrar no ar uma configuração que ninguém consegue recuperar.
    return {
      proposito: pedido.proposito,
      estado: 'falha',
      motivo: 'falha_ao_gravar',
      mensagem: MENSAGENS_DO_PROPOSITO.falha_ao_gravar,
      providerAgentId,
      publishedHash: null,
    }
  }

  return {
    proposito: pedido.proposito,
    estado: 'publicado',
    motivo: null,
    mensagem: null,
    providerAgentId,
    publishedHash: pedido.compilada.publishedHash,
  }
}

interface FalhaDeUmProposito {
  readonly contaId: string
  readonly agenteId: string
  readonly proposito: Proposito
  readonly registrada: PublicacaoNoBanco | undefined
  readonly motivo: MotivoDoProposito
}

/**
 * Registra a falha do propósito sem derrubar o que está no ar.
 *
 * A linha só é escrita quando **não** há publicação no ar: sem isso, uma
 * republicação malsucedida marcaria `falha` numa linha que ainda descreve um
 * agente funcionando no provedor, e o índice parcial de `call-place` deixaria
 * de enxergá-la — republicar viraria parar de discar.
 */
async function falharProposito(
  falha: FalhaDeUmProposito,
  porta: PortaDePublicacao,
  semRegistro: Proposito[],
): Promise<ResultadoDoProposito> {
  const noAr = falha.registrada?.status === 'publicado'

  if (!noAr) {
    try {
      await porta.gravarPublicacao({
        contaId: falha.contaId,
        agenteId: falha.agenteId,
        proposito: falha.proposito,
        providerAgentId: falha.registrada?.provider_agent_id ?? null,
        publishedHash: null,
        publishedAt: null,
        status: 'falha',
        retrato: null,
      })
    } catch {
      semRegistro.push(falha.proposito)
    }
  }

  return {
    proposito: falha.proposito,
    estado: 'falha',
    motivo: falha.motivo,
    mensagem: MENSAGENS_DO_PROPOSITO[falha.motivo],
    providerAgentId: falha.registrada?.provider_agent_id ?? null,
    publishedHash: noAr ? (falha.registrada?.published_hash ?? null) : null,
  }
}

/**
 * Uma linha de `integration_events` por ida ao provedor (RNF-16). O segredo vai
 * dentro do corpo enviado, e quem o esconde é o gatilho de redação da migração
 * da observabilidade, que casa pelo **nome da chave** — `x-tool-secret` e
 * `authorization` caem nele sozinhos.
 */
async function registrarIda(
  pedido: PedidoDeUmProposito,
  corpo: CorpoDoProvedor,
  resposta: RespostaDoProvedor,
  porta: PortaDePublicacao,
  semRegistro: Proposito[],
): Promise<void> {
  try {
    await porta.registrarEventoDeIntegracao({
      account_id: pedido.contaId,
      direction: 'outbound',
      provider: PROVEDOR_DE_VOZ,
      endpoint: resposta.endpoint?.trim() || ENDERECO_PADRAO_DA_PUBLICACAO,
      request: {
        proposito: pedido.proposito,
        provider_agent_id: pedido.registrada?.provider_agent_id ?? null,
        published_hash: pedido.compilada.publishedHash,
        corpo: corpo as unknown as Record<string, unknown>,
      },
      response: {
        ok: resposta.ok,
        provider_agent_id: resposta.providerAgentId ?? null,
        // O código do provedor entra no registro e **não** na resposta: quem
        // depura precisa dele, quem administra a conta precisa da frase.
        codigo: resposta.codigo ?? null,
        corpo: resposta.corpo ?? {},
      },
      status_code: typeof resposta.status === 'number' ? resposta.status : null,
      latency_ms: typeof resposta.latenciaMs === 'number' ? resposta.latenciaMs : null,
      correlation_id: null,
    })
  } catch {
    semRegistro.push(pedido.proposito)
  }
}

/**
 * Recusa do provedor ou queda dele. São dois motivos e não os sete de
 * `_shared/provedor/erros.ts` porque aqui a ação de quem lê é binária:
 * conferir a chave, ou publicar de novo daqui a pouco. A tradução completa mora
 * na outra função de propósito — o dia em que uma terceira precisar dela, ela
 * sobe para `_shared/`.
 */
export function classificarFalha(resposta: RespostaDoProvedor): MotivoDoProposito {
  const status = typeof resposta.status === 'number' ? resposta.status : null
  if (status === null || status >= 500 || status === 429) return 'provedor_indisponivel'

  const codigo = resposta.codigo?.trim() ?? ''
  if (/timeout|timed[_\-\s]?out|network|econn|fetch[_\-\s]?failed|unavailable/i.test(codigo)) {
    return 'provedor_indisponivel'
  }
  return 'provedor_recusou'
}

/** Mantém no relatório de estado a publicação anterior, quando ela continua no ar. */
function manterNoAr(
  noAr: PublicacaoRegistrada[],
  proposito: Proposito,
  registrada: PublicacaoNoBanco | undefined,
): void {
  if (registrada?.status === 'publicado') {
    noAr.push({
      purpose: proposito,
      status: 'publicado',
      published_hash: registrada.published_hash,
    })
  }
}

interface EntradaDoCorpo {
  readonly contaId: string
  readonly agenteId: string
  readonly resultados: readonly ResultadoDoProposito[]
  readonly semRegistro: readonly Proposito[]
  readonly hashCompilado: HashPorProposito
  readonly noAr: readonly PublicacaoRegistrada[]
  readonly gravacaoLigada: boolean
  readonly webhooks: ResultadoDosWebhooks
}

function montarCorpo(entrada: EntradaDoCorpo): CorpoDaPublicacao {
  const publicados = entrada.resultados.filter((item) => item.estado === 'publicado').length
  const inalterados = entrada.resultados.filter((item) => item.estado === 'inalterado').length
  const falhas = entrada.resultados.filter((item) => item.estado === 'falha').length

  return {
    ok: true,
    contaId: entrada.contaId,
    agenteId: entrada.agenteId,
    propositos: entrada.resultados,
    publicados,
    inalterados,
    falhas,
    completo: falhas === 0,
    estado: estadoDePublicacao(entrada.hashCompilado, entrada.noAr),
    pendenciaDeGravacao: pendenciaDeGravacao(entrada),
    semRegistro: entrada.semRegistro,
    webhooks: entrada.webhooks,
  }
}

/**
 * L-18: desligar a gravação passa a exigir republicar. Enquanto um propósito
 * estiver no ar com a configuração antiga, o provedor continua guardando o
 * áudio — e é isso, e não a coluna da conta, que a tela de privacidade precisa
 * dizer. Com a gravação ligada não há pendência: o que está no ar pode estar
 * velho por outro motivo, e aí quem fala é `estado`.
 */
function pendenciaDeGravacao(entrada: EntradaDoCorpo): PendenciaDeGravacao | null {
  const desatualizados = propositosComGravacaoPendente(
    entrada.gravacaoLigada,
    entrada.hashCompilado,
    entrada.noAr,
  )

  if (desatualizados.length === 0) return null
  return {
    motivo: 'republicar_para_desligar_gravacao',
    mensagem: MENSAGEM_DA_PENDENCIA_DE_GRAVACAO,
    propositos: desatualizados,
  }
}

/**
 * Os propósitos que ainda podem estar gravando no provedor depois de a conta
 * desligar a gravação: os que estão no ar com um hash diferente do compilado.
 * Exportada porque a tela de privacidade (US-089) mede a mesma coisa sem
 * publicar, e duas réguas diriam coisas diferentes na mesma tela.
 *
 * É aproximação de um lado só, e a declarada: o hash cobre a configuração
 * inteira, então um propósito desatualizado por outro motivo (roteiro novo)
 * também conta. Diz "republicar" a quem talvez já não precisasse; nunca diz
 * "desligado" a quem ainda grava.
 */
export function propositosComGravacaoPendente(
  gravacaoLigada: boolean,
  hashCompilado: HashPorProposito,
  noAr: readonly PublicacaoRegistrada[],
): Proposito[] {
  if (gravacaoLigada) return []
  return noAr
    .filter((linha) => linha.status === 'publicado')
    .filter((linha) => linha.published_hash !== hashCompilado[linha.purpose as Proposito])
    .map((linha) => linha.purpose as Proposito)
}

/**
 * A frase da pendência dos webhooks, ou nula. É o que a tela de playbooks e o
 * tutorial mostram. Tolera o corpo sem `webhooks` (função ainda não
 * republicada), porque aí não há pendência que se possa afirmar.
 */
export function pendenciaDosWebhooks(corpo: Pick<CorpoDaPublicacao, 'webhooks'>): string | null {
  const webhooks = (corpo as Partial<Pick<CorpoDaPublicacao, 'webhooks'>>).webhooks
  if (webhooks?.estado !== 'falha') return null
  return typeof webhooks.mensagem === 'string' && webhooks.mensagem !== '' ? webhooks.mensagem : null
}

function recusa(motivo: MotivoLocal): RespostaDaPublicacao {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
