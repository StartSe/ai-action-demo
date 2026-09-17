// Fim da conversa de treino (US-015): fecha a sessão e devolve o resultado que a sala mostra na hora.
//
// A avaliação de verdade — por metodologia, com rubrica e frase sugerida — é a US-018/US-019. Até lá
// esta rota reaproveita a análise que já existe (lib/analise.ts), só com os critérios da metodologia
// escolhida pelo gestor (US-010) em vez da lista consultiva fixa: assim quem treina já sai da conversa
// com nota e devolutiva, e o histórico do gestor já nasce ligado à sessão.
import crypto from "node:crypto";
import { salvarConversaAnalisada } from "@/lib/analise";
import { obter as obterResultado } from "@/lib/historico";
import { criteriosDe } from "@/lib/metodologias";
import { conversaAberta } from "@/lib/sala-do-vendedor";
import { encerrar, registrarResultado, transcricao } from "@/lib/sessoes";
import { ErroIA } from "@/lib/ai";
import type { Analise, Conversa } from "@/lib/types";
import type { Meta } from "@/lib/ai";

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/encerrar">) {
  const { token } = await params;
  const lido = conversaAberta(req, token, { aceitaEncerrada: true });
  if (lido instanceof Response) return lido;
  const { simulacao, participante, sessao } = lido;

  // Conversa já avaliada: devolve o que está gravado. Quem recarrega a tela do feedback (ou clica duas
  // vezes em encerrar) volta a ver a sua avaliação — refazê-la gastaria o modelo de novo e daria duas
  // notas diferentes para a mesma conversa.
  if (sessao.resultadoId) {
    const guardado = obterResultado<Conversa, Analise, Meta>(sessao.resultadoId);
    if (guardado) {
      if (!simulacao.mostrarFeedback) return Response.json({ semFeedback: true });
      return Response.json({
        demo: guardado.meta?.demo === true,
        analise: guardado.saida,
        meta: guardado.meta,
        id: guardado.id,
        titulo: guardado.titulo,
        conversa: guardado.entrada,
      });
    }
  }

  const falas = transcricao(sessao.id);

  // "Encerrar e ver meu resultado" vale a qualquer momento, inclusive antes da primeira fala. Nesse
  // caso a conversa fecha do mesmo jeito (ela existiu, e o gestor precisa ver que existiu), mas não há
  // o que avaliar — dar nota a um silêncio seria inventar um resultado.
  if (!falas.some((f) => f.papel === "vendedor")) {
    if (sessao.status === "em_andamento") encerrar(sessao.id);
    return Response.json({ semConversa: true });
  }

  // A despedida por tempo esgotado já fechou a sessão; encerrar de novo esticaria a duração gravada.
  const fechada = sessao.status === "em_andamento" ? encerrar(sessao.id) : sessao;
  const conversa: Conversa = {
    id: gerarId(),
    vendedorId: participante.id,
    origem: sessao.modo === "texto" ? "texto" : "voz",
    transcricao: falas.map((f) => ({ papel: f.papel, texto: f.texto, segundo: f.segundo })),
    duracaoSeg: fechada?.duracaoSeg,
    criadoEm: sessao.iniciadaEm ?? sessao.criadoEm,
  };

  try {
    const resultado = await salvarConversaAnalisada(
      conversa,
      criteriosDe(simulacao).map((c) => c.nome),
    );
    if (resultado.id) registrarResultado(sessao.id, resultado.id);
    // O gestor pode ter desligado o feedback ao finalizar (US-011): a avaliação é gerada e guardada
    // do mesmo jeito — é dela que o painel dele vive —, mas nada dela volta para esta tela.
    if (!simulacao.mostrarFeedback) return Response.json({ semFeedback: true });
    return Response.json({ ...resultado, conversa });
  } catch (err) {
    // A conversa já está fechada e gravada: o que falhou foi a avaliação. A frase diz isso, sem
    // pedir a quem treina uma ação que ele não tem como executar.
    console.error("Sala de treino: a avaliação da sessão falhou", err instanceof ErroIA ? err.codigo : err);
    return Response.json(
      { error: "Sua conversa foi registrada, mas a avaliação não ficou pronta agora. Avise quem enviou o link." },
      { status: 502 },
    );
  }
}
