// Tipos do domínio: planilhas, perfil de colunas, conversa e decisões do harness.
export type TipoBase = "numero" | "data" | "texto" | "booleano";
export type TipoSemantico =
  | "data"
  | "moeda"
  | "quantidade"
  | "percentual"
  | "categoria"
  | "identificador"
  | "geografia"
  | "texto_livre";
export const ROTULO_SEMANTICO: Record<TipoSemantico, string> = {
  data: "Data",
  moeda: "Valor em moeda",
  quantidade: "Quantidade",
  percentual: "Percentual",
  categoria: "Categoria",
  identificador: "Identificador",
  geografia: "Local",
  texto_livre: "Texto livre",
};
export type Coluna = {
  nome: string;
  tipo: TipoBase;
  semantico: TipoSemantico;
  /** De onde veio a classificação semântica. */
  origem: "jev" | "heuristica" | "exemplo";
  confianca: number | null;
  alvoPrevisao: number | null;
  dadoPessoal: number | null;
  nulos: number;
  distintos: number;
  exemplos: string[];
  min?: number | string;
  max?: number | string;
  media?: number;
  soma?: number;
  topo?: { valor: string; n: number }[];
};
export type Qualidade = { duplicadas: number; linhasVazias: number; avisos: string[] };
export type Planilha = {
  id: string;
  nome: string;
  formato: "csv" | "json";
  linhas: number;
  tamanhoBytes: number;
  colunas: Coluna[];
  qualidade: Qualidade;
  periodo: { coluna: string; inicio: string; fim: string } | null;
  criadoEm: string;
  demo: boolean;
  classificacao: "pendente" | "jev" | "heuristica" | "exemplo";
  /** Última chamada ao Jev para classificar as colunas (uma chamada, uma pergunta por coluna). */
  harness: { quando: string; latenciaMs: number; tokens: number; custoUsd: number; caminho: string; colunas: number } | null;
  aviso: string | null;
};
export type Estacao = "classificacao" | "triagem" | "roteamento" | "verificacao" | "sugestoes";
export type RegistroDecisao = {
  estacao: Estacao;
  chave: string;
  rotulo: string;
  valor: string;
  probabilidade: number | null;
  confianca: number | null;
  baixaConfianca: boolean;
  exemplo?: boolean;
};
export type ResumoHarness = {
  chamadasJev: number;
  latenciaJevMs: number;
  custoJevUsd: number;
  tokensJev: number;
  modelo: string;
  latenciaTotalMs: number;
  caminho: string;
  avisos: string[];
};
export type Cartao =
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] }
  | { tipo: "aviso"; texto: string };
export type Mensagem = {
  id: string;
  papel: "usuario" | "assistente";
  texto: string;
  criadoEm: string;
  cartoes?: Cartao[];
  decisoes?: RegistroDecisao[];
  harness?: ResumoHarness;
  sugestoes?: string[];
  exemplo?: boolean;
};
export type StatusConexoes = {
  provider: "chatgpt" | "openrouter";
  model: string;
  modelForte: string;
  chatgpt: { conectado: boolean; email?: string; plano?: string; login: { verificationUrl: string; userCode: string } | null; erro: string | null };
  openrouter: { conectado: boolean; mascarado: string | null; origem: "env" | "banco" | null };
  jev: { disponivel: boolean; modelo: string; caminho: string | null; ultimoTeste: { ok: boolean; latenciaMs: number; quando: string } | null };
  harnessPronto: boolean;
  conversaPronta: boolean;
  modelos: { id: string; name: string }[];
  erro?: string;
};
