// Lógica de validação da ideia de negócio, compartilhada entre a rota HTTP (app/api/validador/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { BLOCOS, rotuloDoBloco } from "./canvas";
import { esperar, validacaoDemo } from "./demo";
import { salvar } from "./historico";
import type { BlocoCanvas, CanvasNegocio, DadosValidador, Inconsistencia, ResultadoValidacao } from "./types";

// Reexportados para quem já importava os blocos por aqui (a fonte real é lib/canvas.ts, sem node:*,
// para poder ser importada por Client Components como app/page.tsx).
export { BLOCOS, rotuloDoBloco };

const CHAVES_VALIDAS = new Set<string>(BLOCOS.map((b) => b.chave));

export const SYSTEM_VALIDADOR = `Você é um consultor de modelagem de negócios que ajuda empreendedores brasileiros a organizar e testar a lógica de uma ideia antes de investir tempo ou dinheiro nela.

Sua tarefa: distribuir a descrição livre de uma ideia de negócio nos nove blocos do Quadro de Modelo de Negócios (Business Model Canvas) e apontar onde a lógica não fecha entre eles.

Regras (siga rigorosamente):
- Escreva em português do Brasil, direto, sem jargão técnico.
- Um bloco só recebe texto quando a descrição traz informação suficiente para preenchê-lo, mesmo que de forma indireta. Se a descrição não disser nada sobre um bloco, devolva null para ele. NUNCA invente, deduza de forma especulativa ou suponha conteúdo que a pessoa não escreveu — um bloco vazio é a resposta certa quando falta informação, não um defeito a corrigir.
- Depois de montar os blocos, liste as inconsistências reais entre pares de blocos preenchidos: onde um bloco contradiz outro ou não se sustenta junto dele (ex.: canal de aquisição caro demais para o ticket médio declarado, proposta de valor incompatível com o segmento descrito, estrutura de custo que o preço declarado não cobre). Cada inconsistência precisa citar os dois blocos em conflito e explicar por que eles não fecham juntos.
- Só aponte uma inconsistência entre dois blocos que estejam de fato preenchidos (nunca compare um bloco vazio) e apenas quando o conflito for concreto, nunca hipotético ou forçado.
- Se não houver informação suficiente para nenhuma inconsistência real, devolva uma lista vazia. Não invente problemas só para preencher espaço.

Formato de saída (JSON):
{
  "canvas": {
    "segmentoClientes": "texto ou null",
    "propostaValor": "texto ou null",
    "canais": "texto ou null",
    "relacionamentoClientes": "texto ou null",
    "fontesReceita": "texto ou null",
    "recursosChave": "texto ou null",
    "atividadesChave": "texto ou null",
    "parceriasChave": "texto ou null",
    "estruturaCustos": "texto ou null"
  },
  "inconsistencias": [{"blocoA": "<uma das nove chaves acima>", "blocoB": "<outra das nove chaves>", "descricao": "explique o conflito citando os dois blocos"}]
}`;

function normalizarTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Nunca confia cegamente na resposta do modelo: qualquer valor que não seja uma string não vazia
 * vira `null` (bloco vazio), mesmo que o modelo tenha devolvido algo diferente de null por engano. */
function normalizarCanvas(bruto: unknown): CanvasNegocio {
  const obj = (bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {}) as Record<string, unknown>;
  const canvas = {} as CanvasNegocio;
  for (const { chave } of BLOCOS) canvas[chave] = normalizarTexto(obj[chave]);
  return canvas;
}

/** Descarta qualquer inconsistência malformada ou que cite um bloco que o próprio canvas deixou vazio
 * — reforço programático da regra do prompt, para o caso de o modelo não seguir a instrução à risca. */
function normalizarInconsistencias(bruto: unknown, canvas: CanvasNegocio): Inconsistencia[] {
  if (!Array.isArray(bruto)) return [];
  const validas: Inconsistencia[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const registro = item as Record<string, unknown>;
    const blocoA = typeof registro.blocoA === "string" ? registro.blocoA : "";
    const blocoB = typeof registro.blocoB === "string" ? registro.blocoB : "";
    const descricao = normalizarTexto(registro.descricao);
    if (!CHAVES_VALIDAS.has(blocoA) || !CHAVES_VALIDAS.has(blocoB) || blocoA === blocoB || !descricao) continue;
    if (!canvas[blocoA as BlocoCanvas] || !canvas[blocoB as BlocoCanvas]) continue;
    validas.push({ blocoA: blocoA as BlocoCanvas, blocoB: blocoB as BlocoCanvas, descricao });
  }
  return validas;
}

function resumoDoResultado(r: ResultadoValidacao): string {
  const preenchidos = BLOCOS.filter((b) => r.canvas[b.chave]).length;
  const inconsistencias = r.inconsistencias.length;
  return `${preenchidos} de 9 blocos preenchidos, ${inconsistencias} ${inconsistencias === 1 ? "inconsistência encontrada" : "inconsistências encontradas"}.`;
}

export async function validarIdeia(dados: DadosValidador): Promise<{ demo: boolean; resultado: ResultadoValidacao; meta: Meta; id?: string }> {
  const insumo = "descrição da ideia de negócio";
  if (!aiEnabled()) {
    await esperar(1200);
    const resultado = validacaoDemo();
    const metaGerada = meta({ demo: true, insumo });
    const id = salvar({ tipo: "validador", titulo: "Validação de ideia de negócio", resumo: resumoDoResultado(resultado), entrada: dados, saida: resultado, meta: metaGerada });
    return { demo: true, resultado, meta: metaGerada, id };
  }
  const prompt = `Descrição da ideia de negócio, em texto livre, escrita pela própria pessoa:\n\n${dados.descricao}`;
  const bruto = await askJSON<{ canvas?: unknown; inconsistencias?: unknown }>({ system: SYSTEM_VALIDADOR, prompt });
  const canvas = normalizarCanvas(bruto?.canvas);
  const inconsistencias = normalizarInconsistencias(bruto?.inconsistencias, canvas);
  const resultado: ResultadoValidacao = { canvas, inconsistencias };
  const metaGerada = meta({ demo: false, insumo });
  const id = salvar({ tipo: "validador", titulo: "Validação de ideia de negócio", resumo: resumoDoResultado(resultado), entrada: dados, saida: resultado, meta: metaGerada });
  return { demo: false, resultado, meta: metaGerada, id };
}
