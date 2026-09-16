import { registrarEnderecoPublico } from "@/lib/setup-comum";
import { criarPesquisa, listarPesquisasAtivas } from "@/lib/pesquisas";

/** "Criar pesquisa" no painel: gera o link público (/f/<código>) da pesquisa NPS. Título obrigatório: é o que o cliente lê na tela. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const titulo = typeof body?.titulo === "string" ? body.titulo.trim().slice(0, 200) : "";
  if (!titulo) {
    return Response.json({ error: "Dê um título à pesquisa: é a pergunta que o cliente vai ler." }, { status: 400 });
  }
  // O link vai para clientes por e-mail: grava a base pública a partir desta requisição (US-019).
  registrarEnderecoPublico(req);
  const codigo = criarPesquisa(titulo);
  return Response.json({ codigo });
}

/** Lista "Pesquisas ativas" no painel. */
export async function GET() {
  const itens = listarPesquisasAtivas().map((p) => ({ codigo: p.token, titulo: p.titulo, total: p.total, criadoEm: p.criadoEm }));
  return Response.json({ itens });
}
