// Resposta comum das quatro rotas de uma conversa aberta (`assumir`, `devolver`, `resolver` e
// `mensagens`): todas devolvem a MESMA coisa — a conversa inteira já atualizada, com as mensagens —,
// então a tela nunca precisa de uma segunda consulta depois de uma ação, e nunca fica com um pedaço
// do estado antigo na mão.
import { obterConversa } from "@/lib/conversas";

export type ParametroNumero = { params: Promise<{ numero: string }> };

/** A frase de quem clica numa conversa que outra aba já apagou: nada de "404" na tela. */
export const CONVERSA_SUMIU = "Essa conversa não está mais aqui. Volte para a lista e escolha outra.";

/** A conversa inteira, ou 404 com frase de negócio quando o número não existe mais. */
export function responderConversa(numero: string): Response {
  const conversa = obterConversa(numero);
  if (!conversa) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });
  return Response.json({ conversa });
}
