// Uma resposta de erro só, para todas as rotas próprias deste app.
// Regra da suíte: nenhuma mensagem na tela mostra código de resposta cru, corpo do serviço remoto ou
// "fetch failed" (o detalhe técnico vai só para console.error). `respostaErro` (lib/ai.ts, compartilhado)
// já faz isso para as falhas da IA; aqui ele ganha o caso de entrada inválida (ErroDeEntrada, lib/perdas.ts).
import { respostaErro } from "@/lib/ai";
import { ErroDeEntrada } from "@/lib/perdas";

export function responderErro(err: unknown, mensagemGenerica: string): Response {
  if (err instanceof ErroDeEntrada) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  const resposta = respostaErro(err);
  if (resposta.status === 500) {
    console.error(err);
    return Response.json({ error: mensagemGenerica }, { status: 500 });
  }
  return resposta;
}
