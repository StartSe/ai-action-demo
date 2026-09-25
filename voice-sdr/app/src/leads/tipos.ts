import type { RecorteDeLeads } from '@compartilhado/recorte-de-leads.ts'
import type {
  ArquivoDaImportacao,
  MotivoDoRelatorio,
  RelatorioDaImportacao,
} from '@importacao/confirmacao.ts'
import type {
  MapeamentoDeColunas,
  PlanilhaLida,
  Previa,
} from '@importacao/previa.ts'

import type { CorDaEtapa } from '@/funil/etapas'
import type { EventoDoLead, LigacaoDoLead } from '@/leads/linha-do-tempo'

/**
 * As três temperaturas que o check de `leads.temperature` aceita. A lista
 * existe aqui porque o seletor precisa oferecer as opções; o domínio continua
 * sendo do banco, e valor fora dele devolve zero linha em vez de erro.
 */
export type Temperatura = 'frio' | 'morno' | 'quente'

/**
 * Por onde o lead entrou, na coluna `source`. São os quatro caminhos de
 * escrita do produto (importação, endereço público, cadastro manual, primeira
 * mensagem pelo WhatsApp). O que o cliente chamou de origem é mais específico
 * e mora em `source_ref`, que não filtra.
 */
export type Origem = 'import' | 'intake' | 'manual' | 'whatsapp'

/** A etapa do funil, como o filtro e a tabela precisam dela. */
export interface EtapaDoFunil {
  /** A chave imutável (`new`, `contacted`, …), que é o que o filtro manda. */
  chave: string
  /** O rótulo editável, que é o que a tela mostra. */
  rotulo: string
  /**
   * O token da paleta gravado em `color`, ou `null` para a cor padrão da
   * chave. Opcional porque só o quadro o desenha.
   */
  cor?: CorDaEtapa | null
}

/**
 * Um lead na lista. É o recorte de colunas que a tabela desenha, e não a linha
 * inteira: a ficha do lead é da F4 e vai pedir o resto.
 */
export interface LeadDaLista {
  id: string
  /** Vazio quando a planilha não trouxe nome; o telefone é que identifica. */
  nome: string
  /** E.164, como o banco guarda. */
  telefone: string
  empresa: string
  cidade: string
  /** Sigla de duas letras, ou vazio. */
  estado: string
  etapa: EtapaDoFunil | null
  temperatura: Temperatura | null
  /** ISO 8601, ou null para quem ainda não teve contato nenhum. */
  ultimaAtividade: string | null
  bloqueado: boolean
}

export interface PaginaDeLeads {
  leads: LeadDaLista[]
  /** As etapas do funil padrão da conta, na ordem, para o filtro e a tabela. */
  etapas: EtapaDoFunil[]
  /** A consulta bateu no teto e há leads atrás dele. */
  truncada: boolean
}

/**
 * Por que a lista não veio. `filtro-invalido` não vem do servidor: é a tela
 * recusando um recorte que chegou torto pela barra de endereço, antes de
 * consultar. Descartar o filtro em silêncio mostraria a conta inteira a quem
 * pediu um recorte, que é o engano que ninguém percebe.
 */
export type MotivoDeFalhaDosLeads =
  | 'sem-permissao'
  | 'sem-conta'
  | 'filtro-invalido'
  | 'falha-de-comunicacao'

export type CargaDeLeads =
  | { ok: true; pagina: PaginaDeLeads }
  | { ok: false; motivo: MotivoDeFalhaDosLeads }

/**
 * O que uma escrita em lote devolve. Os dois lados vêm juntos de propósito: a
 * política de RLS recusa linha por linha e **em silêncio** — a escrita que não
 * alcança a linha não levanta erro, apenas não a devolve —, e por isso toda
 * escrita daqui pede `.select()` de volta e compara com o que mandou. Lote em
 * que parte passou é resultado, não falha: quem age sobre vinte leads precisa
 * saber quais dois ficaram para trás, e não uma frase dizendo que nada
 * aconteceu.
 */
