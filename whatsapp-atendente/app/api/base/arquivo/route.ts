// Importa a base de conhecimento de um arquivo (.txt ou .pdf) em vez de colar o texto à mão — é como
// a informação já existe na maioria das empresas (um manual, uma tabela de preços, um documento de
// perguntas frequentes). Devolve só o texto extraído: quem decide o que fica é a pessoa, no campo do
// formulário, antes de salvar.
import { extractText } from "unpdf";
import { responderErro } from "@/app/api/erros";

export const dynamic = "force-dynamic";

const LIMITE_BYTES = 10 * 1024 * 1024; // 10 MB
const LIMITE_CARACTERES = 20000;

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

    // O corte é dito na tela (`cortado`), nunca silencioso: a pessoa precisa saber que sobrou texto fora.
    const cortado = texto.length > LIMITE_CARACTERES;
    return Response.json({ texto: cortado ? texto.slice(0, LIMITE_CARACTERES) : texto, cortado, caracteres: texto.length });
  } catch (err) {
    return responderErro(err, "Não foi possível ler esse arquivo. Confira se ele abre normalmente e tente de novo.");
  }
}
