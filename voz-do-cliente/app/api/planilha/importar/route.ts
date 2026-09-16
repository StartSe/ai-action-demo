import { analisarESalvar, plural } from "@/lib/analise-salva";
import { respostaErroFonte, respostaVazia } from "@/lib/erro-fonte";
import { lerPlanilhaNps } from "@/lib/planilha-mcp";

/** "Ler a planilha agora" no painel: lê as respostas de NPS da planilha conectada (cartão "Fonte de dados (MCP)") e roda a mesma análise da tela principal. */
export async function POST() {
  try {
    const { comentarios, colunaNota } = await lerPlanilhaNps();
    if (!comentarios.length) {
      return respostaVazia("A planilha conectada não trouxe nenhuma linha com comentário. Confira a aba e as colunas em Configurações.");
    }
    const resposta = await analisarESalvar({
      comentarios,
      contexto: "respostas lidas da planilha conectada",
      insumo: (n) => `${plural(n, "resposta lida", "respostas lidas")} da planilha conectada`,
      titulo: (n) => `Análise da planilha de NPS (${plural(n, "resposta", "respostas")})`,
    });
    return Response.json({ ...resposta, colunaNota: colunaNota ?? null });
  } catch (err) {
    return respostaErroFonte(err);
  }
}
