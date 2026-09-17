export type Tom = "cordial" | "direto" | "descontraido";
export type NaoSei = "humano" | "contato" | "site";
// Renomeado de "Origem" para não colidir com o componente Origem de components/ui.tsx (linha de proveniência do resultado).
export type CanalOrigem = "simulador" | "whatsapp" | "mcp" | "exemplo";

/** Em que ponto do atendimento a conversa está (lib/conversas.ts); os rótulos ficam em lib/rotulos.ts. */
export type StatusConversa = "ia" | "atencao" | "humano" | "resolvida";

/** Quem escreveu a mensagem: o cliente, o atendente virtual ou a pessoa que assumiu a conversa. */
export type PapelMensagem = "cliente" | "atendente" | "humano";

export interface Config {
  negocio: string;
  atendente: string;
  tom: Tom;
  horario: string;
  baseConhecimento: string;
  naoSei: NaoSei;
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
  /** Assunto da conversa; nulo até a US-019 classificar. */
  assunto: string | null;
  exemplo: boolean;
  nao_lidas: number;
  /** Momento da última mensagem ou mudança de status, em ISO, para as telas ordenarem e agruparem. */
  atualizado_em: string;
}

export interface MensagemChat {
  papel: PapelMensagem;
  texto: string;
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