export interface ResultadoDoLote {
  /** Ids que a escrita alcançou, na ordem em que o banco os devolveu. */
  feitos: string[]
  /** Ids que estavam no pedido e não voltaram: a política os recusou. */
  recusados: string[]
}

export type RespostaDoLote =
  | { ok: true; resultado: ResultadoDoLote }
  | { ok: false; motivo: MotivoDeFalhaDosLeads }

/**
 * Por que a mesclagem não foi feita. São os códigos que `lead_merge` levanta
 * (US-031), traduzidos para a forma com hífen que a tela usa; a frase de cada
 * um está em `app/src/copy/leads.ts`.
 */
export type MotivoDaMesclagem =
  | 'sem-permissao'
  | 'mesmo-lead'
  | 'lead-inexistente'
  | 'lead-de-outra-conta'
  | 'ja-mesclado'
  | 'falha-de-comunicacao'

export type RespostaDaMesclagem =
  | { ok: true }
  | { ok: false; motivo: MotivoDaMesclagem }

/**
 * O arquivo que a exportação devolveu, antes de virar download.
 *
 * `foraDoArquivo` é quantos leads o recorte alcança e não couberam no teto da
 * borda. Ele existe como número, e não como o código `teto_atingido` que a
 * função devolve em cabeçalho, porque a frase da tela precisa dizer **quantos**
 * ficaram: "alguns leads não couberam" manda conferir 50 mil linhas.
 */
export interface ArquivoDeLeads {
  nome: string
  conteudo: string
  linhas: number
  foraDoArquivo: number
}

/**
 * Por que a exportação não saiu. `recorte-vazio` não é erro: é o recorte que
 * não alcança lead nenhum, e a tela o diz como estado, não como falha.
 */
export type MotivoDaExportacao =
  | 'sem-permissao'
  | 'recorte-vazio'
  | 'filtro-invalido'
  | 'falha-de-comunicacao'

export type RespostaDaExportacao =
  | { ok: true; arquivo: ArquivoDeLeads }
  | { ok: false; motivo: MotivoDaExportacao }

/**
 * Um lead que já existe com o telefone que se está digitando (RF-106).
 *
 * É recorte menor que o da lista de propósito: o cadastro só precisa mostrar
 * quem é e oferecer o caminho até ele. Pedir a linha inteira faria a tela de
 * cadastro depender de colunas que ela não desenha.
 */
export interface LeadExistente {
  id: string
  /** Vazio quando o lead entrou sem nome; o telefone é que identifica. */
  nome: string
  /** E.164, como o banco guarda. */
  telefone: string
  empresa: string
}

export type RespostaDaProcura =
  | { ok: true; lead: LeadExistente | null }
  | { ok: false; motivo: MotivoDeFalhaDosLeads }

export type RespostaDoFunil =
  | { ok: true; etapas: EtapaDoFunil[] }
  | { ok: false; motivo: MotivoDeFalhaDosLeads }

/**
 * O lead que o cadastro manual grava, na língua da tela.
 *
 * A etapa viaja por **chave** (`new`, `contacted`) e não por id: a interface
 * inteira fala em chave — é o que o filtro da lista manda e o que a tabela
 * mostra —, e quem traduz para o `stage_id` que `registrar_lead` espera é o
 * serviço, que é o lado que conhece as colunas.
 *
 * `origem` é o que o operador chamou de origem e vai para `source_ref`. A
 * coluna `source` não entra aqui porque ela não é escolha de ninguém: quem
 * entra por esta tela entra como `manual`, e deixar a tela escrevê-la faria
 * o filtro de origem da lista mentir.
 */
export interface NovoLead {
  /** E.164, já normalizado por `@compartilhado/telefone.ts`. */
  telefone: string
  nome: string
  email: string
  empresa: string
  origem: string
  /** Chave da etapa do funil padrão, ou `null` para nascer sem etapa. */
  etapa: string | null
  cidade: string
  estado: string
  /** Zona IANA, normalmente resolvida do DDD (RF-109). */
  fuso: string
}

