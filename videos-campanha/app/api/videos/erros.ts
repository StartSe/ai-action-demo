// Tradução dos erros de lib/videos.ts e lib/higgsfield.ts em respostas HTTP, compartilhada pelas rotas de vídeo.
// O que não é erro próprio destas camadas cai em respostaErro (lib/ai.ts), que leva código e ação até o ErrorBox.
import { respostaErro } from "@/lib/ai";
import { ErroDePedido } from "@/lib/conceitos";
import { ErroHiggsfield, HiggsfieldNaoConectado } from "@/lib/higgsfield";
import { CampanhaNaoEncontrada, VideoEmAndamento } from "@/lib/videos";

const CONECTAR_HIGGSFIELD = { rotulo: "Conectar o Higgsfield", url: "/setup#higgsfield" };

export function responderErro(err: unknown, padrao: string) {
  if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
  if (err instanceof CampanhaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
  if (err instanceof VideoEmAndamento) return Response.json({ error: err.message }, { status: 409 });
  if (err instanceof HiggsfieldNaoConectado) return Response.json({ error: err.message, acao: CONECTAR_HIGGSFIELD }, { status: 400 });
  if (err instanceof ErroHiggsfield) return Response.json({ error: err.message }, { status: 502 });
  console.error(padrao, err);
  return respostaErro(err);
}
