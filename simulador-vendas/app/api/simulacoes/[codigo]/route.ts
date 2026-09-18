// Um treino: ler (para duplicar) e mudar o status (US-012).
//
// Pausar, reativar e encerrar são a única forma de tirar um link do ar ou colocá-lo de volta — o link
// da simulação não expira sozinho (US-011). Por isso o status é o que esta rota altera, e nada mais:
// mudar o desafio de um treino que o time já começou tornaria as sessões antigas incomparáveis com as
// novas, e "Duplicar" existe justamente para criar a versão seguinte sem estragar a que já rodou.
import { obter, mudarStatus, type StatusSimulacao } from "@/lib/simulacoes";

const STATUS: StatusSimulacao[] = ["ativa", "pausada", "encerrada"];

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const simulacao = obter(codigo);
  if (!simulacao) {
    return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  }
  return Response.json({ simulacao });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!obter(codigo)) {
    return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => ({}));
  const status = String(corpo?.status || "") as StatusSimulacao;
  if (!STATUS.includes(status)) {
    return Response.json({ error: "Escolha se o treino fica ativo, pausado ou encerrado." }, { status: 400 });
  }

  return Response.json({ simulacao: mudarStatus(codigo, status) });
}
