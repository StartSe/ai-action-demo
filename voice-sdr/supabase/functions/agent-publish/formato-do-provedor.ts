// A tradução: a configuração nossa vira o corpo que o provedor de voz aceita.
//
// **Por que a tradução mora aqui e não no compilador.** `ConfiguracaoPublicada`
// tem as chaves em português e é ela que entra no `published_hash` (R-06). Com
// os nomes do provedor lá dentro, uma troca de versão da API dele mudaria o
// hash de todas as contas de uma vez, e as quatro publicações de cada uma
// apareceriam desatualizadas sem que ninguém tivesse mudado nada. Este arquivo
// é, então, **o único lugar do produto em que os nomes do provedor aparecem**,
// e trocar de provedor é reescrever este arquivo.
//
// **O que este arquivo não faz.** Não decide nada: não escolhe ferramenta, não
// monta prompt, não lê política. Tudo isso já veio decidido do compilador. Aqui
// só se renomeia e se aninha — e é por isso que o corpo traduzido **não** entra
// no hash.
//
// **Duas suposições declaradas sobre o formato do provedor**, ambas do mesmo
// estado de T-01 (`assumida-nao-verificada`, docs/decisao-do-agente.md), que
// `scripts/sonda-de-publicacao.ts` verifica no degrau 3:
//
// 1. O conjunto de ferramentas é propriedade do agente publicado, e não algo
//    que o webhook de início possa sobrescrever por chamada. É a suposição que
//    faz existirem quatro publicações em vez de uma.
// 2. O texto de aviso de gravação da conta viaja num campo de privacidade do
//    agente. Se a sonda mostrar que o provedor não tem esse campo, o aviso
//    próprio da conta passa a entrar pelo prompt, com marcador na camada 1 — e
//    a mudança é aqui e no compilador, não na tela.
//
// **A forma das ferramentas nossas** (`api_schema` com `description`, e a
// conversa descendo no cabeçalho por `{{system__conversation_id}}`) é a que
// `scripts/sonda-de-publicacao.ts` publica e confere do outro lado (P-11). A
// sonda não cobre a terceira suposição, que é da F3:
//
// 3. `transfer_to_number` aceita destino por variável da conversa
//    (`phone_dynamic_variable`), e a ferramenta nossa escreve essa variável a
//    partir da resposta (`assignments`). É o que deixa a transferência sem
//    número fixo. Se o provedor não aceitar, a publicação volta 422 nos quatro
//    propósitos e a falha aparece no relatório de `agent-publish`; a verificação
//    é dívida do degrau 3 (docs/PRD-implementacao.md seção 9.1).
//
// Mais duas, dos webhooks (`webhooks.ts`), confirmadas na documentação do
// provedor mas ainda não por sonda:
//
// 4. Buscar o contexto no webhook de início é chave do **agente**,
//    `platform_settings.overrides.enable_conversation_initiation_client_data_from_webhook`,
//    e o endereço do webhook é configuração do **workspace**
//    (`convai/settings`, `conversation_initiation_client_data_webhook`), com
//    `request_headers` que nós escrevemos — é o único jeito de ele se
//    autenticar, porque não é assinado.
// 5. O webhook de fim é um webhook do workspace (`workspace/webhooks`, com
//    `auth_type: 'hmac'`), cujo segredo volta **uma vez**, na resposta da
//    criação (`webhook_secret`), e que se liga à plataforma de conversa por
//    `convai/settings` em `webhooks.post_call_webhook_id`. A listagem
//    (`GET workspace/webhooks`) devolve `webhooks[]` com `webhook_id` e
//    `webhook_url`, e é por ela que se confere se o webhook guardado ainda
//    existe. Se `GET convai/settings` devolver os valores de
//    `request_headers` mascarados, a publicação passa a reaplicar a
//    configuração a cada vez (uma ida a mais, idempotente) — nunca a recriar o
//    webhook de fim.
//
// E uma sexta, das variáveis da conversa:
//
// 6. O provedor só interpola variável na forma `{{nome}}`: `{nome}` fica no
//    prompt como texto. Toda variável citada leva valor inicial em
//    `dynamic_variables.dynamic_variable_placeholders`, que é o valor usado
//    quando a conversa começa sem ele (sessão do painel, webhook de início que
//    não respondeu) — sem valor inicial, a documentação diz que a conversa é
//    recusada por variável ausente. Valor inicial vazio já é o que
//    `transfer_number` usa desde a F3, e a publicação o aceitou.
// 7. Campo de tipo `object` (os critérios de `tool-qualify`) vai sem
//    `properties`, com as chaves na descrição: elas são da régua da conta, e a
//    régua ainda é provisória. Se o provedor recusar objeto sem propriedades
//    declaradas, é aqui que elas entram, lidas do descritor; a verificação é
//    do degrau 3, como as outras três.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  VALOR_INICIAL_DA_VARIAVEL,
  type CampoDaFerramenta,
  type ConfiguracaoPublicada,
  type FerramentaCompilada,
  type VariavelDaChamada,
} from '../_shared/agente/compilador.ts'
import { CABECALHO_DA_CONVERSA } from '../_shared/tools/esqueleto.ts'

