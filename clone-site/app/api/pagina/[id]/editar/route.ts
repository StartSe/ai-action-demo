// Aplica uma instrução de mudança sobre a página salva e grava uma versão nova.
// Corpo: { instrucao } ou { empresa } (o que a empresa faz, para o botão "Trocar os textos pelos da minha empresa"),
// e opcionalmente { html } com o HTML que a tela está mostrando (quando difere da última versão salva).
import { ErroDePedido, PaginaNaoEncontrada, editarPagina, instrucaoTrocarTextos, normalizarInstrucao } from "@/lib/gerador";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: RouteContext<"/api/pagina/[id]/editar">) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as { instrucao?: unknown; empresa?: unknown; html?: unknown } | null;

  try {
    const trocaDeTextos = typeof corpo?.empresa === "string" && corpo.empresa.trim();
    const empresa = trocaDeTextos ? normalizarInstrucao(corpo!.empresa, "Conte em uma frase o que a sua empresa faz.") : "";
    const instrucao = trocaDeTextos ? instrucaoTrocarTextos(empresa) : normalizarInstrucao(corpo?.instrucao);
    const rotulo = trocaDeTextos ? `Textos trocados pelos da empresa: ${empresa}` : undefined;
    const html = typeof corpo?.html === "string" && corpo.html.trim() ? corpo.html : undefined;
    const { pagina, meta, versao, demo } = await editarPagina(id, instrucao, html, rotulo);
    return Response.json({ pagina, meta, versao, demo, id });
  } catch (err) {
    if (err instanceof PaginaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível aplicar a mudança agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
