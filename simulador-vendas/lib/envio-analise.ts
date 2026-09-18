// "Enviar a análise ao vendedor": manda por e-mail, para o endereço cadastrado do vendedor
// (Vendedor.email), a nota e os pontos a melhorar da conversa analisada. Usa lib/notificacoes.ts,
// o mesmo canal das rotinas — a diferença é que o destino não é o gestor, é o vendedor da conversa.
//
// Dois envios vivem aqui, pelo mesmo canal e para o mesmo tipo de destinatário:
//  1. o **pedido do gestor** (`enviarAnaliseAoVendedor`), de uma conversa real colada no painel, que
//     avisa na tela quando não dá para enviar — ele acabou de clicar em um botão e espera resposta;
//  2. o **envio automático** (`enviarFeedbackDaSessao`), logo depois de a avaliação de um treino ficar
//     pronta (US-020), que nunca lança: quem está na tela é o vendedor, lendo o feedback dele, e não
//     tem nada a fazer com um erro de configuração de e-mail. A falha fica gravada na sessão e vira
//     uma linha para o gestor em Resultados.
import { anotacaoDaConversa } from "./crm";
import { numero } from "./formato";
import { obter as obterResultado } from "./historico";
import { enviar } from "./notificacoes";
import { obter as obterParticipante } from "./participantes";
import { motivoCanalIndisponivel } from "./rotinas";
import { obter as obterSessao, registrarEnvioEmail } from "./sessoes";
import { obter as obterSimulacao } from "./simulacoes";
import { enderecoPublico } from "./setup-comum";
import { getConfig, setConfig } from "./store";
import type { AvaliacaoSessao } from "./avaliacao";
import type { Meta } from "./ai";
import type { Analise, Conversa } from "./types";

export const ACAO_NOTIFICACOES = { rotulo: "Configurar Notificações", url: "/setup#notificacoes" };

/** Falha ao enviar a análise. `status` 400 quando falta um pré-requisito da pessoa, 502 quando o provedor recusa. */
export class ErroEnvioAnalise extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, status = 502, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroEnvioAnalise";
    this.status = status;
    this.acao = acao;
  }
}

/** Envia a análise salva em `resultadoId` para o e-mail do vendedor daquela conversa. */
export async function enviarAnaliseAoVendedor(resultadoId: string): Promise<{ mensagem: string }> {
  const resultado = obterResultado<Conversa, Analise, Meta>(resultadoId);
  if (!resultado || resultado.tipo !== "conversa") {
    throw new ErroEnvioAnalise("Não encontrei esta conversa. Analise de novo e tente outra vez.", 400);
  }

  const vendedor = resultado.entrada.vendedorId ? obterParticipante(resultado.entrada.vendedorId) : null;
  if (!vendedor) throw new ErroEnvioAnalise("Escolha o vendedor desta conversa antes de enviar a análise.", 400);
  if (!vendedor.email) {
    throw new ErroEnvioAnalise(`${vendedor.nome} ainda não tem e-mail cadastrado. Cadastre o endereço e tente de novo.`, 400);
  }

  const motivo = motivoCanalIndisponivel("email");
  if (motivo) throw new ErroEnvioAnalise(motivo, 400, ACAO_NOTIFICACOES);

  const base = enderecoPublico();
  const resposta = await enviar({
    canal: "email",
    destino: vendedor.email,
    titulo: `Sua análise: ${resultado.titulo}`,
    texto: anotacaoDaConversa(resultado.titulo, resultado.saida),
    link: base ? `${base}/r/${resultadoId}` : undefined,
  });
  if (!resposta.ok) throw new ErroEnvioAnalise(resposta.mensagem, 502, ACAO_NOTIFICACOES);
  return { mensagem: `Análise enviada para ${vendedor.email}.` };
}

// ---------------------------------------------------------------------------------------------
// O feedback do treino, por e-mail, logo depois da avaliação (US-020)
// ---------------------------------------------------------------------------------------------

/** "0" desliga o envio automático. A chave só existe quando alguém mexeu nela: o padrão é ligado. */
const CHAVE_ENVIO_FEEDBACK = "FEEDBACK_EMAIL_VENDEDOR";

/** O envio automático do feedback está ligado? Ligado por padrão — quem cadastrou o e-mail do time
 * espera que o feedback chegue nele. */
export function envioDeFeedbackLigado(): boolean {
  return getConfig(CHAVE_ENVIO_FEEDBACK) !== "0";
}

/** Liga ou desliga o envio automático, em uma linha de Configurações. */
export function definirEnvioDeFeedback(ligado: boolean): void {
  setConfig(CHAVE_ENVIO_FEEDBACK, ligado ? "1" : "0");
}

