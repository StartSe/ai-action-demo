// Criar simulação (US-009) e listar as simulações do gestor (US-012). Os passos 1 e 2 de "Novo treino"
// vivem inteiros no navegador — nada é salvo enquanto o gestor volta e mexe — e o passo 3 só existe
// depois que o POST devolve o link.
import { CRITERIOS_MIN, METODOLOGIAS_IDS, limparCriteriosPersonalizados, type Metodologia } from "@/lib/metodologias";
import { PERSONAS_IDS } from "@/lib/personas";
import { listarTodos as listarTodosProdutos, obter as obterProduto } from "@/lib/produtos";
import { notaMediaPorSimulacao, resumoPorSimulacao } from "@/lib/sessoes";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { criar, listar, type Dificuldade, type ModoPersona } from "@/lib/simulacoes";

const DIFICULDADES: Dificuldade[] = ["facil", "realista", "dificil"];
const MODOS_PERSONA: ModoPersona[] = ["aleatoria", "escolhidas"];

/** O padrão das regras da simulação (US-011): a tela pode não mandar nenhuma delas. */
const REGRAS_PADRAO = { maxTentativas: 3 as number | null, mostrarFeedback: true, permiteTexto: true, permiteVoz: true, duracaoMin: 10 };

const TENTATIVAS_ACEITAS = [1, 3, 5];
const DURACOES_ACEITAS = [5, 10, 15];

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

/**
 * A lista de treinos do gestor (US-012). Cada cartão mostra o produto, o que o treino já rendeu e a
 * nota média — as três contagens saem de **uma consulta agregada cada**, nunca de uma por cartão.
 *
 * O link absoluto vem daqui, e não montado no navegador: é o mesmo endereço que o POST devolveu ao
 * criar o treino, e é o que o gestor cola no grupo do time pelo menu "Copiar link".
 */
export async function GET(req: Request) {
  // `listarTodos` (e não `listar`) porque o produto de exemplo fica escondido da biblioteca assim que
  // existe um produto de verdade, mas as simulações migradas das salas antigas continuam apontando
  // para ele — sem isso os treinos do exemplo ficariam sem nome de produto.
  const nomes = new Map(listarTodosProdutos(500).map((p) => [p.id, p.nome]));
  const resumo = resumoPorSimulacao();
  const notas = notaMediaPorSimulacao();
  const base = baseUrl(req);

  const itens = listar().map((s) => ({
    ...s,
    produtoNome: nomes.get(s.produtoId) ?? "Produto apagado",
    participantes: resumo[s.codigo]?.participantes ?? 0,
    sessoes: resumo[s.codigo]?.sessoes ?? 0,
    ultimaSessao: resumo[s.codigo]?.ultimaSessao ?? null,
    notaMedia: notas[s.codigo]?.nota ?? null,
    url: `${base}/simular/${s.codigo}`,
  }));
  return Response.json({ itens });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));

  const produtoId = String(corpo?.produtoId || "").trim();
  const produto = produtoId ? obterProduto(produtoId) : null;
  if (!produto) {
    return Response.json(
      { error: "Escolha o produto que o time vai vender neste treino.", acao: { rotulo: "Ver meus produtos", url: "/produtos" } },
      { status: 400 },
    );
  }

  const metodologia = umDe<Metodologia>(corpo?.metodologia, METODOLOGIAS_IDS, "consultiva");
  // Critérios da metodologia personalizada: de 3 a 10 linhas com texto, sem repetidos — a limpeza mora
  // em `lib/metodologias.ts`, o mesmo módulo que define o teto, para a regra não existir em dois lugares.
  const criterios = metodologia === "personalizada" ? limparCriteriosPersonalizados(corpo?.criteriosPersonalizados) : [];
  if (metodologia === "personalizada" && criterios.length < CRITERIOS_MIN) {
    return Response.json({ error: "Escreva pelo menos três critérios para a avaliação personalizada." }, { status: 400 });
  }

  const dificuldade = umDe<Dificuldade>(corpo?.dificuldade, DIFICULDADES, "realista");
  const modoPersona = umDe<ModoPersona>(corpo?.modoPersona, MODOS_PERSONA, "aleatoria");
  // No modo aleatório a simulação guarda o catálogo inteiro: a escolha de quem cada vendedor encontra
  // é feita na abertura da sessão (US-008), nunca aqui.
  const personas = modoPersona === "escolhidas" ? personasEscolhidas(corpo?.personas) : PERSONAS_IDS;

  const permiteVoz = booleano(corpo?.permiteVoz, REGRAS_PADRAO.permiteVoz);
  const permiteTexto = booleano(corpo?.permiteTexto, REGRAS_PADRAO.permiteTexto);
  if (!permiteVoz && !permiteTexto) {
    return Response.json({ error: "Deixe pelo menos um jeito de treinar: por voz ou por texto." }, { status: 400 });
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

  // O link que o gestor manda no grupo é o primeiro endereço público real deste app; guardá-lo aqui é
  // o que permite o e-mail do resultado (US-020) montar link absoluto sem adivinhar o domínio.
  registrarEnderecoPublico(req);
  return Response.json({ simulacao, url: `${baseUrl(req)}/simular/${simulacao.codigo}` });
}
