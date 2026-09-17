// Criar simulação (US-009): a única gravação dos três passos de "Novo treino". Os passos 1 e 2 vivem
// inteiros no navegador — nada é salvo enquanto o gestor volta e mexe — e o passo 3 só existe depois
// que esta rota devolve o link.
import { PERSONAS_IDS } from "@/lib/personas";
import { obter as obterProduto } from "@/lib/produtos";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { criar, type Dificuldade, type Metodologia, type ModoPersona } from "@/lib/simulacoes";

const METODOLOGIAS: Metodologia[] = ["spin", "consultiva", "personalizada"];
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

/** Critérios da metodologia personalizada: de 3 a 10 linhas com texto, sem repetidos. */
function criteriosPersonalizados(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const limpos = valor.map((c) => String(c ?? "").trim()).filter(Boolean);
  return [...new Set(limpos)].slice(0, 10);
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

  const metodologia = umDe<Metodologia>(corpo?.metodologia, METODOLOGIAS, "consultiva");
  const criterios = metodologia === "personalizada" ? criteriosPersonalizados(corpo?.criteriosPersonalizados) : [];
  if (metodologia === "personalizada" && criterios.length < 3) {
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