/**
 * Por que o cadastro não foi gravado. São os códigos que `registrar_lead`
 * levanta, traduzidos para a forma com hífen que a tela usa; a frase de cada um
 * está em `app/src/copy/leads.ts`.
 *
 * `duplicado` chega por dois caminhos: a procura que a tela faz enquanto se
 * digita, e a recusa do índice único quando alguém gravou o mesmo número entre
 * a procura e o clique. Os dois terminam na mesma tela, mostrando o lead que já
 * existe.
 */
export type MotivoDoCadastro =
  | 'sem-permissao'
  | 'sem-conta'
  | 'telefone-invalido'
  | 'etapa-invalida'
  | 'duplicado'
  | 'falha-de-comunicacao'

export type RespostaDoCadastro =
  | { ok: true; leadId: string }
  | { ok: false; motivo: MotivoDoCadastro }

/**
 * A importação de planilha, na língua da tela (RF-101, RF-104, RF-105).
 *
 * Os tipos do miolo — `PlanilhaLida`, `Previa`, `RelatorioDaImportacao` — vêm
 * de `@importacao/`, que é a parte portável da função `leads-import`. A tela
 * não guarda uma segunda versão deles: a prévia que ela desenha é a mesma que a
 * borda montou, e uma cópia do formato aqui só teria como divergir.
 */

/**
 * O que fazer com telefone que a conta já tem, como a tela oferece (RF-103).
 *
 * `criar` existe no banco e não é oferecido aqui, e a razão é do índice: o
 * parcial `(account_id, phone_e164) where merged_into_id is null` recusa o
 * segundo lead com o mesmo número, então `criar` só produziria uma linha de
 * erro por duplicata. A tela diz isso em uma frase, em vez de esconder a
 * opção.
 */
export type EscolhaDeDuplicata = 'ignorar' | 'atualizar'

/**
 * A frase de cada motivo que apareceu, indexada pelo código dele. Vem do
 * servidor junto com a prévia e com o relatório: o corpo carrega o código em
 * cada linha e a frase uma vez só, e `leads-import/respostas.ts` é quem as
 * escreve.
 */
export type FrasesDaImportacao = Readonly<Partial<Record<MotivoDoRelatorio, string>>>

/** O que a tela manda para a prévia: o arquivo já lido e o mapeamento aceito. */
export interface PedidoDaPrevia {
  planilha: PlanilhaLida
  mapeamento: MapeamentoDeColunas
}

/**
 * O que a tela manda para gravar. Repete a planilha e o mapeamento de
 * propósito: a borda recalcula a prévia com o estado atual da base em vez de
 * receber os leads prontos do navegador.
 */
export interface PedidoDaImportacao extends PedidoDaPrevia {
  arquivo: ArquivoDaImportacao
  aoDuplicar: EscolhaDeDuplicata
}

/**
 * Por que a importação não foi adiante. `planilha-recusada` é a borda dizendo
 * que não entendeu o corpo, e é o único caso em que refazer a leitura do
 * arquivo resolve; os outros são de acesso ou de servidor.
 */
export type MotivoDaImportacao =
  | 'sem-permissao'
  | 'sem-conta'
  | 'planilha-recusada'
  | 'falha-de-comunicacao'

export type RespostaDaPrevia =
  | { ok: true; previa: Previa; frases: FrasesDaImportacao }
  | { ok: false; motivo: MotivoDaImportacao }

export type RespostaDaImportacao =
  | { ok: true; relatorio: RelatorioDaImportacao; frases: FrasesDaImportacao }
  | { ok: false; motivo: MotivoDaImportacao }

