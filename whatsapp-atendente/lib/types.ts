import type { MotivoTransferencia } from "./transferencia";

export type Tom = "profissional" | "amigavel" | "personalizado";
/** O que o atendente foi criado para fazer; vira uma frase do prompt em lib/atendente.ts. */
export type Objetivo = "atendimento" | "vendas" | "agendamentos" | "outro";
export type NaoSei = "humano" | "contato" | "site";
// Renomeado de "Origem" para não colidir com o componente Origem de components/ui.tsx (linha de proveniência do resultado).
export type CanalOrigem = "simulador" | "whatsapp" | "mcp" | "exemplo";

/** Em que ponto do atendimento a conversa está (lib/conversas.ts); os rótulos ficam em lib/rotulos.ts. */
export type StatusConversa = "ia" | "atencao" | "humano" | "resolvida";

/** Janela de tempo dos filtros de Conversas e Relatórios; os rótulos ficam em lib/rotulos.ts. */
export type Periodo = "hoje" | "7d" | "30d" | "tudo";

/**
 * Quem escreveu a mensagem: o cliente, o atendente virtual ou a pessoa que assumiu a conversa. Os dois
 * últimos não são mensagens de ninguém para o cliente: `nota` é uma anotação interna da equipe e
 * `evento` é uma linha do tempo ("Você assumiu a conversa"). Os dois ficam só na tela — nunca vão
 * para a IA (`historicoRecente`), não contam como não lidas e nunca saem pelo número da empresa.
 */
export type PapelMensagem = "cliente" | "atendente" | "humano" | "nota" | "evento";

/** As mensagens que são conversa de verdade (o que a IA lê e o que conta como pergunta e resposta). */
export const PAPEIS_DE_CONVERSA: PapelMensagem[] = ["cliente", "atendente", "humano"];

/**
 * Os períodos que os números de Início e Relatórios aceitam (lib/metricas.ts). "Tudo" fica de fora:
 * todo número desta tela vem com a comparação com o período anterior de mesmo tamanho, e "tudo" não
 * tem anterior.
 */
export type PeriodoMetricas = Exclude<Periodo, "tudo">;

/**
 * Quanto cada número cresceu ou caiu em relação ao período anterior de mesmo tamanho, em pontos
 * percentuais arredondados. `null` quando o período anterior não teve nada: sem base, não há
 * porcentagem para mostrar (e não é "0%").
 */
export interface VariacaoMetricas {
  conversas: number | null;
  resolvidasIA: number | null;
  passadasPessoa: number | null;
  tempoMedioMs: number | null;
}

/** Um dia do gráfico de Relatórios. `dia` é a data local em "AAAA-MM-DD". */
export interface DiaMetricas {
  dia: string;
  conversas: number;
  resolvidasIA: number;
}

/** Um assunto e quantas conversas do período trataram dele. */
export interface AssuntoMetricas {
  assunto: string;
  total: number;
}

/**
 * Os números do atendimento em um período, do jeito que Início e Relatórios desenham. Fonte única:
 * lib/metricas.ts, com as definições de cada número documentadas no topo daquele arquivo.
 */
export interface Metricas {
  conversas: number;
  resolvidasIA: number;
  passadasPessoa: number;
  /** Média de tempo até a resposta, em milissegundos; 0 quando ninguém respondeu no período. */
  tempoMedioMs: number;
  variacao: VariacaoMetricas;
  /** Todos os dias do período, inclusive os sem conversa nenhuma, para o gráfico não ter buracos. */
  porDia: DiaMetricas[];
  assuntos: AssuntoMetricas[];
  /** As conversas paradas esperando uma pessoa AGORA; não é filtrada pelo período (veja lib/metricas.ts). */
  atencao: Conversa[];
}

export interface Config {
  negocio: string;
  atendente: string;
  objetivo: Objetivo;
  /** O que o atendente deve fazer, escrito pela pessoa; só existe quando `objetivo === "outro"`. */
  objetivoTexto?: string;
  tom: Tom;
  /** Estilo de resposta escrito pela pessoa; só existe quando `tom === "personalizado"`. */
  tomTexto?: string;
  horario: string;
  baseConhecimento: string;
  naoSei: NaoSei;
  /**
   * O que o cliente recebe quando a IA falha numa conversa real (lib/atendente.ts). Vazio = a frase
   * padrão de lib/transferencia.ts (`FRASE_FALHA_PADRAO`).
   */
  fraseFalha?: string;
}

