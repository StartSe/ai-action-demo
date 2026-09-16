// Uma resposta de erro só, para todas as rotas próprias deste app.
//
// Regra da suíte: nenhuma mensagem na tela mostra código HTTP cru, corpo do provedor ou "fetch failed"
// (o detalhe técnico vai só para console.error), e todo erro diz o que fazer e para onde ir.
// `respostaErro` (lib/ai.ts, compartilhado) já faz isso para as falhas da IA; aqui ele ganha o caso de
// antes da IA: ErroApollo (lib/leads.ts), a busca de leads recusando a chave, estourando o plano ou não
// respondendo — sempre com a ação para o cartão "Busca de leads" de /setup.
import { respostaErro } from "@/lib/ai";
import { ErroApollo } from "@/lib/leads";

export function responderErro(err: unknown, mensagemGenerica: string): Response {
  if (err instanceof ErroApollo) {
    return Response.json({ error: err.message, codigo: err.codigo, acao: err.acao }, { status: err.status });
  }
  const resposta = respostaErro(err);
  // respostaErro devolve 500 com err.message para o que não é ErroIA; nesta camada a frase do app é
  // melhor do que a de uma exceção qualquer, então o 500 genérico é reescrito aqui.
  if (resposta.status === 500) return Response.json({ error: mensagemGenerica }, { status: 500 });
  return resposta;
}
