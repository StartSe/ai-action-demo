import { responderErro } from "@/app/api/erros";
import { aiEnabled } from "@/lib/ai";
import { interpretarBusca } from "@/lib/interpretacao";
import { obterICP, obterProduto } from "@/lib/workspace";

/** Interpreta a frase livre "O que você quer encontrar?" (US-038, components/BuscaLivre.tsx) usando o
 * produto e o ICP já escolhidos. Só é chamada com a IA conectada — a tela nunca manda o texto livre
 * sem IA (os quatro exemplos, esses sim, funcionam sem IA, por um mapeamento fixo no próprio cliente). */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  if (!texto) return Response.json({ error: "Digite o que você quer encontrar." }, { status: 400 });

  const produtoId = typeof corpo?.produtoId === "string" ? corpo.produtoId : "";
  const produto = produtoId ? obterProduto(produtoId) : null;
  if (!produto) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  const icpId = typeof corpo?.icpId === "string" ? corpo.icpId : "";
  const icp = icpId ? obterICP(icpId) : null;
  if (!icp) return Response.json({ error: "Perfil ideal de cliente não encontrado." }, { status: 404 });

  if (!aiEnabled()) {
    return Response.json({ error: "Para interpretar sua frase, é preciso conectar a IA.", codigo: "chave_ausente", acao: { rotulo: "Conectar a IA", url: "/setup#openrouter" } }, { status: 400 });
  }

  try {
    const resultado = await interpretarBusca(texto, produto, icp);
    return Response.json(resultado);
  } catch (err) {
    return responderErro(err, "Não foi possível interpretar sua frase agora. Tente de novo em um minuto.");
  }
}
