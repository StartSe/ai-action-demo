// "Criar link de avaliação": guarda o questionário atual do editor (mesmo título atualiza, salvo se em uso) e
// cria o formulário público (lib/link-avaliacao.ts) a partir dele. GET lista "Avaliações em andamento" no painel
// e informa se o disco é efêmero (Render sem disco), para a tela avisar antes de criar o link.
import { discoEfemero } from "@/lib/conta";
import { criarLinkAvaliacao, guardarQuestionario, listarAvaliacoesEmAndamento } from "@/lib/link-avaliacao";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import type { Questionario } from "@/lib/types";

const PRAZOS_VALIDOS = [7, 30, 90];
const LIMITES_VALIDOS = [10, 50, 200];

export async function POST(req: Request) {
  // O link vai circular fora do app: guarda o endereço público para e-mails e rotinas montarem links absolutos.
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => null);
  const questionario = corpo?.questionario as Questionario | undefined;
  const titulo = typeof corpo?.titulo === "string" ? corpo.titulo.trim() : "";
  const empresa = typeof corpo?.empresa === "string" ? corpo.empresa.trim() : "";
  const expiraEmDias = PRAZOS_VALIDOS.includes(Number(corpo?.expiraEmDias)) ? Number(corpo.expiraEmDias) : 30;
  const limiteBruto = corpo?.limite;
  const limite = limiteBruto === null ? undefined : LIMITES_VALIDOS.includes(Number(limiteBruto)) ? Number(limiteBruto) : 50;

  if (!empresa) return Response.json({ error: "Informe o nome da empresa." }, { status: 400 });
  if (!titulo) return Response.json({ error: "Informe o título da avaliação." }, { status: 400 });
  if (!questionario || !Array.isArray(questionario.perguntas) || questionario.perguntas.length === 0) {
    return Response.json({ error: "O questionário precisa de ao menos uma pergunta." }, { status: 400 });
  }
  if (questionario.perguntas.some((p) => !String(p.texto ?? "").trim())) {
    return Response.json({ error: "Há uma pergunta sem texto no questionário. Preencha ou remova antes de criar o link." }, { status: 400 });
  }

  try {
    const { id: questionarioId } = guardarQuestionario({ titulo: questionario.titulo?.trim() || titulo, questionario });
    const codigo = criarLinkAvaliacao({ questionarioId, titulo, empresa, expiraEmDias, limite });
    return Response.json({ codigo, url: `${baseUrl(req)}/f/${codigo}` });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Não foi possível criar o link de avaliação agora. Tente de novo." }, { status: 500 });
  }
}

/** "Avaliações em andamento" no painel. */
export async function GET() {
  return Response.json({ itens: listarAvaliacoesEmAndamento(), discoEfemero: discoEfemero() });
}
