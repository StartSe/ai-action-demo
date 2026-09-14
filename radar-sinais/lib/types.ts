// Tipos do domínio deste app. O grafo visual (componente) entra numa história futura; os tipos No/Aresta
// já existem desde já para o Radar fazer sentido como estrutura de dados (nós e conexões entre eles).

export interface Fonte {
  titulo: string;
  url: string;
  veiculo: string;
  /** Data de publicação (ISO 8601). */
  publicadoEm: string;
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
  /** Peso relativo do nó (usado pelo futuro componente de grafo para o tamanho/destaque). */
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

export interface Radar {
  periodoDias: number;
  sinais: Sinal[];
  nos: No[];
  arestas: Aresta[];
  conexoes: Conexao[];
}

export interface DadosRadar {
  temas: string[];
  periodoDias: number;
  setor?: string;
}