/**
 * O e-mail do vendedor: nota, o que ele fez bem, o único ponto que mais mudaria a próxima conversa e
 * a frase para experimentar.
 *
 * **A rubrica inteira não entra.** Critério por critério com evidência e como melhorar é a leitura do
 * gestor, e numa caixa de entrada viraria uma parede de texto que ninguém abre antes de uma ligação —
 * que é justamente o momento em que este e-mail serve para algo. O link leva ao feedback completo.
 */
export function textoDoFeedback(avaliacao: AvaliacaoSessao): string {
  const partes: string[] = [`Nota desta conversa: ${numero(avaliacao.notaGeral, 1)} de 10.`];
  if (avaliacao.resumo) partes.push(avaliacao.resumo);

  if (avaliacao.pontosFortes.length) {
    partes.push(["O que você fez bem:", ...avaliacao.pontosFortes.map((p) => `- ${p}`)].join("\n"));
  }

  const o = avaliacao.oportunidade;
  if (o) {
    partes.push(
      [
        `O que mais mudaria a próxima conversa — ${o.criterio}:`,
        o.oQueAconteceu,
        o.oQueFazer,
        o.fraseSugerida && `Experimente dizer: "${o.fraseSugerida}"`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  partes.push("Abra o link abaixo para ver o feedback completo e treinar de novo.");
  return partes.join("\n\n");
}

/**
 * Manda o feedback do treino para o e-mail de quem treinou, se houver o que mandar.
 *
 * **Nunca lança e nunca fica no meio.** Cada motivo para não enviar é uma volta silenciosa, porque
 * nenhum deles é uma falha: o gestor desligou o envio, o vendedor entrou sem e-mail, o treino esconde
 * o feedback (US-011 — mandar por e-mail o que a tela não mostra seria contornar a decisão dele) ou a
 * conta de e-mail nunca foi configurada. Só o envio que o provedor recusou fica gravado.
 *
 * A idempotência não vem de uma marca de processo: ela vem de perguntar ao banco se esta sessão já
 * teve o feedback entregue. É o que mantém honesto o "Tentar de novo" do gestor e o aviso de
 * pós-conversa do agente, que chega mais de uma vez por definição.
 */
export async function enviarFeedbackDaSessao(sessaoId: string): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    if (!envioDeFeedbackLigado()) return { enviado: false };

    const sessao = obterSessao(sessaoId);
    if (!sessao?.resultadoId) return { enviado: false };
    if (sessao.envioEmail === "enviado") return { enviado: true };

    const simulacao = obterSimulacao(sessao.simulacaoCodigo);
    if (!simulacao?.mostrarFeedback) return { enviado: false };

    const participante = obterParticipante(sessao.participanteId);
    if (!participante?.email) return { enviado: false };

    const motivoCanal = motivoCanalIndisponivel("email");
    if (motivoCanal) return { enviado: false, motivo: motivoCanal };

    const registro = obterResultado<Conversa, AvaliacaoSessao, Meta>(sessao.resultadoId);
    if (!registro || registro.tipo !== "sessao") return { enviado: false };

    // O link é o do **vendedor**, nunca /r/<id>: aquela tela é do gestor e exige conta, então quem
    // clicasse cairia na tela de entrar. Sem endereço público configurado o e-mail sai sem link — a
    // nota e o que fazer diferente valem por si.
    const base = enderecoPublico();
    const resposta = await enviar({
      canal: "email",
      destino: participante.email,
      titulo: `Seu feedback: ${simulacao.nome}`,
      texto: textoDoFeedback(registro.saida),
      link: base ? `${base}/simular/${sessao.simulacaoCodigo}/meus-resultados/${sessao.id}` : undefined,
    });

    if (!resposta.ok) {
      registrarEnvioEmail(sessao.id, "falhou", resposta.mensagem);
      return { enviado: false, motivo: resposta.mensagem };
    }
    registrarEnvioEmail(sessao.id, "enviado");
    return { enviado: true };
  } catch (err) {
    // A avaliação já está gravada e o vendedor já está lendo o feedback na tela: um erro aqui não pode
    // subir. Ele fica no log e, quando a sessão é conhecida, gravado para o gestor ver.
    console.error("Não foi possível enviar o feedback do treino por e-mail", err);
    const motivo = "Não conseguimos enviar por e-mail agora. Confira a conta de e-mail em Configurações.";
    try {
      registrarEnvioEmail(sessaoId, "falhou", motivo);
    } catch (falha) {
      console.error("Falha ao registrar o envio de feedback recusado", falha);
    }
    return { enviado: false, motivo };
  }
}
