// Próxima fala da prévia do gestor ("Testar a entrevista", decisão D11): o mesmo `lib/roteiro.ts` da
// entrevista de verdade, com um candidato vazio — o gestor ouve exatamente as perguntas que a vaga
// gera, sem que nada seja gravado nem avaliado.
//
// A conversa do candidato tem rota própria (app/api/entrevista/candidato/[token]/falar), que lê a
// vaga do link e guarda a transcrição no servidor.
import { responderErro } from "@/app/api/erros";
import { normalizarHistorico } from "@/lib/entrevista";
import { proximaFalaDaPrevia } from "@/lib/roteiro";
import { obter as obterVaga } from "@/lib/vagas";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { vagaId, historico } = (body || {}) as { vagaId?: string; historico?: unknown };
  // A vaga vem do banco pelo id, nunca do corpo: o roteiro precisa dos desafios, das competências
  // culturais e da faixa, e nada disso cabe no que a sala tem em mãos.
  const vaga = typeof vagaId === "string" ? obterVaga(vagaId) : null;
  if (!vaga) {
    return Response.json({ error: "Essa vaga não existe mais. Volte para a lista de vagas." }, { status: 404 });
  }
  try {
    return Response.json(await proximaFalaDaPrevia(vaga, normalizarHistorico(historico)));
  } catch (err) {
    return responderErro(err, "Não foi possível escrever a próxima pergunta agora. Tente de novo em alguns segundos.");
  }
}
