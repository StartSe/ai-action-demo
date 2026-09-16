// Converte no servidor um arquivo de transcrição enviado no painel (.txt, .vtt ou .srt) para o texto
// que vai no campo "A conversa" — assim o painel nunca precisa entender nenhum formato de legenda.
// Não analisa nada: quem analisa continua sendo POST /api/analisar, com o texto já no campo.
import { EXTENSOES_ACEITAS, textoDoArquivo } from "@/lib/legendas";
import { AVISO_SEM_FALAS, parseConversaColada } from "@/lib/conversa";

const TAMANHO_MAXIMO = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) {
    return Response.json({ error: "Escolha um arquivo de transcrição para enviar." }, { status: 400 });
  }
  const nome = arquivo.name || "";
  const extensao = nome.toLowerCase().slice(nome.lastIndexOf("."));
  if (!EXTENSOES_ACEITAS.includes(extensao as (typeof EXTENSOES_ACEITAS)[number])) {
    return Response.json({ error: "Aceitamos arquivos .txt, .vtt e .srt." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return Response.json({ error: "O arquivo é grande demais. Envie até 2 MB." }, { status: 400 });
  }

  const texto = textoDoArquivo(nome, await arquivo.text());
  if (!texto.trim()) {
    return Response.json({ error: "Não encontrei nenhuma fala neste arquivo." }, { status: 400 });
  }
  const falas = parseConversaColada(texto).length;
  return Response.json({ texto, falas, aviso: falas === 0 ? AVISO_SEM_FALAS : undefined });
}
