// Materiais de um produto: importar a página (US-004) e, na US-005, enviar documentos e colar texto.
//
// Regra de erro desta rota: o gestor **nunca** vê o motivo técnico. Cada falha da extração vira uma
// frase que diz o que fazer, e o caminho de saída é sempre o mesmo — colar o texto principal à mão
// funciona igual. O código técnico vai para o `console.error`, como no resto do app.
import { FalhaExtracao, extrairPagina, type ErroExtracao } from "@/lib/extrair-pagina";
import { adicionarFonte, atualizar, listarFontes, obter } from "@/lib/produtos";

const MAX_MATERIAIS = 10;

const FRASES: Record<ErroExtracao, string> = {
  endereco_invalido: "Esse endereço não parece completo. Use o endereço inteiro, começando com https://.",
  endereco_interno: "Não conseguimos abrir esse endereço. Cole o texto principal em “Texto” que funciona igual.",
  sem_resposta: "Não conseguimos ler essa página. Cole o texto principal em “Texto” que funciona igual.",
  tipo_nao_suportado: "Esse endereço não é uma página de texto. Cole o texto principal em “Texto” que funciona igual.",
  grande_demais: "Essa página é grande demais para ler de uma vez. Cole a parte que importa em “Texto”.",
  conteudo_curto: "Essa página tem pouco texto para a IA aprender. Cole o conteúdo principal em “Texto”.",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });
  return Response.json({ itens: listarFontes(id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produto = obter(id);
  if (!produto) return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });

  if (listarFontes(id).length >= MAX_MATERIAIS) {
    return Response.json(
      { error: `Um produto guarda até ${MAX_MATERIAIS} materiais. Remova um antes de adicionar outro.` },
      { status: 400 },
    );
  }

  const corpo = await req.json().catch(() => ({}));
  if (corpo?.tipo !== "landing") {
    return Response.json({ error: "Escolha o que quer adicionar a este produto." }, { status: 400 });
  }

  const url = String(corpo?.url || "").trim();
  if (!url) return Response.json({ error: "Cole o endereço da página do produto." }, { status: 400 });

  try {
    const pagina = await extrairPagina(url);
    const fonte = adicionarFonte({ produtoId: id, tipo: "landing", origem: pagina.url, conteudo: pagina.texto });
    // Material novo muda o que a IA sabe: a ficha gerada antes não vale mais (US-006).
    if (produto.status === "pronto") atualizar(id, { status: "rascunho" });
    return Response.json({ fonte, titulo: pagina.titulo });
  } catch (err) {
    if (err instanceof FalhaExtracao) {
      console.error("Falha ao importar a página do produto:", err.codigo, err.message);
      return Response.json({ error: FRASES[err.codigo] }, { status: 400 });
    }
    console.error("Falha inesperada ao importar a página do produto:", err);
    return Response.json({ error: FRASES.sem_resposta }, { status: 400 });
  }
}
