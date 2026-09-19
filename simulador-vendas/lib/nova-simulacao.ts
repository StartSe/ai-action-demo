// As regras de aceitação de um treino novo, num lugar só.
//
// Uma simulação nasce hoje em dois lugares — a tela de três passos (`POST /api/simulacoes`, US-009) e
// a ferramenta `criar_simulacao` do assistente (`lib/ferramentas.ts`, US-029). Se cada um validasse do
// seu jeito, um treino criado pelo assistente aceitaria o que a tela recusa (ou o contrário) e ninguém
// perceberia: as duas continuariam corretas isoladamente. Por isso o que decide fica aqui, e os dois
// chamadores só traduzem a falha para o formato que cada um fala (HTTP 400 lá, erro de ferramenta cá).
import { CRITERIOS_MIN, METODOLOGIAS_IDS, limparCriteriosPersonalizados, type Metodologia } from "./metodologias";
import { PERSONAS_IDS } from "./personas";
import { listarTodos as listarTodosProdutos, obter as obterProduto, type Produto } from "./produtos";
import { criar, type Dificuldade, type ModoPersona, type Simulacao } from "./simulacoes";

export const DIFICULDADES: Dificuldade[] = ["facil", "realista", "dificil"];
export const MODOS_PERSONA: ModoPersona[] = ["aleatoria", "escolhidas"];

/** O padrão das regras da simulação (US-011): quem cria pode não mandar nenhuma delas. */
export const REGRAS_PADRAO = { maxTentativas: 3 as number | null, mostrarFeedback: true, permiteTexto: true, permiteVoz: true, duracaoMin: 10 };

export const TENTATIVAS_ACEITAS = [1, 3, 5];
export const DURACOES_ACEITAS = [5, 10, 15];

function umDe<T extends string>(valor: unknown, aceitos: T[], padrao: T): T {
  return typeof valor === "string" && (aceitos as string[]).includes(valor) ? (valor as T) : padrao;
}

function booleano(valor: unknown, padrao: boolean): boolean {
  return typeof valor === "boolean" ? valor : padrao;
}

/** Só ids que existem no catálogo, sem repetidos e na ordem dele. Lista vazia = o catálogo inteiro. */
function personasEscolhidas(valor: unknown): string[] {
  if (!Array.isArray(valor)) return PERSONAS_IDS;
  const escolhidas = PERSONAS_IDS.filter((id) => valor.includes(id));
  return escolhidas.length ? escolhidas : PERSONAS_IDS;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/**
 * O produto do treino, aceito pelo id **ou pelo nome**.
 *
 * Pelo id é como a tela manda (o select já tem a lista). Pelo nome é como uma pessoa pede ao
 * assistente ("crie um treino do Plano Empresarial"), e é o único jeito de a ferramenta MCP não
 * obrigar quem conversa a descobrir um identificador antes de pedir qualquer coisa.
 *
 * `listarTodos` (e não `listar`) porque o produto de exemplo some da biblioteca assim que existe um
 * produto de verdade, mas continua sendo um produto válido para treinar.
 */
export function acharProduto(valor: unknown): Produto | null {
  const busca = String(valor || "").trim();
  if (!busca) return null;
  const porId = obterProduto(busca);
  if (porId) return porId;
  const alvo = semAcento(busca);
  const todos = listarTodosProdutos(500);
  return todos.find((p) => semAcento(p.nome) === alvo) ?? todos.find((p) => semAcento(p.nome).includes(alvo)) ?? null;
}

export type DadosNovaSimulacao = {
  produtoId?: unknown;
  produto?: unknown;
  nome?: unknown;
  objetivo?: unknown;
  metodologia?: unknown;
  criteriosPersonalizados?: unknown;
  dificuldade?: unknown;
  modoPersona?: unknown;
  personas?: unknown;
  maxTentativas?: unknown;
  mostrarFeedback?: unknown;
  permiteTexto?: unknown;
  permiteVoz?: unknown;
  duracaoMin?: unknown;
};

export type FalhaNovaSimulacao = { erro: string; acao?: { rotulo: string; url: string } };

/**
 * Valida e cria o treino. Devolve `{ erro }` quando alguma regra impede — nunca lança: quem chama
 * decide se isso vira um 400 na tela ou uma frase para o assistente.
 */
export function criarSimulacao(corpo: DadosNovaSimulacao): { simulacao: Simulacao } | FalhaNovaSimulacao {
  const produto = acharProduto(corpo?.produtoId ?? corpo?.produto);
  if (!produto) {
    return { erro: "Escolha o produto que o time vai vender neste treino.", acao: { rotulo: "Ver meus produtos", url: "/produtos" } };
  }

  const metodologia = umDe<Metodologia>(corpo?.metodologia, METODOLOGIAS_IDS, "consultiva");
  // Critérios da metodologia personalizada: de 3 a 10 linhas com texto, sem repetidos — a limpeza mora
  // em `lib/metodologias.ts`, o mesmo módulo que define o teto, para a regra não existir em dois lugares.
  const criterios = metodologia === "personalizada" ? limparCriteriosPersonalizados(corpo?.criteriosPersonalizados) : [];
  if (metodologia === "personalizada" && criterios.length < CRITERIOS_MIN) {
    return { erro: "Escreva pelo menos três critérios para a avaliação personalizada." };
  }

  const dificuldade = umDe<Dificuldade>(corpo?.dificuldade, DIFICULDADES, "realista");
  const modoPersona = umDe<ModoPersona>(corpo?.modoPersona, MODOS_PERSONA, "aleatoria");
  // No modo aleatório a simulação guarda o catálogo inteiro: a escolha de quem cada vendedor encontra
  // é feita na abertura da sessão (US-008), nunca aqui.
  const personas = modoPersona === "escolhidas" ? personasEscolhidas(corpo?.personas) : PERSONAS_IDS;

  const permiteVoz = booleano(corpo?.permiteVoz, REGRAS_PADRAO.permiteVoz);
  const permiteTexto = booleano(corpo?.permiteTexto, REGRAS_PADRAO.permiteTexto);
  if (!permiteVoz && !permiteTexto) {
    return { erro: "Deixe pelo menos um jeito de treinar: por voz ou por texto." };
  }

  const tentativas = corpo?.maxTentativas;
  const maxTentativas = tentativas === null ? null : TENTATIVAS_ACEITAS.includes(Number(tentativas)) ? Number(tentativas) : REGRAS_PADRAO.maxTentativas;
  const duracao = Number(corpo?.duracaoMin);
  const duracaoMin = DURACOES_ACEITAS.includes(duracao) ? duracao : REGRAS_PADRAO.duracaoMin;

  const nome = String(corpo?.nome || "").trim() || `Treino — ${produto.nome}`;

  const simulacao = criar({
    produtoId: produto.id,
    nome,
    objetivo: String(corpo?.objetivo || "").trim() || undefined,
    metodologia,
    criteriosPersonalizados: criterios.length ? criterios : undefined,
    dificuldade,
    modoPersona,
    personas,
    maxTentativas,
    mostrarFeedback: booleano(corpo?.mostrarFeedback, REGRAS_PADRAO.mostrarFeedback),
    permiteTexto,
    permiteVoz,
    duracaoMin,
  });

  return { simulacao };
}
