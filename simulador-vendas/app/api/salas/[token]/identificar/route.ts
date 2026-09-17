// Caminho manual da identificação do vendedor (US-013): nome e e-mail, sem senha e sem criar conta.
// É o caminho sempre disponível — os botões de Google e Microsoft só aparecem quando a instância tem
// as credenciais, e mesmo então "ou informe seu nome e e-mail" fica logo abaixo (D5).
//
// DELETE é o "Não sou eu": apaga a identificação deste navegador e nada mais (o participante e as
// sessões dele continuam, porque são o histórico que o gestor acompanha).
import { emailInvalido } from "@/lib/conta-comum";
import { garantir } from "@/lib/participantes";
import { cookieSair, cookieSessaoVendedor, ehSeguro } from "@/lib/sessao-vendedor";
import { baseUrl } from "@/lib/setup-comum";
import { obter as obterSimulacao } from "@/lib/simulacoes";

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/identificar">) {
  const { token } = await params;
  const simulacao = obterSimulacao(token);
  if (!simulacao) return Response.json({ error: "Este link de treino não existe mais." }, { status: 404 });
  if (simulacao.status !== "ativa") {
    return Response.json({ error: "Este treino não está aberto no momento. Fale com quem enviou o link." }, { status: 409 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { nome?: string; email?: string };
  const nome = (corpo.nome || "").trim();
  const email = (corpo.email || "").trim();
  if (!nome) return Response.json({ error: "Escreva o seu nome." }, { status: 400 });
  const erroEmail = emailInvalido(email);
  if (erroEmail) return Response.json({ error: erroEmail }, { status: 400 });

  const participante = garantir({ nome, email, origem: "link" });
  return Response.json(
    { participante: { id: participante.id, nome: participante.nome } },
    { headers: { "Set-Cookie": cookieSessaoVendedor({ participanteId: participante.id, seguro: ehSeguro(baseUrl(req)) }) } },
  );
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookieSair() } });
}
