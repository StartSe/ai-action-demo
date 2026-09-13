import { apagarTodos, listar, salvar } from "@/lib/historico";
import { buscarLeads, ErroApollo, QUANTIDADES_VALIDAS } from "@/lib/leads";
import { getConfig } from "@/lib/store";
import type { DadosBusca } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const segmento = String(body?.segmento || "").trim();
  const cargo = String(body?.cargo || "").trim();
  const localizacao = String(body?.localizacao || "").trim();
  const proposta = String(body?.proposta || "").trim();
  const porte = String(body?.porte || "51-200").trim();
  const quantidade = QUANTIDADES_VALIDAS.includes(Number(body?.quantidade)) ? Number(body.quantidade) : 10;

  if (!segmento || !cargo || !localizacao || !proposta) {
    return Response.json({ error: "Preencha segmento, cargo-alvo, localização e o que sua empresa vende." }, { status: 400 });
  }
  const dados: DadosBusca = { segmento, cargo, localizacao, porte, proposta, quantidade: String(quantidade) };
  const titulo = `Leads: ${cargo} em ${segmento}`;

  try {
    const { fonte, leads, meta: metaGerada } = await buscarLeads(dados);
    const id = salvar({ tipo: "leads", titulo, entrada: dados, saida: { fonte, leads }, meta: metaGerada });
    return Response.json({ fonte, leads, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const status = err instanceof ErroApollo ? 502 : 500;
    const mensagem = err instanceof Error ? err.message : "Não foi possível buscar os leads agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status });
  }
}

/** Últimas buscas salvas, para a lista "Últimos resultados" no painel; remetenteNome/remetenteEmpresa pré-preenchem "Seu nome"/"Sua empresa". */
export async function GET() {
  return Response.json({ itens: listar(10), remetenteNome: getConfig("REMETENTE_NOME"), remetenteEmpresa: getConfig("REMETENTE_EMPRESA") });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
