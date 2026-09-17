// "Já terminei" na sala do agente conversacional (US-016): o vendedor saiu da ligação e vai esperar a
// avaliação, que chega de fora, pelo aviso de pós-conversa.
//
// Fechar a sessão aqui é o que faz a conversa existir para o gestor mesmo quando o aviso nunca chega —
// e é o que dá um número ao problema no cartão "Dados para a equipe técnica" (`conversasSemAvaliacao`),
// em vez de uma ligação que simplesmente evaporou. A avaliação **não** é feita aqui: a transcrição da
// ligação está com o agente, e avaliar sem ela daria nota a uma conversa vazia.
import { obter as obterParticipante } from "@/lib/participantes";
import { obter as obterSala, expirou, registrarLigacao } from "@/lib/salas";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { encerrar, obter as obterSessao, ultimaDe } from "@/lib/sessoes";
import { obter as obterSimulacao } from "@/lib/simulacoes";

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/ligacao">) {
  const { token } = await params;

  // Caminho de hoje: a ligação é de uma sessão de treino. O id vem do cookie assinado e o dono é
  // reconferido no banco, como nas outras rotas da conversa (lib/sala-do-vendedor.ts).
  if (obterSimulacao(token)) {
    const sessaoVendedor = lerSessaoVendedor(req.headers.get("cookie"));
    const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;
    if (participante) {
      const doCookie = sessaoVendedor?.sessaoId ? obterSessao(sessaoVendedor.sessaoId) : null;
      const daPessoa = doCookie && doCookie.participanteId === participante.id && doCookie.simulacaoCodigo === token ? doCookie : null;
      const sessao = daPessoa ?? ultimaDe(token, participante.id);
      if (sessao && (sessao.status === "em_andamento" || sessao.status === "preparando")) encerrar(sessao.id);
      return Response.json({ ok: true });
    }
  }

  // Sala criada antes da US-002, onde não há sessão nem participante identificado.
  const sala = obterSala(token);
  if (!sala || expirou(sala)) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }
  registrarLigacao(token);
  return Response.json({ ok: true });
}
