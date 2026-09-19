// Um produto: ler, editar e apagar (US-003).
//
// Apagar é a única operação com regra de negócio própria: um produto com simulação **ativa** não é
// apagado, porque o link dela já está no grupo do time e apagar o produto deixaria o cliente simulado
// sem saber o que vende. A resposta diz o que fazer, nunca só "não pode".
import { apagar, atualizar, listarFontes, obter } from "@/lib/produtos";
import { contarPorProduto } from "@/lib/simulacoes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produto = obter(id);
  if (!produto) {
    return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });
  }
  return Response.json({ produto, fontes: listarFontes(id), simulacoes: contarPorProduto(id) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) {
    return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });
  }
  const corpo = await req.json().catch(() => ({}));

  if (corpo?.nome !== undefined && !String(corpo.nome).trim()) {
    return Response.json({ error: "O produto precisa de um nome." }, { status: 400 });
  }
  const produto = atualizar(id, {
    ...(corpo?.nome !== undefined ? { nome: String(corpo.nome) } : {}),
    ...(corpo?.descricao !== undefined ? { descricao: String(corpo.descricao) } : {}),
    ...(corpo?.categoria !== undefined ? { categoria: String(corpo.categoria) } : {}),
    ...(corpo?.status === "pronto" || corpo?.status === "rascunho" ? { status: corpo.status } : {}),
    ...(corpo?.conhecimento !== undefined ? { conhecimento: corpo.conhecimento } : {}),
  });
  return Response.json(produto);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produto = obter(id);
  if (!produto) {
    return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });
  }

  const { ativas } = contarPorProduto(id);
  if (ativas > 0) {
    return Response.json(
      {
        error:
          ativas === 1
            ? "Há um treino ativo usando este produto. Encerre o treino em Simulações e apague o produto depois."
            : `Há ${ativas} treinos ativos usando este produto. Encerre-os em Simulações e apague o produto depois.`,
        acao: { rotulo: "Ir para Simulações", url: "/simulacoes" },
      },
      { status: 409 },
    );
  }

  apagar(id);
  return Response.json({ ok: true });
}