/** O idioma da publicação. Fixo: a Sarah fala português do Brasil (RF-302). */
export const IDIOMA_DA_PUBLICACAO = 'pt'

/** Um campo do corpo, como o provedor o declara. */
export interface PropriedadeDoCorpo {
  readonly type: 'string' | 'number' | 'object'
  readonly description: string
  readonly enum?: readonly string[]
}

/** O corpo que o modelo manda para uma ferramenta nossa. */
export interface EsquemaDoCorpo {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, PropriedadeDoCorpo>>
  readonly required: readonly string[]
}

/** Uma variável da conversa escrita a partir da resposta da ferramenta. */
export interface AtribuicaoDoProvedor {
  readonly source: 'response'
  readonly dynamic_variable: string
  readonly value_path: string
}

/** Uma ferramenta nossa, como o provedor a chama de volta. */
export interface FerramentaDoProvedor {
  readonly type: 'webhook'
  readonly name: string
  readonly description: string
  readonly response_timeout_secs: number
  readonly api_schema: {
    readonly url: string
    readonly method: 'POST'
    /**
     * O `x-tool-secret` da conta (seção 5) e a conversa (P-11). O segredo é o
     * que sai por necessidade, e é ele que o gatilho de redação de
     * `integration_events` esconde do registro pelo nome da chave.
     */
    readonly request_headers: Readonly<Record<string, string>>
    readonly request_body_schema: EsquemaDoCorpo
  }
  readonly assignments: readonly AtribuicaoDoProvedor[]
}

/**
 * O modelo de síntese da publicação. O provedor recusa agente fora do inglês
 * com qualquer outro — "Non-english Agents must use turbo or flash v2_5" — e a
 * Sarah fala português. `flash` é o mais rápido dos dois, e latência de turno é
 * o que decide se a conversa soa natural (P-01).
 *
 * Sem declarar o modelo, o provedor assume o padrão dele, que é em inglês: o
 * corpo inteiro é recusado com 400 e os quatro propósitos ficam sem publicação.
 */
const MODELO_DE_VOZ = 'eleven_flash_v2_5'

/** Uma transferência de `transfer_to_number`, com o destino lido da conversa. */
export interface TransferenciaDoProvedor {
  readonly transfer_destination: { readonly type: 'phone_dynamic_variable'; readonly phone_number: string }
  readonly condition: string
  readonly transfer_type: 'conference'
}

/** Uma ferramenta do próprio provedor (T-02, T-03). Não tem endereço nosso. */
export interface FerramentaDeSistemaDoProvedor {
  readonly type: 'system'
  readonly name: string
  /** Só `transfer_to_number` leva parâmetros; as outras duas vão pelo nome. */
  readonly params?: {
    readonly system_tool_type: 'transfer_to_number'
    readonly transfers: readonly TransferenciaDoProvedor[]
  }
}

