// Tipos do domínio: planilhas, perfil de colunas, papéis de FP&A, conversa e decisões do harness.
import type { Baseline, Cenario, ChavePremissa, MetaReversa, PontoEquilibrio, Premissa, Premissas, ResultadoTurmas, ItemSensibilidade, VariavelMeta } from "./fpa";
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
/** Papel de cada coluna no modelo de FP&A. O Jev escolhe um por coluna; a pessoa confirma. */
export type PapelFPA = "receita" | "desconto" | "custo_fixo" | "custo_variavel" | "marketing" | "produto" | "turma" | "alunos" | "data" | "canal" | "nenhum";
export const ROTULO_PAPEL: Record<PapelFPA, string> = {
  receita: "Receita",
  desconto: "Desconto",
  custo_fixo: "Custo fixo da turma",
  custo_variavel: "Custo variável por aluno",
  marketing: "Gasto de marketing",
  produto: "Produto",
  turma: "Turma",
  alunos: "Alunos",
  data: "Data",
  canal: "Canal",
  nenhum: "Sem papel",
};
export type PapelPlanilha = "matriculas" | "custos" | "marketing" | "outra";
export const ROTULO_PAPEL_PLANILHA: Record<PapelPlanilha, string> = { matriculas: "Matrículas", custos: "Custos por turma", marketing: "Marketing", outra: "Outra" };
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
  papel: PapelFPA;
  papelOrigem: "jev" | "heuristica" | "exemplo" | "confirmado";
  papelConfianca: number | null;
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
  /** Papel da planilha no modelo de FP&A, derivado dos papéis das colunas. */
  papelPlanilha: PapelPlanilha;
  mapeamentoConfirmado: boolean;
};
export type Estacao = "classificacao" | "triagem" | "roteamento" | "especificacao" | "motor" | "verificacao" | "sugestoes";
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
export type LinhaCenario = { rotulo: string; valor: number; tipo: "entrada" | "saida" | "total" };
export type Cartao =
  | { tipo: "tabela"; titulo?: string; cabecalho: string[]; linhas: string[][] }
  | { tipo: "aviso"; texto: string }
  | { tipo: "cenario"; titulo: string; produto: string; turmas: number; linhas: LinhaCenario[]; margemPct: number; margem: { antes: number; depois: number; deltaPp: number; periodo: string } | null }
  | { tipo: "sensibilidade"; titulo: string; base: number; itens: ItemSensibilidade[] }
  | { tipo: "ponto_equilibrio"; titulo: string; produto: string; alunosPorTurma: number; ponto: PontoEquilibrio }
  | { tipo: "meta_reversa"; titulo: string; produto: string; meta: MetaReversa }
  | { tipo: "premissas_faltantes"; produto: string; pergunta: string; itens: { chave: ChavePremissa; rotulo: string; unidade: "moeda" | "numero" | "percentual"; sugerida: number | null; plausibilidade: number | null }[] }
  | { tipo: "recomendacao"; texto: string; pedeValidacao: boolean };
/** Especificação fechada de um cenário, traduzida da pergunta pelo LLM e validada campo a campo. */
export type Especificacao = {
  tipo: "cenario" | "ponto_equilibrio" | "meta_reversa";
  produto: string | null;
  turmas: number;
  horizonte: "mes" | "trimestre" | "semestre" | "ano";
  /** Premissas ditas na própria pergunta ("com custo fixo de 38 mil"). */
  premissas: Partial<Record<ChavePremissa, number>>;
  /** Valores que o LLM propõe para premissas que faltam; nunca entram na conta sem confirmação. */
  sugestoes: Partial<Record<ChavePremissa, number>>;
  meta: { variavel: VariavelMeta; margemAlvoPct: number } | null;
};
/** O que o motor calculou para uma resposta: guardado na mensagem para o recálculo local. */
export type ResultadoFPA = {
  produto: string;
  especificacao: Especificacao;
  premissas: Premissa[];
  valores: Premissas;
  turmas: ResultadoTurmas;
  cenario: Cenario | null;
  ponto: PontoEquilibrio | null;
  meta: MetaReversa | null;
  sensibilidade: ItemSensibilidade[];
  formula: string[];
  baseline: Baseline | null;
  /** Linha "Base: ..." gerada pelo código, não pelo LLM. */
  base: string;
  recalculadoEm?: string;
};
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
  fpa?: ResultadoFPA;
  categoria?: CategoriaPergunta;
};
export type CategoriaPergunta = "diagnostico" | "cenario" | "meta_reversa" | "risco" | "descritiva" | "conceito" | "outra";
export const ROTULO_CATEGORIA: Record<CategoriaPergunta, string> = {
  diagnostico: "Diagnóstico",
  cenario: "Cenário",
  meta_reversa: "Meta reversa",
  risco: "Risco",
  descritiva: "Descritiva",
  conceito: "Conceito",
  outra: "Outra",
};
export type Sugestao = { categoria: CategoriaPergunta; texto: string };
export type ProdutoResumo = {
  nome: string;
  matriculas: number;
  turmas: number;
  alunosPorTurma: number | null;
  ticketMedio: number | null;
  descontoMedioPct: number | null;
  receita: number;
  custoFixoTurma: number | null;
  custoVariavelAluno: number | null;
  cacAluno: number | null;
  /** Margem de contribuição histórica com os custos da base, quando existem. */
  margemHistoricaPct: number | null;
  primeiraTurma: string | null;
  ultimaTurma: string | null;
};
export type PremissasProduto = { produto: string; premissas: Premissa[]; faltantes: ChavePremissa[]; daBase: Partial<Record<ChavePremissa, Premissa>> };
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
/** Resposta de GET /api/base: tudo que a coluna "Base e premissas" e a conversa precisam. */
export type DadosBase = {
  planilhas: Planilha[];
  matriculas: string | null;
  custos: string | null;
  marketing: string | null;
  produtos: ProdutoResumo[];
  premissas: PremissasProduto[];
  periodo: { inicio: string; fim: string } | null;
  baseline: Baseline | null;
  avisos: string[];
  demo: boolean;
  sugestoes: Sugestao[];
};
