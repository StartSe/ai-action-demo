// "Ligar para o candidato agora" (US-020): o mesmo agente conversacional da sala do navegador disca
// para o telefone do candidato, e a transcrição volta pelo mesmo aviso de pós-conversa
// (app/webhook/elevenlabs).
//
// Duas entradas, de propósito:
//
//  - `entrevistaId` é o caminho de hoje: a ligação acontece DENTRO de uma entrevista já criada, com
//    as mesmas variáveis dinâmicas que a sala mandaria (`lib/agente.ts`). É o que faz a conversa
//    voltar para a vaga e o candidato certos — sem o `entrevista_id`, o aviso de pós-conversa chega
//    sem dono e a entrevista fica esperando para sempre.
//  - a vaga digitada à mão continua atendida (a tela da fundação, `app/page.tsx`), onde não há
//    entrevista no banco nenhuma para casar depois.
import { responderErro } from "@/app/api/erros";
import { ACAO_LIGACAO } from "@/lib/acoes";
import { variaveisDaEntrevista } from "@/lib/agente";
import { obter as obterCandidato } from "@/lib/candidatos";
import { NOME_PUBLICO } from "@/lib/convite";
import { obter as obterEntrevista } from "@/lib/entrevistas";
import { ligacaoEnabled, ligar } from "@/lib/voz";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { entrevistaId, telefone, vaga, requisitos, candidato } = (body || {}) as {
    entrevistaId?: string;
    telefone?: string;
    vaga?: string;
    requisitos?: string;
    candidato?: string;
  };
  if (!ligacaoEnabled()) {
    return Response.json(
      { error: "A ligação telefônica automática ainda não foi conectada.", codigo: "ligacao_desligada", acao: ACAO_LIGACAO },
      { status: 400 }
    );
  }

  let variaveis: Record<string, string>;
  let numero = (telefone || "").trim();

  if (entrevistaId) {
    const entrevista = obterEntrevista(entrevistaId);
    if (!entrevista) return Response.json({ error: "Essa entrevista não existe mais." }, { status: 404 });
    if (entrevista.iniciaEm && Date.parse(entrevista.iniciaEm) > Date.now()) return Response.json({ error: "Aguarde o início do período da entrevista para ligar." }, { status: 403 });
    if (entrevista.status !== "convidada" && entrevista.status !== "aberta") {
      return Response.json(
        { error: "Esta entrevista já saiu da espera: só dá para ligar enquanto o candidato ainda não conversou." },
        { status: 409 }
      );
    }
    // O telefone digitado no diálogo vence o do cadastro: quem está ligando pode ter acabado de
    // receber um número novo, e obrigá-lo a editar a ficha antes seria um desvio no meio da ação.
    if (!numero) numero = (obterCandidato(entrevista.candidatoId)?.telefone ?? "").trim();
    if (!numero) {
      return Response.json({ error: "Informe o telefone do candidato, com o código do país." }, { status: 400 });
    }
    const montadas = await variaveisDaEntrevista(entrevistaId, NOME_PUBLICO);
    if (!montadas) {
      return Response.json(
        { error: "Não foi possível preparar o roteiro desta entrevista agora. Tente de novo em um minuto." },
        { status: 502 }
      );
    }
    variaveis = montadas;
  } else {
    if (!numero) return Response.json({ error: "Informe o telefone do candidato, com o código do país." }, { status: 400 });
    variaveis = { vaga: vaga || "", requisitos: requisitos || "", candidato: candidato || "" };
  }

  try {
    const resultado = await ligar({ telefone: numero, variaveis });
    return Response.json({ ok: true, resultado });
  } catch (err) {
    return responderErro(err, "Não foi possível iniciar a ligação agora. Tente de novo em um minuto.");
  }
}
