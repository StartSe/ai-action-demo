// Marca que uma ligação por voz terminou nesta sala. Chamado pela própria sala quando o vendedor clica
// em "Já terminei, ver minha análise": a ligação fica registrada mesmo que o aviso de pós-conversa da
// ElevenLabs nunca chegue, e o cartão "Dados para a equipe técnica" consegue mostrar que algo travou.
import { obter, expirou, registrarLigacao } from "@/lib/salas";

export async function POST(_req: Request, { params }: RouteContext<"/api/salas/[token]/ligacao">) {
  const { token } = await params;
  const sala = obter(token);
  if (!sala || expirou(sala)) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }
  registrarLigacao(token);
  return Response.json({ ok: true });
}
