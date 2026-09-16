export type Tom = "cordial" | "direto" | "descontraido";
export type NaoSei = "humano" | "contato" | "site";
// Renomeado de "Origem" para não colidir com o componente Origem de components/ui.tsx (linha de proveniência do resultado).
export type CanalOrigem = "simulador" | "whatsapp" | "mcp";

export interface Config {
  negocio: string;
  atendente: string;
  tom: Tom;
  horario: string;
  baseConhecimento: string;
  naoSei: NaoSei;
}

export interface Conversa {
  numero: string;
  ultima_mensagem: string;
  /** Última resposta do atendente a essa conversa (para os botões Aprovar/Corrigir na lista de conversas). */
  ultima_resposta: string;
  hora: string;
  transferir: boolean;
  origem: CanalOrigem;
}

export interface MensagemChat {
  papel: "cliente" | "atendente";
  texto: string;
}

/** Entrada/saída salvas em lib/historico.ts (tipo "atendimento") a cada mensagem respondida. */
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