export interface CorpoDoProvedor {
  readonly name: string
  readonly conversation_config: {
    readonly agent: {
      readonly language: string
      readonly first_message: string
      /** Os valores iniciais das variáveis que a própria conversa escreve. */
      readonly dynamic_variables: {
        readonly dynamic_variable_placeholders: Readonly<Record<string, string>>
      }
      readonly prompt: {
        readonly prompt: string
        readonly tools: readonly (FerramentaDoProvedor | FerramentaDeSistemaDoProvedor)[]
      }
    }
    readonly tts: {
      readonly voice_id: string
      readonly model_id: string
      readonly voice_settings: Readonly<Record<string, unknown>>
    }
    readonly conversation: {
      readonly max_duration_seconds: number
    }
  }
  readonly platform_settings: {
    /**
     * O que o webhook de início pode mudar na conversa (suposição 4, abaixo).
     * `enable_conversation_initiation_client_data_from_webhook` é a chave
     * "Fetch initiation client data from a webhook" do painel; sem ela o
     * provedor nunca chama `call-init`. `first_message` precisa estar liberado
     * porque `call-init` devolve a primeira fala com o lead dentro, e
     * sobreposição não liberada é recusada pelo provedor.
     */
    readonly overrides: {
      readonly enable_conversation_initiation_client_data_from_webhook: boolean
      readonly conversation_config_override: {
        readonly agent: { readonly first_message: boolean }
      }
    }
    readonly privacy: {
      readonly record_voice: boolean
      readonly retention_days: number
      readonly recording_notice_text: string
    }
    readonly evaluation: {
      readonly criteria: readonly {
        readonly id: string
        readonly conversation_goal_prompt: string
      }[]
    }
  }
}

export interface OpcoesDaTraducao {
  /**
   * O endereço base das funções de borda, sem barra final. É o `index.ts` quem
   * o conhece; o módulo portável não sabe em que instalação está.
   */
  readonly enderecoDasFerramentas: string
  /** `HMAC(chave_do_servidor, account_id)`, de `_shared/segredo-de-ferramenta.ts`. */
  readonly segredoDeFerramenta: string
}

/**
 * O nome do agente no painel do provedor.
 *
 * Leva o propósito porque são quatro agentes por conta, e quatro linhas
 * chamadas "Sarah" no painel dele tornam impossível saber qual é qual na hora
 * em que alguém precisa olhar — que é sempre a hora de um incidente. A chave do
 * propósito vai em inglês, como ela está no banco.
 */
export function nomeNoProvedor(configuracao: ConfiguracaoPublicada): string {
  return `${configuracao.agente.nome} (${configuracao.proposito})`
}

