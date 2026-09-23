import { obter as obterSimulacao } from "@/lib/simulacoes";
// Encerra a conversa por texto da sala de simulação pública (app/simular/[token]) e gera a análise:
// mesma lógica de app/webhook/elevenlabs/route.ts para uma conversa que já chega estruturada.
import crypto from "node:crypto";
import { obter as obterSala, expirou, registrarResultado } from "@/lib/salas";
import { salvarConversaAnalisada } from "@/lib/analise";
import { ErroIA } from "@/lib/ai";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { Conversa, LinhaTranscricao } from "@/lib/types";

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/analisar">) {
  const { token } = await params;
  const simulacaoAtual = obterSimulacao(token);
  if (simulacaoAtual && simulacaoAtual.status !== "ativa") return Response.json({ error: simulacaoAtual.status === "pausada" ? "Este treino está pausado. Aguarde a reativação por quem enviou o link." : "Este treino foi encerrado." }, { status: 409 });
  const sala = obterSala(token);
  if (!sala || expirou(sala)) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => null);
  const transcricao = Array.isArray(corpo?.transcricao) ? (corpo.transcricao as LinhaTranscricao[]) : [];
  if (!transcricao.some((l) => l?.papel === "vendedor" && typeof l.texto === "string" && l.texto.trim())) {
    return Response.json({ error: "Converse um pouco antes de encerrar a ligação." }, { status: 400 });
  }

  const conversa: Conversa = {
    id: gerarId(),
    vendedorId: sala.vendedorId ?? undefined,
    cenarioId: sala.cenarioId ?? undefined,
    origem: "texto",
    transcricao,
    criadoEm: new Date().toISOString(),
  };

  try {
    const resultado = await salvarConversaAnalisada(conversa, CRITERIOS_PADRAO);
    if (resultado.id) registrarResultado(token, resultado.id);
    return Response.json({ ...resultado, conversa });
  } catch (err) {
    console.error("Sala de treino: a análise falhou", err instanceof ErroIA ? err.codigo : err);
    return Response.json({ error: "Não foi possível montar a sua análise agora. Avise quem enviou este link e tente de novo mais tarde." }, { status: 502 });
  }
}
