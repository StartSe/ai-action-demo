// Tipos do domínio deste app (sem imports node:*, para app/page.tsx e components/*.tsx também usarem).

export interface Fonte {
  titulo: string;
  url: string;
  veiculo: string;
  /** Data de publicação (ISO 8601). */
  publicadoEm: string;
  /** Fonte fictícia do radar de exemplo: o link aponta para a página do veículo, não para uma matéria real. A tela mostra "(exemplo)". */
  exemplo?: boolean;
}

export interface Sinal {
  id: string;
  titulo: string;
  resumo: string;
  forca: "alta" | "media" | "baixa";
  tendencia: "subindo" | "estavel" | "caindo";
  temas: string[];
  fontes: Fonte[];
  oQueFazer: string;
}

export interface No {
  id: string;
  rotulo: string;
  tipo: "tema" | "sinal" | "ator" | "tecnologia";
  /** Peso relativo do nó (tamanho/destaque no grafo). */
  peso: number;
}

export interface Aresta {
  /** Id de um No. */
  origem: string;
  /** Id de um No. */
  destino: string;
  relacao: string;
  peso: number;
}

export interface Conexao {
  titulo: string;
  explicacao: string;
  /** Ids de No envolvidos nesta conexão. */
  nos: string[];
}

/** Provedores de busca de lib/busca.ts (os quatro primeiros sem chave; Exa e Tavily com chave). */
export type IdFonteBusca = "hackernews" | "reddit" | "github" | "googlenews" | "exa" | "tavily" | "brightdata" | "brightdata-markdown" | "grok";

/** Situação de uma fonte numa rodada (ou na sondagem feita antes dela): respondeu, não respondeu, chave recusada ou sem chave. */
export type EstadoFonte = { id: IdFonteBusca; nome: string; estado: "ok" | "indisponivel" | "chave_recusada" | "sem_chave"; cache?: boolean; coletadoEm?: string };

export interface Radar {
  periodoDias: number;
  sinais: Sinal[];
  nos: No[];
  arestas: Aresta[];
  conexoes: Conexao[];
  /** Fontes consultadas nesta rodada e como responderam (ausente no radar de exemplo). */
  fontes?: EstadoFonte[];
  /** Quantos achados a busca trouxe antes da IA agrupar (explica um radar com 0 sinais). */
  totalAchados?: number;
  coleta?: { iniciadaEm: string; consultas: number; semData: number; sitesPriorizados: string[]; avisos?: string[] };
}

export interface DadosRadar {
  temas: string[];
  periodoDias: number;
  setor?: string;
}
