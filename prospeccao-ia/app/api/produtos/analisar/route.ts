import { responderErro } from "@/app/api/erros";
import { sugerirProdutoDoSite } from "@/lib/produto-ia";

/** Sugere produto + ICP a partir do site (ou de um parágrafo colado), para o formulário de edição do
 * "Criar com IA" em /produtos/novo?ia=1 (US-007). Nunca cria o produto: só devolve a sugestão. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const entrada = typeof corpo?.entrada === "string" ? corpo.entrada.trim() : "";
  if (!entrada) {
    return Response.json({ error: "Cole o endereço do site ou escreva um parágrafo sobre o produto." }, { status: 400 });
  }
  try {
    const resultado = await sugerirProdutoDoSite(entrada);
    return Response.json(resultado);
  } catch (err) {
    return responderErro(err, "Não foi possível analisar agora. Tente de novo em um minuto.");
  }
}
