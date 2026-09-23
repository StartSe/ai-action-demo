// O agente do site: GET últimas mensagens, POST { texto } (um pedido → resposta, versões novas, publicou),
// DELETE limpa a conversa. Lógica em lib/agente.ts (compartilhada com a ferramenta MCP editar_pagina).
//
// Com `Accept: application/x-ndjson`, o POST responde AO VIVO, uma linha JSON por evento: { tipo: "passo", nome }
// a cada ferramenta chamada, { tipo: "previa", html } a cada mudança no rascunho (a prévia da tela atualiza na
// hora), { tipo: "ping" } a cada 10 s enquanto o modelo pensa e, por fim, { tipo: "fim", ...RespostaAgente } ou
// { tipo: "erro", error, status }. Sem esse cabeçalho, a resposta é o JSON único de antes.
import { conversar, limparConversa, listarMensagens } from "@/lib/agente";
import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/sites/[id]/agente">) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  return Response.json({ mensagens: listarMensagens(id) });
}

export async function POST(req: Request, { params }: RouteContext<"/api/sites/[id]/agente">) {
  const { id } = await params;
  const corpo = await corpoJson(req);
  const aoVivo = (req.headers.get("accept") ?? "").includes("application/x-ndjson");
  if (!aoVivo) {
    try {
      return Response.json(await conversar(id, corpo.texto));
    } catch (err) {
      return respostaErroSites(err);
    }
  }

  const codificador = new TextEncoder();
  const fluxo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      let aberto = true;
      const enviar = (evento: Record<string, unknown>) => {
        if (!aberto) return;
        try { controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`)); } catch { aberto = false; }
      };
      const batimento = setInterval(() => enviar({ tipo: "ping" }), 10_000);
      try {
        const r = await conversar(id, corpo.texto, {
          aoPasso: (nome) => enviar({ tipo: "passo", nome }),
          aoPrevia: (html) => enviar({ tipo: "previa", html }),
        });
        enviar({ tipo: "fim", ...r });
      } catch (err) {
        const resposta = respostaErroSites(err);
        const detalhe = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
        enviar({ tipo: "erro", status: resposta.status, ...detalhe });
      } finally {
        clearInterval(batimento);
        aberto = false;
        try { controlador.close(); } catch { /* já fechado */ }
      }
    },
  });
  return new Response(fluxo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/sites/[id]/agente">) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  limparConversa(id);
  return Response.json({ ok: true });
}
