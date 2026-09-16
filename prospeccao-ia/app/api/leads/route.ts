import { responderErro } from "@/app/api/erros";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import { buscarLeads, QUANTIDADES_VALIDAS } from "@/lib/leads";
import { getConfig, setConfig } from "@/lib/store";
import { guardarUltimaBusca } from "@/lib/ultima-busca";
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
  const remetenteNome = String(body?.remetenteNome || "").trim();
  const remetenteEmpresa = String(body?.remetenteEmpresa || "").trim();
  if (remetenteNome) setConfig("REMETENTE_NOME", remetenteNome);
  if (remetenteEmpresa) setConfig("REMETENTE_EMPRESA", remetenteEmpresa);

  const dados: DadosBusca = { segmento, cargo, localizacao, porte, proposta, quantidade: String(quantidade), remetenteNome, remetenteEmpresa };
  const titulo = `Leads: ${cargo} em ${segmento}`;
  // Guardado para a rotina semanal criada pelo cartão genérico de /setup nascer com este perfil.
  guardarUltimaBusca(dados);

  try {
    const { fonte, leads, meta: metaGerada } = await buscarLeads(dados);
    const id = salvar({ tipo: "leads", titulo, entrada: dados, saida: { fonte, leads }, meta: metaGerada });
    return Response.json({ fonte, leads, meta: metaGerada, id });
  } catch (err) {
    return responderErro(err, "Não foi possível buscar os leads agora. Tente de novo em um minuto.");
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
