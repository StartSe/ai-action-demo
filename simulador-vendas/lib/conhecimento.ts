// A ficha do produto: o que a IA entendeu do material que o gestor subiu (US-006).
//
// **É a única coisa que o cliente simulado e o avaliador recebem sobre o produto** (D12 do PRD: sem
// RAG no MVP). As fontes brutas nunca entram em prompt de simulação — elas existem só para gerar esta
// ficha de novo. Por isso a ficha tem tamanho fechado: ela vai inteira, em todo turno de conversa, e
// um campo sem teto viraria um prompt sem teto.
//
// Server-only: importa lib/ai.ts.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar } from "./demo";
import type { ConhecimentoProduto, FonteProduto } from "./produtos";

/** Teto de cada campo. Aplicado **no código**, depois da resposta — pedir no prompt não é garantia. */
const LIMITE_RESUMO = 600;
const LIMITE_ITEM = 120;
const MIN_ITENS = 3;
const MAX_ITENS = 6;
/** Corte do material que vai no prompt, somando todas as fontes (as mais recentes primeiro). */
const LIMITE_FONTES = 40_000;

export const SYSTEM_CONHECIMENTO = `Você lê o material comercial de uma empresa e resume o que ela vende, para treinar vendedores.
Regras:
- Escreva em português do Brasil, curto e concreto, com as palavras do próprio material.
- **Nunca invente.** Só escreva o que está no material. O que não estiver lá volta como lista vazia ou texto vazio — uma lista vazia é uma resposta correta, um palpite não é.
- Nada de linguagem de propaganda ("solução inovadora", "líder de mercado") a não ser que o material use essas palavras.
- "objecoes" são as dúvidas e resistências que um cliente real levantaria sobre ESTE produto (preço, troca de fornecedor, esforço de implantação), deduzidas do material — não objeções genéricas de venda.
- "precoFaixa" só existe se o material falar de preço. Se não falar, deixe vazio.
Formato de saída (JSON, sem nenhum texto fora dele):
{
  "resumo": "2 a 4 frases sobre o que é o produto e que problema resolve",
  "publico": "quem compra este produto, em uma frase",
  "beneficios": ["3 a 6 ganhos concretos para quem compra"],
  "diferenciais": ["3 a 6 coisas que separam este produto dos concorrentes"],
  "objecoes": ["3 a 6 objeções que um cliente levantaria"],
  "precoFaixa": "faixa de preço, se o material disser; senão vazio",
  "concorrentes": ["concorrentes citados no material; lista vazia se não citar nenhum"]
}`;

function texto(valor: unknown, limite: number): string {
  if (typeof valor !== "string") return "";
  const limpo = valor.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

/**
 * Normaliza uma lista vinda da IA: descarta o que não é texto, corta item por item, tira repetidos e
 * limita a quantidade. **Não completa** para chegar ao mínimo: inventar item para bater uma contagem é
 * exatamente o que o prompt proíbe. O mínimo serve para a tela avisar que a ficha ficou magra.
 */
function lista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const itens = valor.map((i) => texto(i, LIMITE_ITEM)).filter(Boolean);
  return [...new Set(itens)].slice(0, MAX_ITENS);
}

/** Aplica todos os tetos no código, nunca confiando no que o prompt pediu. */
export function normalizarConhecimento(bruto: unknown): ConhecimentoProduto {
  const d = (bruto ?? {}) as Record<string, unknown>;
  return {
    resumo: texto(d.resumo, LIMITE_RESUMO),
    publico: texto(d.publico, LIMITE_ITEM * 2),
    beneficios: lista(d.beneficios),
    diferenciais: lista(d.diferenciais),
    objecoes: lista(d.objecoes),
    precoFaixa: texto(d.precoFaixa, LIMITE_ITEM) || undefined,
    concorrentes: lista(d.concorrentes),
  };
}

/** Uma ficha com listas curtas demais para treinar alguém: a tela avisa e oferece mais material. */
export function fichaMagra(c: ConhecimentoProduto): boolean {
  return !c.resumo || c.beneficios.length < MIN_ITENS || c.objecoes.length < MIN_ITENS;
}

/** Junta as fontes para o prompt, das mais recentes para as mais antigas, com corte no total. */
export function materialParaPrompt(fontes: FonteProduto[]): string {
  const ordenadas = [...fontes].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const partes: string[] = [];
  let total = 0;
  for (const f of ordenadas) {
    const cabecalho = `--- ${f.origem} ---\n`;
    const espaco = LIMITE_FONTES - total - cabecalho.length;
    if (espaco <= 0) break;
    const corpo = f.conteudo.slice(0, espaco);
    partes.push(cabecalho + corpo);
    total += cabecalho.length + corpo.length;
  }
  return partes.join("\n\n");
}

/** A ficha do produto de demonstração: o que a tela mostra quando não há IA conectada (P2 do PRD). */
export function conhecimentoDemo(): ConhecimentoProduto {
  return {
    resumo:
      "Plataforma de gestão que reúne ordens de produção, estoque e compras em um lugar só. Substitui o controle por planilhas em empresas de médio porte, reduzindo retrabalho e erro de digitação entre as áreas.",
    publico: "Diretores industriais e gerentes de operações de indústrias de 50 a 500 funcionários.",
    beneficios: [
      "Reduz o retrabalho de produção em cerca de 30%",
      "Acaba com a redigitação entre produção, estoque e compras",
      "Mostra o custo real de cada ordem no fechamento do mês",
      "Implantação em 30 dias, sem parar a fábrica",
    ],
    diferenciais: [
      "Implantação acompanhada por quem conhece chão de fábrica",
      "Integra com o sistema fiscal que a empresa já usa",
      "Preço por planta, não por usuário",
    ],
    objecoes: [
      "Já temos um sistema e trocar dá trabalho demais",
      "Meu time não vai usar, como foi da última vez",
      "O concorrente cobra menos pelo mesmo módulo",
      "Não consigo justificar esse investimento este ano",
    ],
    precoFaixa: "A partir de R$ 4.500 por mês por planta",
    concorrentes: ["Sistemas de gestão genéricos", "Controle por planilha"],
  };
}

export type ResultadoConhecimento = { conhecimento: ConhecimentoProduto; meta: Meta };

/**
 * Gera a ficha a partir dos materiais do produto. Sem IA conectada devolve a ficha de demonstração,
 * marcada em `meta.demo` — a tela mostra o `SeloIA demo` e o convite a conectar.
 *
 * Lança `ErroIA` quando a IA está conectada e falha; quem chama transforma em `ErrorBox` com
 * `respostaErro` (lib/ai.ts), como no resto do app.
 */
export async function gerarConhecimento(fontes: FonteProduto[]): Promise<ResultadoConhecimento> {
  const insumo = `${fontes.length} material${fontes.length === 1 ? "" : "is"} do produto`;

  if (!aiEnabled()) {
    await esperar();
    return { conhecimento: conhecimentoDemo(), meta: meta({ demo: true, insumo }) };
  }

  const material = materialParaPrompt(fontes);
  const bruto = await askJSON<unknown>({
    system: SYSTEM_CONHECIMENTO,
    prompt: `Material comercial da empresa:\n\n${material}\n\nResuma o produto seguindo exatamente o formato pedido. O que não estiver no material acima não entra na resposta.`,
    maxTokens: 1600,
  });

  return { conhecimento: normalizarConhecimento(bruto), meta: meta({ demo: false, insumo }) };
}
