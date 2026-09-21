// Gera o link de uma pergunta para alguém do time informar o preço do concorrente.
import { criarColeta } from "@/lib/coleta-precos";
import { obterItem } from "@/lib/itens";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: RouteContext<"/api/itens/[id]/coleta">) {
  const { id } = await params;
  const item = obterItem(id);
  if (!item) return Response.json({ error: "Este item não existe mais." }, { status: 404 });

  try {
    registrarEnderecoPublico(req);
    // O campo se chama `codigo` (e não o termo técnico) porque a tela mostra este valor.
    const codigo = criarColeta(item.id, item.nome);
    return Response.json({ codigo, endereco: `${baseUrl(req)}/f/${codigo}` });
  } catch (err) {
    console.error("Falha ao criar o link de coleta", err);
    return Response.json({ error: "Não foi possível criar o link agora. Tente de novo." }, { status: 500 });
  }
}
