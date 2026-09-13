// Tipos e interface comuns aos provedores de quadro (lib/trello.ts e lib/quadro-demo.ts).
// Trocar de provedor (Jira, Notion, monday, MCP...) significa escrever um novo módulo
// que implemente exatamente esta interface.
import { TRELLO_API_KEY } from "./integracoes";
import { getConfig } from "./store";

export interface Lista {
  id: string;
  nome: string;
}

/** Urgência de um pedido, exibida como etiqueta colorida no cartão (classes .chip-alta/media/baixa já existentes em globals.css). */
export type Etiqueta = "alta" | "media" | "baixa";

export interface Cartao {
  id: string;
  nome: string;
  descricao: string;
  responsavel: string;
  vencimento: string | null;
  /** Data/hora (ISO) da última atualização do cartão (criação, mudança de lista...); usada para detectar cartões "parados". */
  atualizadoEm: string;
  /** Urgência do pedido que deu origem ao cartão; null quando o cartão não veio de um pedido com urgência declarada. */
  etiqueta: Etiqueta | null;
}

export interface ListaComCartoes extends Lista {
  cartoes: Cartao[];
}

export interface Quadro {
  listas: ListaComCartoes[];
}

export interface DadosNovoCartao {
  nome: string;
  descricao?: string;
  listaId: string;
  vencimento?: string | null;
  etiqueta?: Etiqueta | null;
}

export interface ProvedorQuadro {
  listarListas(): Promise<Lista[]>;
  listarCartoes(): Promise<Cartao[]>;
  obterQuadro(): Promise<Quadro>;
  criarCartao(dados: DadosNovoCartao): Promise<Cartao>;
  moverCartao(dados: { cartaoId: string; listaId: string }): Promise<Cartao>;
  atribuir(dados: { cartaoId: string; responsavel: string }): Promise<Cartao>;
  comentar(dados: { cartaoId: string; texto: string }): Promise<{ ok: true; comentarioId: string }>;
  /** Reverte um comentário criado por `comentar` (usado pelo "Desfazer"), identificado pelo `comentarioId` devolvido na hora da criação. */
  removerComentario(dados: { cartaoId: string; comentarioId: string }): Promise<{ ok: true }>;
  arquivarCartao(dados: { cartaoId: string }): Promise<{ ok: true }>;
  /**
   * Só implementado por provedores que podem não ter uma operação inversa disponível para um
   * tipo de ação (ex.: quadro conectado por MCP genérico, US-072); ausente = sempre reversível
   * (Trello, quadro de exemplo), mantendo o comportamento anterior a esta história.
   */
  suportaDesfazer?(tipo: "criar_cartao" | "mover_cartao" | "comentar_cartao"): boolean | Promise<boolean>;
}

/** Chave, token e quadro escolhido: o suficiente para operar um quadro real. Decidido a cada chamada (a configuração pode mudar em /setup sem reiniciar). */
export function trelloConfigurado(): boolean {
  return Boolean((getConfig("TRELLO_API_KEY") || TRELLO_API_KEY) && getConfig("TRELLO_API_TOKEN") && getConfig("TRELLO_BOARD_ID"));
}

/** Só a autorização (chave + token), usada em /api/status para indicar que a conta do Trello já está conectada, mesmo antes de escolher um quadro. */
export function trelloAutorizado(): boolean {
  return Boolean((getConfig("TRELLO_API_KEY") || TRELLO_API_KEY) && getConfig("TRELLO_API_TOKEN"));
}