/** A configuração nossa, com os nomes e o aninhamento do provedor. */
export function corpoDoProvedor(
  configuracao: ConfiguracaoPublicada,
  opcoes: OpcoesDaTraducao,
): CorpoDoProvedor {
  const base = opcoes.enderecoDasFerramentas.replace(/\/+$/, '')
  const transferencia = configuracao.ferramentas.transferencia

  const nossas: FerramentaDoProvedor[] = configuracao.ferramentas.nossas.map((ferramenta) => ({
    type: 'webhook',
    name: ferramenta.nome,
    description: ferramenta.descricao,
    response_timeout_secs: configuracao.ferramentas.prazo_de_resposta_seg,
    api_schema: {
      url: `${base}/${ferramenta.nome}`,
      method: 'POST',
      // A chave se chama `x-tool-secret` porque é assim que ela viaja no
      // cabeçalho, e o nome contém `secret`: é o que faz o gatilho de redação
      // de `integration_events` escondê-la sozinho, sem lista de campos.
      request_headers: {
        'x-tool-secret': opcoes.segredoDeFerramenta,
        [CABECALHO_DA_CONVERSA]: '{{system__conversation_id}}',
      },
      request_body_schema: esquemaDoCorpo(ferramenta),
    },
    // A resposta de `tool-transfer` escreve o destino que `transfer_to_number`
    // lê. As outras não escrevem variável nenhuma.
    assignments:
      transferencia !== null && ferramenta.nome === transferencia.ferramenta
        ? [
            {
              source: 'response',
              dynamic_variable: transferencia.variavel,
              value_path: transferencia.campo_da_resposta,
            },
          ]
        : [],
  }))

  const deSistema: FerramentaDeSistemaDoProvedor[] = configuracao.ferramentas.de_sistema.map((nome) =>
    nome === 'transfer_to_number' && transferencia !== null
      ? {
          type: 'system',
          name: nome,
          params: {
            system_tool_type: 'transfer_to_number',
            transfers: [
              {
                // Sem número fixo: o destino é a variável que `tool-transfer`
                // escreveu nesta conversa (US-105).
                transfer_destination: { type: 'phone_dynamic_variable', phone_number: transferencia.variavel },
                condition: transferencia.condicao,
                transfer_type: 'conference',
              },
            ],
          },
        }
      : { type: 'system', name: nome },
  )

  return {
    name: nomeNoProvedor(configuracao),
    conversation_config: {
      agent: {
        language: IDIOMA_DA_PUBLICACAO,
        first_message: configuracao.chamada.primeira_fala,
        dynamic_variables: {
          // Vazio até `tool-transfer` responder: variável citada pela
          // transferência e ausente no começo da conversa não pode ser motivo
          // de o provedor recusar o início. As da chamada (suposição 6) levam o
          // valor inicial seguro do compilador.
          dynamic_variable_placeholders: {
            ...valoresIniciais(configuracao.chamada.variaveis),
            ...(transferencia === null ? {} : { [transferencia.variavel]: '' }),
          },
        },
        prompt: {
          prompt: promptDoProvedor(configuracao.playbook.prompt, configuracao.chamada.variaveis),
          tools: [...nossas, ...deSistema],
        },
      },
      tts: {
        voice_id: configuracao.voz.voice_id,
        model_id: MODELO_DE_VOZ,
        voice_settings: configuracao.voz.ajustes,
      },
      conversation: {
        max_duration_seconds: configuracao.chamada.duracao_maxima_seg,
      },
    },
    platform_settings: {
      overrides: {
        enable_conversation_initiation_client_data_from_webhook: configuracao.chamada.contexto_no_inicio,
        conversation_config_override: {
          agent: { first_message: configuracao.chamada.contexto_no_inicio },
        },
      },
      privacy: {
        // L-18: gravação desligada na conta é retenção desligada no provedor.
        // Deixar de baixar o arquivo não basta — o áudio continuaria lá.
        record_voice: configuracao.privacidade.reter_audio,
        retention_days: configuracao.privacidade.retencao_dias,
        recording_notice_text: configuracao.chamada.aviso_de_gravacao,
      },
      evaluation: {
        // A chave do critério vai como identificador, e não a pergunta: é por
        // ela que `call-finalize` lê o resultado depois (L-23), e pergunta
        // reescrita não pode virar critério novo no histórico.
        criteria: configuracao.avaliacao.map((criterio) => ({
          id: criterio.chave,
          conversation_goal_prompt: criterio.pergunta,
        })),
      },
    },
  }
}

/** O valor inicial de cada variável que a publicação declara. */
function valoresIniciais(variaveis: readonly VariavelDaChamada[]): Record<string, string> {
  return Object.fromEntries(variaveis.map((variavel) => [variavel, VALOR_INICIAL_DA_VARIAVEL[variavel]]))
}

/**
 * O prompt na sintaxe de variável do provedor (suposição 6): `{nome_do_lead}`
 * vira `{{nome_do_lead}}`. Só as declaradas mudam de forma, e o compilador já
 * garantiu que nenhum outro marcador simples sobrou no texto.
 */
export function promptDoProvedor(prompt: string, variaveis: readonly VariavelDaChamada[]): string {
  const declaradas = new Set<string>(variaveis)
  return prompt.replace(/\{\{[^{}]*\}\}|\{([a-z0-9_]+)\}/g, (original, chave: string | undefined) =>
    chave !== undefined && declaradas.has(chave) ? `{{${chave}}}` : original,
  )
}

function propriedade(campo: CampoDaFerramenta): PropriedadeDoCorpo {
  return {
    type: campo.tipo ?? 'string',
    description: campo.descricao,
    ...(campo.valores === undefined ? {} : { enum: [...campo.valores] }),
  }
}

