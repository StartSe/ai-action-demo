// "Pesquisar na web" (US-012): dispara — ou repete — a pesquisa do candidato.
//
// A rota **não espera** a pesquisa terminar. Uma rodada pode levar até um minuto (seis chamadas a um
// serviço externo, mais a consolidação pela IA), e um pedido HTTP aberto esse tempo todo é uma tela
// girando que o navegador ainda pode abandonar no meio. O que ela faz é marcar `pesquisaStatus` como
// `pendente`, deixar `pesquisarCandidato()` correndo e responder na hora; a tela sonda
// `GET /api/candidatos/[id]` a cada três segundos enquanto o estado for `pendente` ou `em_andamento`.
//
// As duas situações em que a pesquisa não tem como rodar (a Bright Data não está conectada; não há
// nada além do nome para separar homônimos) são respondidas **de imediato**, com a frase pronta e,
// quando for o caso, o caminho de Configurações — disparar em segundo plano uma pesquisa que morreria
// em silêncio deixaria a pessoa esperando por nada.
import { atualizar, obter } from "@/lib/candidatos";
import { dispararPesquisa, impedimentoDaPesquisa } from "@/lib/pesquisa";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const impedimento = impedimentoDaPesquisa(candidato);
  if (impedimento) {
    // Uma pesquisa que já deu certo antes continua valendo: o código de acesso pode ter saído hoje, e
    // trocar `concluida` por `nao_pedida` faria a tela dizer que nunca procuramos esta pessoa.
    const atualizado = candidato.pesquisaStatus === "concluida" ? candidato : atualizar(id, { pesquisaStatus: "nao_pedida" });
    return Response.json({ candidato: atualizado, aviso: impedimento.aviso, ...(impedimento.acao ? { acao: impedimento.acao } : {}) });
  }

  // Clicar duas vezes em "Pesquisar de novo" não pode gastar o orçamento duas vezes.
  if (candidato.pesquisaStatus === "pendente" || candidato.pesquisaStatus === "em_andamento") {
    return Response.json({ candidato, emAndamento: true });
  }

  dispararPesquisa(id);
  return Response.json({ candidato: obter(id) });
}
