// Um candidato: ler e corrigir o cadastro (US-008; a ficha editável campo a campo é da US-013).
//
// O `PATCH` existe desde já por causa de um caso da própria US-008: o currículo entrou mas o texto
// não saiu dele (digitalização, `.docx`), e a tela oferece colar o texto. Só o que veio no corpo é
// alterado — campo ausente é "não mexa", nunca "apague".
import { obter, atualizar, validarMudancasCandidato } from "@/lib/candidatos";

export const dynamic = "force-dynamic";

const SUMIU = { error: "Esse candidato não existe mais." };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json(SUMIU, { status: 404 });
  return Response.json({ candidato });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  const validacao = validarMudancasCandidato(corpo);
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });
  return Response.json({ candidato: atualizar(id, validacao.campos) });
}
