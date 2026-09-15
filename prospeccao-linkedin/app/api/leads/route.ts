import { apagarTodos, listar } from "@/lib/historico";
import { buscarLeads, ErroDePedido, validarPerfil } from "@/lib/leads";
import { getConfig, setConfig } from "@/lib/store";

/** Busca os leads do perfil informado e cria a campanha em rascunho. Devolve { campanha, meta, id }. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
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
    const { campanha, meta } = await buscarLeads(perfil);
    return Response.json({ campanha, meta, id: campanha.id });
  } catch (err) {
    console.error(err);
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    const mensagem = err instanceof Error ? err.message : "Não foi possível buscar os leads agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
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