/** O corpo declarado de uma ferramenta nossa, com os obrigatórios do esqueleto. */
function esquemaDoCorpo(ferramenta: FerramentaCompilada): EsquemaDoCorpo {
  return {
    type: 'object',
    properties: Object.fromEntries(ferramenta.campos.map((campo) => [campo.chave, propriedade(campo)])),
    required: ferramenta.campos.filter((campo) => campo.obrigatorio).map((campo) => campo.chave),
  }
}

// Os webhooks do workspace (suposições 4 e 5) -----------------------------------

/** Os caminhos da API do provedor, relativos a `/v1`. */
export const CAMINHO_DA_CONFIGURACAO_DE_CONVERSA = 'convai/settings'
export const CAMINHO_DOS_WEBHOOKS = 'workspace/webhooks'

/** A configuração de conversa do workspace, no que a publicação lê dela. */
export interface ConfiguracaoDoWorkspace {
  /** `webhooks.post_call_webhook_id`. */
  readonly posChamadaId: string | null
  /** `conversation_initiation_client_data_webhook.url`. */
  readonly inicioUrl: string | null
  /** `conversation_initiation_client_data_webhook.request_headers`. */
  readonly inicioCabecalhos: Readonly<Record<string, string>>
}

/** Um webhook do workspace, no que a publicação lê dele. */
export interface WebhookDoWorkspace {
  readonly id: string
  readonly url: string | null
}

/** O que a criação do webhook de fim devolve. O segredo não volta nunca mais. */
export interface WebhookCriado {
  readonly id: string
  readonly segredo: string
}

/** O corpo da criação do webhook de fim, assinado por HMAC. */
export function corpoDoWebhookDeFim(nome: string, url: string) {
  return { settings: { auth_type: 'hmac', name: nome, webhook_url: url } } as const
}

/** O corpo que liga os dois webhooks à conversa do workspace. */
export function corpoDaConfiguracaoDeWebhooks(pedido: {
  readonly inicioUrl: string
  readonly inicioCabecalhos: Readonly<Record<string, string>>
  readonly posChamadaId: string
}) {
  return {
    conversation_initiation_client_data_webhook: {
      url: pedido.inicioUrl,
      request_headers: { ...pedido.inicioCabecalhos },
    },
    webhooks: { post_call_webhook_id: pedido.posChamadaId },
  } as const
}

export function lerConfiguracaoDoWorkspace(corpo: unknown): ConfiguracaoDoWorkspace | null {
  if (!objeto(corpo)) return null
  const brutoDoInicio = corpo.conversation_initiation_client_data_webhook
  const inicio = objeto(brutoDoInicio) ? brutoDoInicio : null
  const brutoDosWebhooks = corpo.webhooks
  const webhooks = objeto(brutoDosWebhooks) ? brutoDosWebhooks : null
  const brutoDosCabecalhos = inicio?.request_headers
  const cabecalhos = objeto(brutoDosCabecalhos) ? brutoDosCabecalhos : {}
  return {
    posChamadaId: textoOuNulo(webhooks?.post_call_webhook_id),
    inicioUrl: textoOuNulo(inicio?.url),
    inicioCabecalhos: Object.fromEntries(
      Object.entries(cabecalhos).filter((par): par is [string, string] => typeof par[1] === 'string'),
    ),
  }
}

export function lerWebhooksDoWorkspace(corpo: unknown): readonly WebhookDoWorkspace[] | null {
  if (!objeto(corpo) || !Array.isArray(corpo.webhooks)) return null
  return corpo.webhooks.flatMap((item: unknown) => {
    if (!objeto(item)) return []
    const id = textoOuNulo(item.webhook_id)
    return id ? [{ id, url: textoOuNulo(item.webhook_url) }] : []
  })
}

export function lerWebhookCriado(corpo: unknown): WebhookCriado | null {
  if (!objeto(corpo)) return null
  const id = textoOuNulo(corpo.webhook_id)
  const segredo = textoOuNulo(corpo.webhook_secret)
  return id && segredo ? { id, segredo } : null
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}
