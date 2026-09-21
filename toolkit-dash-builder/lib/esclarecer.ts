// Gate de esclarecimento (RF-04): primeiro a heurística local, sem IA; só no caso duvidoso a IA decide se pergunta.
import { aiEnabled, askJSON } from "./ai";
import { esclarecimentoDemo } from "./demo";
import { IDIOMA } from "./idioma";
import type { PerguntaEsclarecimento, RespostaEsclarecimento } from "./types";

/** Radicais de domínio (sem acento, minúsculos). Um token conta quando COMEÇA por um radical. */
export const RADICAIS_DOMINIO = [
  "vend", "receit", "fatur", "lucr", "margem", "ticket",
  "client", "lead", "convers", "funil", "propost", "oportunidad",
  "campanh", "retorn", "aquisic", "canal", "canais", "trafeg", "anunci",
  "estoqu", "inventar", "giro", "produt", "categori",
  "projet", "taref", "praz", "entreg", "ocupac", "hora",
  "financ", "flux", "caix", "despes", "cust", "orcament", "inadimpl",
  "marketing", "engajament", "assinatur", "cancelament", "churn", "recorrent", "expans",
  "rh", "pessoa", "colaborador", "rotatividad", "contratac", "desligament",
  "juridic", "process", "contrat",
  "atendiment", "chamad", "satisfac", "nps", "servic",
  "meta", "indicador", "objetiv",
  "mensal", "mes", "diari", "dia", "semanal", "trimestr", "anual",
  "regi", "estad", "loj", "vendedor", "equip", "time",
];

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** true = precisa avaliar (a IA decide se pergunta; em demonstração, as perguntas fixas). */
export function precisaEsclarecerLocal(descricao: string): boolean {
  const texto = normalizar(descricao).trim();
  if (texto.length < 30) return true;
  const tokens = texto.split(/[^a-z0-9]+/).filter(Boolean);
  const radicais = new Set<string>();
  for (const token of tokens) {
    // Radical curto (rh, nps, dia, mes) só casa a palavra inteira ou o plural; os demais casam por prefixo.
    const radical = RADICAIS_DOMINIO.find((r) =>
      r.length <= 3 ? token === r || token === `${r}s` || token === `${r}es` : token.startsWith(r),
    );
    if (radical) radicais.add(radical);
  }
  return radicais.size < 3;
}

export function juntarEsclarecimentos(descricao: string, respostas: Record<string, string>): string {
  const linhas = Object.entries(respostas)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `- ${k}: ${v}`);
  return linhas.length ? `${descricao}\n\nDetalhes adicionais:\n${linhas.join("\n")}` : descricao;
}

export const SYSTEM_ESCLARECER = `${IDIOMA}

Você avalia pedidos de painel de indicadores feitos por gestores brasileiros.

Sua tarefa: decidir se o pedido tem informação suficiente para montar um painel útil, com 5 a 8 indicadores e gráficos relevantes, OU se falta algo crítico (o setor ou a área, o período, o recorte — por região, por produto, por pessoa — ou a meta).

Se o pedido já estiver claro, responda com "precisaEsclarecer": false e "perguntas": [].
Se faltar informação, devolva de 1 a 3 perguntas curtas, objetivas e em português. Cada pergunta PRECISA trazer de 2 a 4 respostas sugeridas, curtas (até 4 palavras cada), para a pessoa escolher com um clique.

Regras:
- Nunca pergunte algo que a pessoa já respondeu no pedido.
- Nunca pergunte mais de três coisas.
- Nunca peça detalhe técnico (nome de sistema, formato de arquivo, origem dos dados): o painel é montado com números de exemplo.
- Seja útil, não burocrático. Se der para adivinhar com segurança, não pergunte.
- Escreva as perguntas na segunda pessoa ("Você quer acompanhar...").

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):
{
  "precisaEsclarecer": true,
  "perguntas": [
    {
      "id": "setor",
      "pergunta": "Qual área você quer acompanhar?",
      "sugestoes": ["Vendas", "Financeiro", "Marketing", "Operações"]
    },
    {
      "id": "periodo",
      "pergunta": "Qual período interessa mais?",
      "sugestoes": ["Últimos 6 meses", "Mês atual", "Ano corrente"]
    }
  ]
}

Responda SOMENTE com o JSON. Nada antes, nada depois.`;

const SEM_PERGUNTAS: RespostaEsclarecimento = { precisaEsclarecer: false, perguntas: [] };

/** Saneia a resposta da IA: 1 a 3 perguntas, cada uma com 2 a 4 sugestões curtas. */
function sanear(bruto: unknown): RespostaEsclarecimento {
  if (!bruto || typeof bruto !== "object") return SEM_PERGUNTAS;
  const r = bruto as { precisaEsclarecer?: unknown; perguntas?: unknown };
  if (!Array.isArray(r.perguntas)) return SEM_PERGUNTAS;
  const perguntas: PerguntaEsclarecimento[] = [];
  for (const p of r.perguntas) {
    if (!p || typeof p !== "object") continue;
    const { id, pergunta, sugestoes } = p as { id?: unknown; pergunta?: unknown; sugestoes?: unknown };
    if (typeof pergunta !== "string" || !pergunta.trim()) continue;
    const lista = Array.isArray(sugestoes) ? sugestoes.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 40)).slice(0, 4) : [];
    if (lista.length < 2) continue;
    perguntas.push({ id: typeof id === "string" && id ? id : `p${perguntas.length + 1}`, pergunta: pergunta.trim().slice(0, 140), sugestoes: lista });
    if (perguntas.length === 3) break;
  }
  return perguntas.length > 0 && r.precisaEsclarecer !== false ? { precisaEsclarecer: true, perguntas } : SEM_PERGUNTAS;
}

/**
 * Avalia o pedido. `origem` diz quem decidiu: "local" (heurística, sem IA), "ia" ou "demo".
 * Falha da IA nunca bloqueia: cai em "não precisa esclarecer" e a geração segue.
 */
export async function esclarecer(descricao: string): Promise<RespostaEsclarecimento & { origem: "local" | "ia" | "demo" }> {
  if (!precisaEsclarecerLocal(descricao)) return { ...SEM_PERGUNTAS, origem: "local" };
  if (!aiEnabled()) return { ...esclarecimentoDemo(), origem: "demo" };
  try {
    const bruto = await askJSON<unknown>({ system: SYSTEM_ESCLARECER, prompt: `Avalie este pedido de painel:\n\n"${descricao}"`, maxTokens: 600 });
    return { ...sanear(bruto), origem: "ia" };
  } catch (err) {
    console.error("[esclarecer] a IA falhou; a geração segue sem perguntas.", err);
    return { ...SEM_PERGUNTAS, origem: "ia" };
  }
}
