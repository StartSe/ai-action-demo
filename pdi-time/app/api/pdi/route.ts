import { interpretarFalha, respostaErro } from "@/lib/ai";
import { apagarTodos, listar } from "@/lib/historico";
import { gerarPDI } from "@/lib/pdi";
import { getConfig, setConfig } from "@/lib/store";
import type { DadosPDI } from "@/lib/types";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Partial<DadosPDI> & { guardar?: boolean };
  const { nome, cargo, tempo, entregas, objetivos, aspiracoes, dataConversa, preparadoPor, guardar } = corpo;
  if (!nome || !cargo || !entregas || !objetivos) {
    return Response.json({ error: "Preencha nome, cargo, entregas recentes e objetivos da empresa." }, { status: 400 });
  }
  const dados: DadosPDI = { nome, cargo, tempo: tempo || "", entregas, objetivos, aspiracoes, dataConversa, preparadoPor };
  if (preparadoPor) setConfig("NOME_USUARIO", preparadoPor);
  try {
    // Caso de demonstração local para capturar a tela do ErrorBox (só em dev, nunca em produção).
    if (process.env.NODE_ENV !== "production" && new URL(req.url).searchParams.get("erro") === "sem_credito") {
      throw interpretarFalha(new Response(null, { status: 402 }), "");
    }
    const resultado = await gerarPDI(dados, { guardar });
    return Response.json(resultado);
  } catch (err) {
    return respostaErro(err);
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel; nomeUsuario pré-preenche "Seu nome". */
export async function GET() {
  return Response.json({ itens: listar(10), nomeUsuario: getConfig("NOME_USUARIO") });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
