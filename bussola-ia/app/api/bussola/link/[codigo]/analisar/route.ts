// "Analisar respostas" numa avaliação em andamento: calcula o diagnóstico a partir das respostas já
// recebidas por este link e salva no histórico. Sem respostas responde 400 com codigo "vazio" ANTES de
// chamar a IA (a tela mostra um aviso inline e mantém o resultado atual); falhas da IA por crédito/fila/
// instabilidade caem na leitura automática dentro de analisarAvaliacao, então chegam aqui só as que a
// pessoa precisa resolver (chave recusada), traduzidas por respostaErro.
import { respostaErro } from "@/lib/ai";
import { analisarAvaliacao, contextoDoLink } from "@/lib/bussola";

export async function POST(_req: Request, { params }: RouteContext<"/api/bussola/link/[codigo]/analisar">) {
  const { codigo } = await params;
  try {
    const contexto = contextoDoLink(codigo);
    if (contexto === null) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 });
    if (contexto.respostas.length === 0) return Response.json({ error: "Ainda não há respostas para analisar. Compartilhe o link e volte quando chegarem.", codigo: "vazio" }, { status: 400 });
    return Response.json(await analisarAvaliacao(contexto));
  } catch (err) {
    return respostaErro(err);
  }
}