/**
 * O contrato que a interface conhece. A implementação sobre o Supabase está em
 * `servico-supabase.ts`; o teste de componente passa um dublê que atende a
 * esta mesma interface, sem rede.
 *
 * O parâmetro de `listar` e de `exportar` é o `RecorteDeLeads` de
 * `@compartilhado/`, o mesmo objeto que a exportação (`lead-export`) recebe: é
 * o que garante que a planilha baixada tenha exatamente as linhas que estavam
 * à vista.
 *
 * As ações de cadência e de campanha não estão aqui, e a ausência é do esquema,
 * não da interface: `cadences` e `campaigns` são tabelas de fatias seguintes.
 * O cabeçalho de `app/src/copy/leads.ts` declara isso.
 */
// O funil (US-250, RF-201) -------------------------------------------------------

/**
 * Quem fez a última mudança de etapa, lida do `lead_events` de kind
 * `stage_change` (RF-205). É o mesmo vocabulário de `lead_events.actor`:
 * `agent` é a Sarah decidindo sozinha, e é o que acende o sinal no cartão.
 */
export interface MudancaDeEtapa {
  ator: 'user' | 'agent' | 'system'
  /** `occurred_at` do evento, em ISO 8601. */
  em: string
}

/** Um cartão do quadro: o lead da lista mais o que só o funil desenha. */
export interface LeadDoFunil extends LeadDaLista {
  /** `leads.score`, de 0 a 100, ou `null` enquanto ninguém pontuou. */
  pontuacao: number | null
  /** `null` para quem nunca mudou de etapa desde que entrou. */
  ultimaMudancaDeEtapa: MudancaDeEtapa | null
}

/** Uma coluna do funil: a etapa, quantos leads tem e os mais recentes. */
export interface ColunaDoFunil {
  etapa: EtapaDoFunil
  /** Quantos leads a conta tem nesta etapa, no recorte, sem teto. */
  total: number
  /** Os mais recentes da etapa, até o teto da coluna. */
  leads: readonly LeadDoFunil[]
  /** `total` passou do teto, e `leads` é só a parte mais recente. */
  truncada: boolean
}

export interface EstadoDoFunil {
  colunas: readonly ColunaDoFunil[]
  /** Quantos leads a conta tem no funil inteiro. Zero é a conta que começou agora. */
  total: number
  /**
   * Leads sem etapa nenhuma. Não é coluna: eles não estão no funil, e pô-los
   * numa coluna fingiria que estão. A tela os conta e oferece a lista.
   */
  semEtapa: number
}

export type CargaDoFunil =
  | { ok: true; funil: EstadoDoFunil }
  | { ok: false; motivo: MotivoDeFalhaDosLeads }

/**
 * Por que o lead não mudou de etapa. São os códigos de `mover_lead_de_etapa`
 * na forma com hífen; `lead_de_outra_conta` vira `lead-inexistente`, porque
 * para quem está nesta conta o lead não existe. A frase de cada um está em
 * `app/src/copy/funil.ts`.
 */
export type MotivoDaMudancaDeEtapa =
  | 'sem-permissao'
  | 'lead-inexistente'
  | 'etapa-inexistente'
  | 'falha-de-comunicacao'

/**
 * `mesma_etapa` é resultado, não erro: o lead já estava lá, nenhum evento foi
 * gravado, e a tela diz isso em vez de acusar falha.
 */
export type RespostaDaMudancaDeEtapa =
  | { ok: true; resultado: 'movido' | 'mesma_etapa' }
  | { ok: false; motivo: MotivoDaMudancaDeEtapa }

// A configuração das etapas (US-146, RF-207) ------------------------------------

/** Uma etapa do funil padrão como quem administra a configura. */
export interface EtapaConfigurada extends EtapaDoFunil {
  id: string
  posicao: number
  cor: CorDaEtapa | null
  /** Uma das seis chaves que a automação cita: não se apaga. */
  canonica: boolean
  /** Quantos leads estão nela agora, sem recorte nenhum. */
  leads: number
}

export interface ConfiguracaoDasEtapas {
  /** O funil padrão da conta, que é o que `configurar_etapas` recebe. */
  funilId: string
  /** Na ordem de `position`, como o banco a devolveu. */
  etapas: EtapaConfigurada[]
}

