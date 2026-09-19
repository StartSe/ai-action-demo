import { lerColetaSalva } from "@/lib/coleta-salva";
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
import { validarTermos } from "@/lib/consulta-candidato";
import { atualizar, obter } from "@/lib/candidatos";
import { dispararPesquisa, impedimentoDaPesquisa } from "@/lib/pesquisa";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const texto = await req.text();
  let corpo;
  try { corpo = texto ? JSON.parse(texto) : {}; } catch { return Response.json({ error: "Os termos de busca não são válidos." }, { status: 400 }); }
  if (!corpo || typeof corpo !== "object" || (corpo.termos !== undefined && !validarTermos(corpo.termos))) return Response.json({ error: "Adicione de 1 a 12 termos válidos. Use um endereço https://linkedin.com/in/ para o perfil." }, { status: 400 });
  if (corpo.retomar !== undefined && typeof corpo.retomar !== "boolean") return Response.json({ error: "Opção de retomada inválida." }, { status: 400 });
  if (candidato.pesquisaStatus === "pendente" || candidato.pesquisaStatus === "em_andamento") return Response.json({ candidato, emAndamento: true });
  if (corpo.retomar) {
    if (candidato.pesquisaStatus !== "falhou" || !lerColetaSalva(id)) return Response.json({ error: "Não há coleta interrompida para retomar. Inicie uma nova pesquisa." }, { status: 409 });
    dispararPesquisa(id, { retomar: true });
    return Response.json({ candidato: obter(id) });
  }
  const termos = corpo.termos;
  const impedimento = impedimentoDaPesquisa(candidato, undefined, termos);
  if (impedimento) {
    // Uma pesquisa que já deu certo antes continua valendo: o código de acesso pode ter saído hoje, e
    // trocar `concluida` por `nao_pedida` faria a tela dizer que nunca procuramos esta pessoa.
    const atualizado = candidato.pesquisaStatus === "concluida" ? candidato : atualizar(id, { pesquisaStatus: "nao_pedida" });
    return Response.json({ candidato: atualizado, aviso: impedimento.aviso, ...(impedimento.acao ? { acao: impedimento.acao } : {}) });
  }

  dispararPesquisa(id, { termos });
  return Response.json({ candidato: obter(id) });
}
