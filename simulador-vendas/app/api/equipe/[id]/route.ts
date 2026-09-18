// O detalhe de uma pessoa (a linha do tempo de treinos e conversas reais) e o "Apagar" da lista.
//
// Apagar remove a pessoa da lista e **nada mais**: as sessões e as análises dela continuam gravadas,
// sem nome, porque são o histórico do time — o gestor perde o nome, nunca o número. A tela avisa isso
// antes de confirmar, e a resposta devolve o que ficou para a mensagem não depender da tela.
import { detalheDaPessoa } from "@/lib/equipe";
import { apagar, obter } from "@/lib/participantes";

export async function GET(_req: Request, { params }: RouteContext<"/api/equipe/[id]">) {
  const { id } = await params;
  const detalhe = detalheDaPessoa(id);
  if (!detalhe) return Response.json({ error: "Esta pessoa não está mais na equipe." }, { status: 404 });
  return Response.json(detalhe);
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/equipe/[id]">) {
  const { id } = await params;
  const pessoa = obter(id);
  if (!pessoa) return Response.json({ error: "Esta pessoa não está mais na equipe." }, { status: 404 });

  const detalhe = detalheDaPessoa(id);
  const sessoes = detalhe?.pessoa.sessoes ?? 0;
  const conversasReais = detalhe?.pessoa.conversasReais ?? 0;
  apagar(id);
  return Response.json({ ok: true, sessoes, conversasReais });
}
