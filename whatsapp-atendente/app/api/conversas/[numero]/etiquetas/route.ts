import { CONVERSA_SUMIU, responderConversa, type ParametroNumero } from "../comum";
import { definirEtiquetas, erroDeEtiquetas, obterRegistro } from "@/lib/conversas";
import { normalizarEtiqueta } from "@/lib/etiquetas";

export const dynamic = "force-dynamic";

/**
 * As etiquetas desta conversa, como o bloco "Etiquetas" do painel do contato as deixou. A lista chega
 * inteira (e não "some uma"/"soma outra"): é o estado final que o painel mostra, e assim duas abas
 * abertas na mesma conversa nunca somam a mesma etiqueta duas vezes.
 *
 * Uma etiqueta que ainda não existe na instância nasce aqui, com a cor seguinte da paleta — não há
 * cadastro a preencher antes. Devolve a conversa inteira já atualizada, como as outras rotas da pasta.
 */
export async function PUT(req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  if (!obterRegistro(numero)) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });

  const corpo = (await req.json().catch(() => ({}))) as { etiquetas?: unknown };
  if (!Array.isArray(corpo.etiquetas)) {
    return Response.json({ error: "Informe a lista de etiquetas desta conversa." }, { status: 400 });
  }
  const nomes: string[] = [];
  for (const bruto of corpo.etiquetas) {
    const nome = normalizarEtiqueta(typeof bruto === "string" ? bruto : "");
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  const erro = erroDeEtiquetas(nomes);
  if (erro) return Response.json({ error: erro }, { status: 400 });

  definirEtiquetas(numero, nomes);
  return responderConversa(numero);
}
