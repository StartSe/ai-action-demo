// A ficha do produto (US-006): gerar com a IA (POST) e salvar o que o gestor corrigiu (PUT).
//
// Salvar é o que marca o produto como "pronto": a ficha só vale depois que uma pessoa olhou. Gerar
// sozinho não basta — o PRD é explícito em que a verdade da empresa vem do gestor, não do modelo.
import { respostaErro } from "@/lib/ai";
import { gerarConhecimento, normalizarConhecimento } from "@/lib/conhecimento";
import { atualizar, listarFontes, obter } from "@/lib/produtos";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produto = obter(id);
  if (!produto) return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });

  const fontes = listarFontes(id);
  if (!fontes.length && !produto.exemplo) {
    return Response.json(
      { error: "Adicione pelo menos um material antes de gerar a ficha: sem material, a IA não tem o que aprender." },
      { status: 400 },
    );
  }

  try {
    const { conhecimento, meta } = await gerarConhecimento(fontes);
    // Gerar não marca "pronto": a ficha ainda não passou por olho humano. Quem marca é o PUT.
    return Response.json({ conhecimento, meta });
  } catch (err) {
    return respostaErro(err);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  // Os mesmos tetos da geração valem para o que vem da tela: um campo editado à mão também entra em
  // todo turno de conversa, e o prompt não pode crescer porque alguém colou três páginas num campo.
  const conhecimento = normalizarConhecimento(corpo?.conhecimento);
  if (!conhecimento.resumo) {
    return Response.json({ error: "Escreva pelo menos o resumo do produto antes de salvar." }, { status: 400 });
  }

  const produto = atualizar(id, { conhecimento, status: "pronto" });
  return Response.json({ produto });
}
