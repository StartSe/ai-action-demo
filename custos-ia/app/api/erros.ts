// Uma resposta de erro só, para todas as rotas próprias deste app.
//
// Regra da suíte: nenhuma mensagem na tela mostra código HTTP cru, corpo do provedor ou "fetch failed"
// (o detalhe técnico vai só para console.error), e todo erro diz o que fazer e para onde ir. `respostaErro`
// (lib/ai.ts, compartilhado) já faz isso para as falhas da IA; aqui ele ganha dois casos de antes da IA:
//
// - ErroImportacao: pré-condição de quem está na tela (nenhuma caixa conectada, IA desligada) — 400 com
//   a ação para o cartão certo de /setup;
// - ErroEmail (ErroGmail/ErroOutlook, lib/email.ts): o provedor de e-mail recusou ou não respondeu — 502
//   com a ação para reconectar a caixa daquele provedor.
import { respostaErro } from "@/lib/ai";
import { ErroEmail, ErroGmail } from "@/lib/email";
import { ErroImportacao } from "@/lib/importacao";

const RECONECTAR_GMAIL = { rotulo: "Reconectar o Gmail", url: "/setup#gmail" };
const RECONECTAR_OUTLOOK = { rotulo: "Reconectar o Outlook", url: "/setup#outlook" };
const CONECTAR_EMAIL = { rotulo: "Conectar o e-mail", url: "/setup#gmail" };
const CONECTAR_IA = { rotulo: "Conectar a IA", url: "/setup#openrouter" };

/** A ação de um ErroImportacao depende do que falta: IA desligada manda para o cartão da IA. */
function acaoDaImportacao(mensagem: string) {
  return /intelig[êe]ncia artificial|chave da IA/i.test(mensagem) ? CONECTAR_IA : CONECTAR_EMAIL;
}

export function responderErro(err: unknown, mensagemGenerica: string): Response {
  if (err instanceof ErroImportacao) {
    return Response.json({ error: err.message, codigo: "pre_requisito", acao: acaoDaImportacao(err.message) }, { status: 400 });
  }
  if (err instanceof ErroEmail) {
    console.error(err);
    const acao = err instanceof ErroGmail ? RECONECTAR_GMAIL : RECONECTAR_OUTLOOK;
    return Response.json({ error: err.message, codigo: "email_indisponivel", acao }, { status: 502 });
  }
  const resposta = respostaErro(err);
  // respostaErro devolve 500 com err.message para o que não é ErroIA; nesta camada a frase do app é
  // melhor do que a de uma exceção qualquer, então o 500 genérico é reescrito aqui.
  if (resposta.status === 500) return Response.json({ error: mensagemGenerica }, { status: 500 });
  return resposta;
}
