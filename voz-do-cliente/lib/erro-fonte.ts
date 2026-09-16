// Erro de uma fonte externa de comentários (CRM via MCP, planilha via MCP): sempre com uma frase pronta
// para a tela e, quando faz sentido, a ação que resolve (abrir o cartão certo em Configurações).
// 400 = pré-condição da pessoa (nada conectado, ferramenta errada); 502 = o serviço remoto falhou.
import { respostaErro } from "./ai";

export type AcaoErro = { rotulo: string; url: string };

export class ErroFonte extends Error {
  status: 400 | 502;
  acao?: AcaoErro;

  constructor(status: 400 | 502, mensagem: string, acao?: AcaoErro) {
    super(mensagem);
    this.name = "ErroFonte";
    this.status = status;
    this.acao = acao;
  }

  /** Falha na conversa com o serviço remoto: lib/mcp-cliente.ts já lança frases curadas (nunca HTTP cru), só embrulhamos com a ação. */
  static deServico(err: unknown, acao: AcaoErro): ErroFonte {
    console.error(err);
    const mensagem = err instanceof Error && err.message ? err.message : "O serviço conectado não respondeu. Tente de novo em um minuto.";
    return new ErroFonte(502, mensagem, acao);
  }
}

/** Nas rotas que misturam fonte externa e IA: ErroFonte vira 400/502 com ação; o resto (ErroIA etc.) segue para respostaErro. */
export function respostaErroFonte(err: unknown): Response {
  if (err instanceof ErroFonte) {
    return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
  }
  return respostaErro(err);
}

/** 400 de "não há nada para analisar" (nenhuma resposta, nenhum ticket, planilha vazia): a tela mostra como aviso inline e mantém o resultado atual. */
export function respostaVazia(mensagem: string): Response {
  return Response.json({ error: mensagem, codigo: "vazio" }, { status: 400 });
}
