// Renomear preserva o desafio e a comparabilidade das avaliações; para outro desafio, duplique.
import { obter, atualizar, apagar, type StatusSimulacao } from "@/lib/simulacoes";

const STATUS: StatusSimulacao[] = ["ativa", "pausada", "encerrada"];

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const simulacao = obter(codigo);
  if (!simulacao) return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  return Response.json({ simulacao });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!obter(codigo)) return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return Response.json({ error: "Informe o nome ou a situação do treino." }, { status: 400 });
  const campos: { nome?: string; status?: StatusSimulacao } = {};
  if (corpo && "nome" in corpo) {
    if (typeof corpo.nome !== "string" || !corpo.nome.trim() || corpo.nome.trim().length > 160) return Response.json({ error: "Escreva um nome de até 160 caracteres." }, { status: 400 });
    campos.nome = corpo.nome.trim();
  }
  if (corpo && "status" in corpo) {
    if (!STATUS.includes(corpo.status)) return Response.json({ error: "Escolha se o treino fica ativo, pausado ou encerrado." }, { status: 400 });
    campos.status = corpo.status;
  }
  if (!Object.keys(campos).length) return Response.json({ error: "Informe o nome ou a situação do treino." }, { status: 400 });
  return Response.json({ simulacao: atualizar(codigo, campos) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!obter(codigo)) return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  apagar(codigo);
  return Response.json({ ok: true });
}
