// Gera a página a partir da captura (POST), lista as últimas páginas salvas (GET) e apaga o histórico (DELETE).
// A lógica de geração vive em lib/gerador.ts, compartilhada com a ferramenta MCP (lib/ferramentas.ts).
import { gerarPagina, normalizarMarca, normalizarStack, validarImagem } from "@/lib/gerador";
import { apagarTodos, listar } from "@/lib/historico";
import type { Pedido } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as Partial<Record<keyof Pedido, unknown>> | null;
  const imagem = validarImagem(corpo?.imagem);
  if (!imagem.ok) return Response.json({ error: imagem.erro }, { status: 400 });

  const marca = normalizarMarca(corpo?.marca);
  if (marca.erro) return Response.json({ error: marca.erro }, { status: 400 });

  const pedido: Pedido = { imagem: corpo!.imagem as string, stack: normalizarStack(corpo?.stack) };
  if (typeof corpo?.instrucoes === "string" && corpo.instrucoes.trim()) pedido.instrucoes = corpo.instrucoes.trim().slice(0, 4000);
  if (marca.marca) pedido.marca = marca.marca;

  try {
    const { pagina, meta, id, demo } = await gerarPagina(pedido);
    return Response.json({ pagina, meta, id, demo });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a página agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** Últimas páginas salvas, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(20).filter((r) => r.tipo === "pagina").slice(0, 10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
