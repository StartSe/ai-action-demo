// O que as rotas da conversa (falar, ouvir a voz, encerrar) precisam saber antes de fazer qualquer
// coisa: o treino está aberto, quem bateu à porta se identificou, e esta é a conversa dele.
//
// Mora num arquivo só porque as três rotas fazem exatamente a mesma conferência, e porque errar nela
// é o que faria uma pessoa falar dentro da conversa de outra: o id da sessão vem do cookie assinado
// (lib/sessao-vendedor.ts), mas o dono dela é sempre reconferido no banco.
import { obter as obterParticipante, type Participante } from "./participantes";
import { lerSessaoVendedor } from "./sessao-vendedor";
import { emAndamento, emPreparacao, obter as obterSessao, tentativasDe, ultimaDe, temFalaDoVendedor, transcricao, type Sessao } from "./sessoes";
import { obter as obterSimulacao, type Simulacao } from "./simulacoes";

export type ConversaAberta = { simulacao: Simulacao; participante: Participante; sessao: Sessao };

/**
 * A conversa em andamento de quem chamou a rota, ou a frase que o **vendedor** entende — ele não
 * configura nada e não pode receber recado de gestor.
 *
 * A sessão é procurada primeiro pelo cookie e depois pelo banco: um navegador que perdeu o cookie no
 * meio da conversa (aba restaurada, cookie de sessão apagado) continua na conversa que já estava
 * aberta, em vez de travar no meio de um treino que não dá para repetir.
 */
export function conversaAberta(req: Request, codigo: string, { aceitaEncerrada = false }: { aceitaEncerrada?: boolean } = {}): ConversaAberta | Response {
  const simulacao = obterSimulacao(codigo);
  if (!simulacao) return Response.json({ error: "Este link de treino não existe mais." }, { status: 404 });
  if (simulacao.status !== "ativa") {
    return Response.json({ error: simulacao.status === "pausada" ? "Este treino está pausado. Aguarde a reativação por quem enviou o link." : "Este treino foi encerrado. Fale com quem enviou o link." }, { status: 409 });
  }

  const sessaoVendedor = lerSessaoVendedor(req.headers.get("cookie"));
  const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;
  if (!participante) return Response.json({ error: "Diga o seu nome antes de começar o treino." }, { status: 401 });

  const doCookie = sessaoVendedor?.sessaoId ? obterSessao(sessaoVendedor.sessaoId) : null;
  const daPessoa = doCookie && doCookie.participanteId === participante.id && doCookie.simulacaoCodigo === codigo ? doCookie : null;
  const sessao = daPessoa ?? emAndamento(codigo, participante.id) ?? (aceitaEncerrada ? ultimaDe(codigo, participante.id) : null);
  // `aceitaEncerrada` é para a rota do resultado: quando o tempo acaba, a conversa é fechada no mesmo
  // turno da despedida, e o pedido do resultado chega logo depois — com uma sessão já encerrada, mas
  // ainda sem avaliação. Sem isso, o vendedor perderia justamente o feedback do treino que completou.
  // "encerrada" e "avaliada" servem à rota do resultado: quando o tempo acaba, a conversa é fechada no
  // mesmo turno da despedida, e o pedido do resultado chega logo depois. E quem recarrega a tela do
  // feedback tem de reler o feedback, não levar um "esta conversa já foi encerrada" na cara.
  const serve = sessao?.status === "em_andamento" || (aceitaEncerrada && (sessao?.status === "encerrada" || sessao?.status === "avaliada" || (sessao?.status === "abandonada" && !temFalaDoVendedor(transcricao(sessao.id)))));
  if (!sessao || !serve) {
    return Response.json({ error: "Esta conversa já foi encerrada. Abra o link de novo para treinar mais uma vez." }, { status: 409 });
  }

  return { simulacao, participante, sessao };
}

/**
 * Quantos segundos ainda restam desta conversa, pelo relógio do **servidor**.
 *
 * O cronômetro da tela é só um espelho: quem decide que o tempo acabou é esta função, porque a hora
 * do navegador de quem treina pode estar errada — ou ter sido mexida de propósito para ganhar tempo.
 */
export function restanteSeg(sessao: Sessao, duracaoMin: number): number {
  const inicio = new Date(sessao.iniciadaEm ?? sessao.criadoEm).getTime();
  const total = Math.max(1, duracaoMin) * 60;
  const passados = Math.floor((Date.now() - inicio) / 1000);
  return Math.max(0, total - passados);
}

/**
 * Quantas conversas esta pessoa já teve neste treino e se ainda pode ter outra — o balanço que o
 * feedback (US-019) mostra ao lado de "Treinar novamente".
 *
 * Uma conversa **em aberto** não fecha a porta para o dono dela: `tentativasDe` já a conta desde que
 * nasceu, então quem tem uma conversa aberta continua podendo voltar para ela — é para lá que o botão
 * leva. O limite só vale quando não há nenhuma aberta, a mesma regra da tela do treino.
 */
export function balancoDeTentativas(simulacao: Simulacao, participanteId: string): { podeTreinar: boolean; tentativas: number; maxTentativas: number | null } {
  const tentativas = tentativasDe(simulacao.codigo, participanteId);
  const aberta = emPreparacao(simulacao.codigo, participanteId) ?? emAndamento(simulacao.codigo, participanteId);
  const dentroDoLimite = simulacao.maxTentativas === null || tentativas < simulacao.maxTentativas;
  return {
    podeTreinar: simulacao.status === "ativa" && (Boolean(aberta) || dentroDoLimite),
    tentativas,
    maxTentativas: simulacao.maxTentativas,
  };
}
