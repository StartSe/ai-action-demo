// Uma resposta de erro só, para todas as rotas próprias deste app.
//
// Regra da suíte: nenhuma mensagem na tela mostra código de resposta cru, corpo do serviço remoto ou
// "fetch failed" (o detalhe técnico vai só para console.error), e todo erro diz o que fazer e para
// onde ir. `respostaErro` (lib/ai.ts, compartilhado) já faz isso para as falhas da IA; aqui ele ganha
// o caso da fonte de dados: ErroFonte (lib/fonte-dados-mcp.ts), sempre com a ação para o cartão
// "Fonte de dados" de Configurações.
import { respostaErro } from "@/lib/ai";
import { ErroFonte } from "@/lib/fonte-dados-mcp";

export function responderErro(err: unknown, mensagemGenerica: string): Response {
  if (err instanceof ErroFonte) {
    return Response.json({ error: err.message, codigo: err.codigo, acao: err.acao }, { status: err.status });
  }
  const resposta = respostaErro(err);
  // respostaErro devolve 500 com err.message para o que não é ErroIA; nesta camada a frase do app é
  // melhor do que a de uma exceção qualquer, então o 500 genérico é reescrito aqui.
  if (resposta.status === 500) {
    console.error(err);
    return Response.json({ error: mensagemGenerica }, { status: 500 });
  }
  return resposta;
}
