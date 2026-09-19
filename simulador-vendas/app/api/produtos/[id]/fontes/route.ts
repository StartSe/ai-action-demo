// Materiais de um produto: importar a página (US-004), enviar um documento e colar texto (US-005).
//
// Três entradas, um destino: tudo vira **texto normalizado** em `fontes_produto`. Nenhum arquivo é
// guardado em disco — o app não tem storage e não precisa de um, porque o que a IA usa é o texto.
//
// Regra de erro desta rota: o gestor **nunca** vê o motivo técnico. Cada falha vira uma frase que diz
// o que fazer, e o caminho de saída é sempre o mesmo — colar o texto à mão funciona igual. O código
// técnico vai para o `console.error`, como no resto do app.
import { FalhaExtracao, extrairPagina, type ErroExtracao } from "@/lib/extrair-pagina";
import { EXTENSOES_MATERIAL, textoDoArquivo } from "@/lib/legendas";
import { adicionarFonte, atualizar, listarFontes, obter } from "@/lib/produtos";

const MAX_MATERIAIS = 10;
const MAX_BYTES_ARQUIVO = 2 * 1024 * 1024;
const MAX_TEXTO = 20_000;
/** Mesmo corte do texto de uma página (lib/extrair-pagina.ts): o que vai para o prompt tem teto. */
const MAX_CONTEUDO = 40_000;

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

  const ehArquivo = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  const resposta = ehArquivo ? await receberArquivo(req, id) : await receberJson(req, id);

  // Material novo muda o que a IA sabe: a ficha gerada antes não vale mais (US-006).
  if (resposta.ok && produto.status === "pronto") atualizar(id, { status: "rascunho" });
  return resposta.resposta;
}

type Recebido = { ok: boolean; resposta: Response };

async function receberArquivo(req: Request, produtoId: string): Promise<Recebido> {
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { ok: false, resposta: Response.json({ error: "Escolha um arquivo para enviar." }, { status: 400 }) };
  }

  const nome = arquivo.name || "material";
  const extensao = nome.toLowerCase().slice(nome.lastIndexOf("."));
  if (!EXTENSOES_MATERIAL.includes(extensao as (typeof EXTENSOES_MATERIAL)[number])) {
    return {
      ok: false,
      resposta: Response.json(
        { error: "Aceitamos .txt, .md, .vtt e .srt. Para uma apresentação ou PDF, copie o conteúdo e cole em “Texto”." },
        { status: 400 },
      ),
    };
  }
  if (arquivo.size > MAX_BYTES_ARQUIVO) {
    return { ok: false, resposta: Response.json({ error: "Esse arquivo é grande demais. Envie até 2 MB." }, { status: 400 }) };
  }

  const texto = textoDoArquivo(nome, await arquivo.text()).slice(0, MAX_CONTEUDO);
  if (!texto.trim()) {
    return { ok: false, resposta: Response.json({ error: "Esse arquivo está vazio. Envie outro ou cole o conteúdo em “Texto”." }, { status: 400 }) };
  }

  const fonte = adicionarFonte({ produtoId, tipo: "documento", origem: nome, conteudo: texto });
  return { ok: true, resposta: Response.json({ fonte }) };
}

async function receberJson(req: Request, produtoId: string): Promise<Recebido> {
  const corpo = await req.json().catch(() => ({}));

  if (corpo?.tipo === "texto") {
    const texto = String(corpo?.texto || "").trim();
    if (!texto) {
      return { ok: false, resposta: Response.json({ error: "Escreva alguma coisa sobre o produto antes de salvar." }, { status: 400 }) };
    }
    const titulo = String(corpo?.titulo || "").trim() || "Texto colado";
    const fonte = adicionarFonte({ produtoId, tipo: "texto", origem: titulo, conteudo: texto.slice(0, MAX_TEXTO) });
    return { ok: true, resposta: Response.json({ fonte }) };
  }

  if (corpo?.tipo !== "landing") {
    return { ok: false, resposta: Response.json({ error: "Escolha o que quer adicionar a este produto." }, { status: 400 }) };
  }

  const url = String(corpo?.url || "").trim();
  if (!url) return { ok: false, resposta: Response.json({ error: "Cole o endereço da página do produto." }, { status: 400 }) };

  try {
    const pagina = await extrairPagina(url);
    const fonte = adicionarFonte({ produtoId, tipo: "landing", origem: pagina.url, conteudo: pagina.texto });
    return { ok: true, resposta: Response.json({ fonte, titulo: pagina.titulo }) };
  } catch (err) {
    if (err instanceof FalhaExtracao) {
      console.error("Falha ao importar a página do produto:", err.codigo, err.message);
      return { ok: false, resposta: Response.json({ error: FRASES[err.codigo] }, { status: 400 }) };
    }
    console.error("Falha inesperada ao importar a página do produto:", err);
    return { ok: false, resposta: Response.json({ error: FRASES.sem_resposta }, { status: 400 }) };
  }
}
