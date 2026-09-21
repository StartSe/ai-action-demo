// O agente do site: GET últimas mensagens, POST { texto } (um pedido → resposta, versões novas, publicou),
// DELETE limpa a conversa. Lógica em lib/agente.ts (compartilhada com a ferramenta MCP editar_pagina).
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
  try {
    const corpo = await corpoJson(req);
    const r = await conversar(id, corpo.texto);
    return Response.json(r);
  } catch (err) {
    return respostaErroSites(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/sites/[id]/agente">) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  limparConversa(id);
  return Response.json({ ok: true });
}
