// Encerra a conversa por texto da sala de simulação pública (app/simular/[token]) e gera a análise:
// mesma lógica de app/webhook/elevenlabs/route.ts para uma conversa que já chega estruturada.
import crypto from "node:crypto";
import { obter as obterSala, expirou, registrarResultado } from "@/lib/salas";
import { salvarConversaAnalisada } from "@/lib/analise";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { Conversa, LinhaTranscricao } from "@/lib/types";

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/analisar">) {
  const { token } = await params;
  const sala = obterSala(token);
  if (!sala || expirou(sala)) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => null);
  const transcricao = Array.isArray(corpo?.transcricao) ? (corpo.transcricao as LinhaTranscricao[]) : [];
  if (!transcricao.some((l) => l.papel === "vendedor")) {
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
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar sua análise agora.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
