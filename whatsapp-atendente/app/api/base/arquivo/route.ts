import { indexarDocumento, listarDocumentos, excluirDocumento, ErroDocumento } from "@/lib/documentos";
import { extractText } from "unpdf";
import { responderErro } from "@/app/api/erros";

export const dynamic = "force-dynamic";

const LIMITE_BYTES = 10 * 1024 * 1024; // 10 MB
export async function GET() {
  return Response.json({ documentos: listarDocumentos() });
}
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !excluirDocumento(id)) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Escolha um arquivo de texto (.txt) ou um PDF." }, { status: 400 });
  }

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return Response.json({ error: "Escolha um arquivo de texto (.txt) ou um PDF." }, { status: 400 });
  }
  if (arquivo.size > LIMITE_BYTES) {
    return Response.json({ error: "O arquivo passa de 10 MB. Envie um documento menor ou cole só a parte que o atendente precisa saber." }, { status: 400 });
  }

  const nome = arquivo.name.toLowerCase();
  try {
    let texto: string;
    if (nome.endsWith(".pdf")) {
      const { text } = await extractText(new Uint8Array(await arquivo.arrayBuffer()), { mergePages: true });
      texto = String(text).trim();
      if (!texto) {
        return Response.json(
          { error: "Esse PDF não tem texto para copiar (provavelmente é a imagem de um documento escaneado). Cole o conteúdo à mão ou envie um arquivo de texto." },
          { status: 400 }
        );
      }
    } else if (nome.endsWith(".txt") || nome.endsWith(".md") || arquivo.type.startsWith("text/")) {
      texto = (await arquivo.text()).trim();
      if (!texto) return Response.json({ error: "O arquivo enviado está vazio." }, { status: 400 });
    } else {
      return Response.json({ error: "Este app lê arquivos de texto (.txt) e PDF. Converta o documento para um desses formatos e envie de novo." }, { status: 400 });
    }

    if (texto.length > 200_000) return Response.json({ error: "O documento passa de 200 mil caracteres. Divida em arquivos menores; nenhum conteúdo foi importado." }, { status: 400 });
    const documento = await indexarDocumento(arquivo.name, texto);
    return Response.json({ documento });
  } catch (err) {
    if (err instanceof ErroDocumento) return Response.json({ error: err.message }, { status: 400 });
    return responderErro(err, "Não foi possível ler esse arquivo. Confira se ele abre normalmente e tente de novo.");
  }
}