/** Uma conversa como as telas leem: os campos da tabela `conversas` mais o resumo das mensagens. */
export interface Conversa {
  numero: string;
  /** Nome do contato quando o canal informa um; string vazia quando só há o número. */
  nome: string;
  ultima_mensagem: string;
  /** Última resposta do atendente a essa conversa (para os botões Aprovar/Corrigir na lista de conversas). */
  ultima_resposta: string;
  hora: string;
  /** Atalho de `status === "atencao"`: a conversa parou esperando uma pessoa. */
  transferir: boolean;
  origem: CanalOrigem;
  status: StatusConversa;
  /** Assunto da conversa (lib/assuntos.ts); nulo até a primeira resposta do atendente classificá-la. */
  assunto: string | null;
  exemplo: boolean;
  nao_lidas: number;
  /** Momento da última mensagem ou mudança de status, em ISO, para as telas ordenarem e agruparem. */
  atualizado_em: string;
  /** Por que a IA passou a conversa para uma pessoa (lib/transferencia.ts); nulo enquanto ela não passou. */
  motivoTransferencia: MotivoTransferencia | null;
  /** Desde quando o cliente espera uma pessoa, em ISO; nulo quando ninguém está esperando. */
  esperandoDesde: string | null;
}

export interface MensagemChat {
  papel: PapelMensagem;
  texto: string;
}

/** Uma mensagem já gravada, como a conversa aberta e a IA a leem (datas sempre em ISO). */
export interface MensagemDaConversa extends MensagemChat {
  id: number;
  criadoEm: string;
  /** Nome da ferramenta dos sistemas da empresa consultada para escrever esta resposta, se alguma foi. */
  ferramentaUsada?: string;
  /** Quanto o atendente levou entre receber a pergunta e gravar esta resposta. */
  tempoRespostaMs?: number;
}

/**
 * A conversa inteira, com as mensagens: o que `GET /api/conversas/[numero]` devolve e o que a coluna
 * do meio de Conversas desenha. Os campos sem `mensagens` são o registro da tabela `conversas`
 * (lib/conversas.ts:ConversaRegistro), com o status JÁ calculado na leitura.
 */
export interface ConversaCompleta {
  numero: string;
  /** Nome do contato quando o canal informa um; string vazia quando só há o número. */
  nome: string;
  origem: CanalOrigem;
  status: StatusConversa;
  /** Assunto da conversa (lib/assuntos.ts); nulo até a primeira resposta do atendente classificá-la. */
  assunto: string | null;
  exemplo: boolean;
  naoLidas: number;
  criadoEm: string;
  atualizadoEm: string;
  /** Por que a IA passou a conversa para uma pessoa (lib/transferencia.ts); nulo enquanto ela não passou. */
  motivoTransferencia: MotivoTransferencia | null;
  /** Desde quando o cliente espera uma pessoa, em ISO; nulo quando ninguém está esperando. */
  esperandoDesde: string | null;
  mensagens: MensagemDaConversa[];
}

/** Entrada/saída de registros antigos do tipo "atendimento" em lib/historico.ts. Desde a US-003 as
 * conversas vivem no banco (lib/conversas.ts) e nada novo é salvo assim; o tipo continua porque
 * `/r/[id]` e `/imprimir/[id]` precisam abrir os registros já gerados. */
export interface AtendimentoEntrada {
  numero: string;
  texto: string;
}

export interface AtendimentoSaida {
  resposta: string;
  transferir: boolean;
  conversas: Conversa[];
}

/** Uma pergunta que merece atenção da equipe: sem resposta boa, repetida ou transferida para um humano. */
export interface PerguntaPendente {
  pergunta: string;
  /** Número da conversa mais recente com essa pergunta, para o link "abrir a conversa". */
  numero: string;
  frequencia: number;
  transferida: boolean;
  /** Última resposta que o atendente deu a essa pergunta, ponto de partida para a correção.
   * Opcional: relatórios salvos antes desta história não têm o campo e precisam continuar abrindo. */
  ultimaResposta?: string;
}

/** Uma pergunta pendente com a sugestão de resposta escrita pela IA, no relatório diário (lib/rotinas-do-app.ts). */
export interface ItemRelatorioAtendimento extends PerguntaPendente {
  respostaSugerida: string;
  /** Nome da ferramenta dos sistemas da empresa (MCP) consultada para montar a resposta sugerida, se alguma foi usada. */
  ferramentaUsada?: string;
}

/** Entrada/saída salvas em lib/historico.ts (tipo "relatorio-atendimento") pela rotina diária. */
export interface RelatorioAtendimentoSaida {
  itens: ItemRelatorioAtendimento[];
}
