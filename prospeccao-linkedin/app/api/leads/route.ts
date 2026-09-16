import { respostaErro } from "@/lib/ai";
import { apagarTodos, listar } from "@/lib/historico";
import { buscarLeads, ErroDePedido, validarPerfil } from "@/lib/leads";
import { ErroProspectHalo } from "@/lib/prospecthalo";
import { getConfig, setConfig } from "@/lib/store";

/**
 * Busca os leads do perfil informado e cria a campanha em rascunho. Devolve { campanha, meta, id }.
 * `exemplo: true` no corpo força a lista fictícia mesmo com o Prospect Halo conectado (botão "Ver com dados de exemplo").
 * Falha do Prospect Halo responde com o status da situação (400 sem conexão, 401 autorização vencida, 404 sem
 * leads, 502/503/504 serviço) e { error, acao, exemploDisponivel: true }; o resto passa por respostaErro.
 */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const exemplo = Boolean(corpo && typeof corpo === "object" && (corpo as { exemplo?: unknown }).exemplo);
  let perfil;
  try {
    perfil = validarPerfil(corpo);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Pedido inválido." }, { status: 400 });
  }
  // "Seu nome"/"Sua empresa" ficam lembrados para pré-preencher o formulário da próxima vez.
  if (perfil.remetente.nome) setConfig("REMETENTE_NOME", perfil.remetente.nome);
  if (perfil.remetente.empresa) setConfig("REMETENTE_EMPRESA", perfil.remetente.empresa);
  try {
    const { campanha, meta } = await buscarLeads(perfil, { exemplo });
    return Response.json({ campanha, meta, id: campanha.id });
  } catch (err) {
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof ErroProspectHalo) return Response.json({ error: err.message, acao: err.acao, exemploDisponivel: true }, { status: err.status });
    return respostaErro(err);
  }
}

/** Últimas campanhas salvas, para a lista "Últimos resultados"; remetenteNome/remetenteEmpresa pré-preenchem "Seu nome"/"Sua empresa". */
export async function GET() {
  return Response.json({ itens: listar(10), remetenteNome: getConfig("REMETENTE_NOME"), remetenteEmpresa: getConfig("REMETENTE_EMPRESA") });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