export type CargaDaConfiguracao =
  | { ok: true; configuracao: ConfiguracaoDasEtapas }
  | { ok: false; motivo: MotivoDeFalhaDosLeads }

/**
 * Uma etapa como o RPC a recebe: com `id` é existente, e a chave dela não
 * viaja; sem `id` é nova, e a chave é a que ela terá para sempre.
 */
export interface EtapaPedida {
  id?: string
  chave?: string
  rotulo: string
  posicao: number
  cor: CorDaEtapa | null
}

/**
 * Por que a configuração não foi gravada. São os códigos de
 * `configurar_etapas` na forma com hífen; a frase de cada um está em
 * `app/src/copy/funil.ts`.
 */
export type MotivoDaConfiguracao =
  | 'sem-permissao'
  | 'etapa-de-outra-conta'
  | 'chave-invalida'
  | 'posicao-duplicada'
  | 'etapa-canonica'
  | 'falha-de-comunicacao'

/**
 * No caso bom vem a configuração relida do banco, e não a que a tela mandou: a
 * tela desenha a ordem do servidor, nunca a otimista.
 */
export type RespostaDaConfiguracao =
  | { ok: true; configuracao: ConfiguracaoDasEtapas }
  | { ok: false; motivo: MotivoDaConfiguracao }

/** Os dois códigos do gatilho `recusar_exclusao_de_etapa`, mais os de sempre. */
export type MotivoDaExclusaoDeEtapa =
  | 'sem-permissao'
  | 'etapa-canonica'
  | 'etapa-com-leads'
  | 'falha-de-comunicacao'

export type RespostaDaExclusaoDeEtapa =
  | { ok: true }
  | { ok: false; motivo: MotivoDaExclusaoDeEtapa }

// A ficha do lead (US-147, RF-113, RF-116) --------------------------------------

/**
 * O briefing que a qualificação escreve em `leads.briefing` (chaves `pain`,
 * `fit`, `objections`, `next_action`, de `@compartilhado/qualificacao/resultado.ts`).
 * `null` é campo que nenhuma ligação confirmou ainda.
 */
export interface BriefingDoLead {
  dor: string | null
  fit: string | null
  objecoes: string | null
  proximaAcao: string | null
}

export interface FichaDoLead {
  id: string
  /** Vazio quando o lead entrou sem nome; o telefone é que identifica. */
  nome: string
  /** E.164, como o banco guarda. */
  telefone: string
  empresa: string
  cidade: string
  estado: string
  /** Zona IANA de `leads.timezone`, ou `null`. */
  fuso: string | null
  /** A etapa de agora, com o rótulo de agora. */
  etapa: EtapaDoFunil | null
  temperatura: Temperatura | null
  pontuacao: number | null
  bloqueio: { em: string; motivo: string | null } | null
  briefing: BriefingDoLead
  /** As etapas do funil padrão, para o seletor de mudança de etapa. */
  etapas: EtapaDoFunil[]
  /**
   * Os eventos crus de `lead_events`, do mais recente para o mais antigo. A
   * ordem que vale é a de `montarLinhaDoTempo`, que a tela aplica.
   */
  eventos: EventoDoLead[]
  /** As linhas de `calls` que os eventos `call` apontam. */
  ligacoes: LigacaoDoLead[]
  /** Nome de cada membro da conta, pelo id, para dizer quem agiu. */
  nomes: ReadonlyMap<string, string>
  /** A linha do tempo bateu no teto e há eventos mais antigos atrás dele. */
  truncada: boolean
}

export type MotivoDaFichaDoLead = 'nao-encontrado' | MotivoDeFalhaDosLeads

export type CargaDaFichaDoLead =
  | { ok: true; ficha: FichaDoLead }
  | { ok: false; motivo: MotivoDaFichaDoLead }

/** Por que a nota não foi registrada. A frase de cada um está em `app/src/copy/lead.ts`. */
export type MotivoDaNota = 'sem-permissao' | 'lead-inexistente' | 'falha-de-comunicacao'

export type RespostaDaNota = { ok: true } | { ok: false; motivo: MotivoDaNota }

