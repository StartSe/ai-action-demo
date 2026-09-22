// Resposta comum das quatro rotas de uma conversa aberta (`assumir`, `devolver`, `resolver` e
// `mensagens`): todas devolvem a MESMA coisa — a conversa inteira já atualizada, com as mensagens —,
// então a tela nunca precisa de uma segunda consulta depois de uma ação, e nunca fica com um pedaço
// do estado antigo na mão.
import { responderErro } from "@/app/api/erros";
import { marcarEnviada, marcarFalhaEnvio, obterConversa } from "@/lib/conversas";
import { comContato } from "@/lib/memoria";
import { enviarMensagem, ErroWhatsApp, registrarFalhaEnvio } from "@/lib/whatsapp";

export type ParametroNumero = { params: Promise<{ numero: string }> };

/** A frase de quem clica numa conversa que outra aba já apagou: nada de "404" na tela. */
export const CONVERSA_SUMIU = "Essa conversa não está mais aqui. Volte para a lista e escolha outra.";

/**
 * A conversa inteira, ou 404 com frase de negócio quando o número não existe mais. O que o atendente
 * lembra do cliente (tabela `contatos`, de lib/memoria.ts) é juntado aqui: é a rota que conhece as duas
 * tabelas, e não lib/conversas.ts.
 */
export function responderConversa(numero: string): Response {
  const conversa = obterConversa(numero);
  if (!conversa) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });
  return Response.json({ conversa: comContato(conversa) });
}

/**
 * Manda uma mensagem já gravada pelo número da empresa e grava o resultado nela (lib/conversas.ts):
 * `enviada`, com o id que o provedor deu, ou `falhou`, com a frase de negócio. Devolve `null` quando
 * saiu, ou a resposta de erro já com a conversa atualizada — a tela desenha a bolha que não saiu em vez
 * de engolir o que a pessoa escreveu. Usado por `mensagens` (primeiro envio) e por
 * `mensagens/[id]/reenviar` ("Tentar de novo").
 */
export async function enviarEGravar(numero: string, texto: string, mensagemId: number): Promise<Response | null> {
  try {
    const { idExterno } = await enviarMensagem(numero, texto);
    marcarEnviada(mensagemId, idExterno);
    return null;
  } catch (err) {
    const mensagem = err instanceof ErroWhatsApp ? err.message : "Não foi possível enviar a mensagem pelo número da empresa.";
    registrarFalhaEnvio(mensagem);
    marcarFalhaEnvio(mensagemId, mensagem);
    const recusa = responderErro(err, mensagem);
    const detalhe = (await recusa.json()) as Record<string, unknown>;
    return Response.json({ ...detalhe, conversa: comContato(obterConversa(numero)), mensagemComErro: mensagemId }, { status: recusa.status });
  }
}
