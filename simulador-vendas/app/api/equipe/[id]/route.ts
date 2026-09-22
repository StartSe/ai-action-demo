// O detalhe de uma pessoa (a linha do tempo de treinos e conversas reais) e o "Apagar" da lista.
//
// Apagar remove a pessoa da lista e **nada mais**: as sessões e as análises dela continuam gravadas,
// sem nome, porque são o histórico do time — o gestor perde o nome, nunca o número. A tela avisa isso
// antes de confirmar, e a resposta devolve o que ficou para a mensagem não depender da tela.
import { detalheDaPessoa } from "@/lib/equipe";
import { emailInvalido } from "@/lib/conta-comum";
import { apagar, obter, atualizar, obterPorEmail } from "@/lib/participantes";

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

export async function PATCH(req: Request, { params }: RouteContext<"/api/equipe/[id]">) {
  const { id } = await params;
  if (!obter(id)) return Response.json({ error: "Esta pessoa não está mais na equipe." }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  const email = typeof corpo?.email === "string" ? corpo.email.trim() : "";
  if (!nome || nome.length > 160) return Response.json({ error: "Escreva um nome de até 160 caracteres." }, { status: 400 });
  if (email) {
    const erro = emailInvalido(email);
    if (erro) return Response.json({ error: erro }, { status: 400 });
    const existente = obterPorEmail(email);
    if (existente && existente.id !== id) return Response.json({ error: "Este e-mail já pertence a outra pessoa da equipe." }, { status: 409 });
  }
  return Response.json({ pessoa: atualizar(id, nome, email) });
}