export interface ServicoDeLeads {
  listar(recorte: RecorteDeLeads): Promise<CargaDeLeads>
  /**
   * A ficha de um lead (US-147): identidade, situação, briefing e os eventos
   * da linha do tempo com as chamadas que eles apontam.
   */
  carregarFichaDoLead(id: string): Promise<CargaDaFichaDoLead>
  /**
   * Nota manual (RF-116): `registrar_evento_de_lead` com kind `note`. Com
   * sessão, o RPC assina com `auth.uid()` e `actor = 'user'`.
   */
  registrarNota(leadId: string, texto: string): Promise<RespostaDaNota>
  /**
   * As etapas do funil padrão da conta, para o seletor do cadastro. Vem à
   * parte de `listar` porque quem cadastra não precisa de lead nenhum, e pedir
   * a lista inteira para ler seis rótulos traria quinhentas linhas junto.
   */
  carregarEtapas(): Promise<RespostaDoFunil>
  /**
   * O funil em colunas (US-250, US-145, RF-201): cada etapa com a contagem e
   * os leads mais recentes dela, dentro do recorte. O quadro só manda
   * `origem` e `atividadeDesde` (RF-206); a etapa é a própria coluna.
   */
  carregarFunil(recorte?: RecorteDeLeads): Promise<CargaDoFunil>
  /**
   * Chama `mover_lead_de_etapa` com `actor = 'user'` (RF-202). A etapa viaja
   * pela chave, nunca pelo rótulo (RF-203).
   */
  moverDeEtapa(leadId: string, chaveDaEtapa: string): Promise<RespostaDaMudancaDeEtapa>
  /** As etapas do funil padrão com id, cor e quantos leads cada uma tem. */
  carregarConfiguracaoDasEtapas(): Promise<CargaDaConfiguracao>
  /**
   * Chama `configurar_etapas` com a lista inteira numa chamada só (RF-207) e,
   * no caso bom, relê a configuração do banco.
   */
  configurarEtapas(
    funilId: string,
    etapas: readonly EtapaPedida[],
  ): Promise<RespostaDaConfiguracao>
  /** Apaga a etapa. As canônicas e as com lead, o gatilho do banco recusa. */
  apagarEtapa(id: string): Promise<RespostaDaExclusaoDeEtapa>
  /**
   * O lead vivo desta conta com este telefone, ou `null`. É o que evita gravar
   * para receber a recusa do índice único: a tela mostra quem já existe.
   */
  procurarPorTelefone(e164: string): Promise<RespostaDaProcura>
  /** Chama o RPC `registrar_lead`, o caminho único de gravação de lead. */
  cadastrar(novo: NovoLead): Promise<RespostaDoCadastro>
  /** Grava `blocked_at` e `blocked_reason` e um `lead_event` por lead. */
  bloquear(ids: readonly string[], motivo: string): Promise<RespostaDoLote>
  /** Limpa o par de bloqueio e grava o evento inverso. */
  desbloquear(ids: readonly string[]): Promise<RespostaDoLote>
  /** Apaga os leads. A trilha de auditoria fica pelo gatilho da tabela. */
  excluir(ids: readonly string[]): Promise<RespostaDoLote>
  /** Chama o RPC `lead_merge`: o destino é quem permanece. */
  mesclar(origemId: string, destinoId: string): Promise<RespostaDaMesclagem>
  /** Chama `lead-export` com o recorte à vista e devolve o CSV. */
  exportar(recorte: RecorteDeLeads): Promise<RespostaDaExportacao>
  /**
   * Chama `leads-import` na ação `previa`: diz o que a planilha faria, sem
   * gravar nada. É a etapa que o operador lê antes de decidir (RF-104).
   */
  preverImportacao(pedido: PedidoDaPrevia): Promise<RespostaDaPrevia>
  /** Chama `leads-import` na ação `confirmar`: o único ponto que grava. */
  importar(pedido: PedidoDaImportacao): Promise<RespostaDaImportacao>
}
