// "Enviar a análise ao vendedor": manda a nota e os pontos a melhorar para o e-mail cadastrado do
// vendedor daquela conversa (lib/envio-analise.ts), pelo mesmo canal das rotinas.
import { enviarAnaliseAoVendedor, ErroEnvioAnalise } from "@/lib/envio-analise";
import { registrarEnderecoPublico } from "@/lib/setup-comum";
import { respostaErro } from "@/lib/ai";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const resultadoId = String(corpo?.resultadoId || "").trim();
  if (!resultadoId) return Response.json({ error: "Analise uma conversa antes de enviar a análise." }, { status: 400 });
  registrarEnderecoPublico(req);
  try {
    const resposta = await enviarAnaliseAoVendedor(resultadoId);
    return Response.json(resposta);
  } catch (err) {
    if (err instanceof ErroEnvioAnalise) return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
    return respostaErro(err);
  }
}
