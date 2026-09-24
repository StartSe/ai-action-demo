// PATCH corrige o tipo de uma ou mais colunas da planilha já enviada.
//
// Nenhuma heurística acerta todo arquivo: um código sem zero à esquerda e sem palavra reconhecível
// no cabeçalho passa por medida, e uma coluna de datas escritas de um jeito estranho vira texto.
// Sem esta rota a pessoa via o erro na tela de conferência e não tinha o que fazer.
//
// O arquivo é lido de novo a partir do texto cru guardado: converter de volta o valor já convertido
// seria perda (o "R$ 21.572,39" virou 21572.39 e não dá para saber que era dinheiro).
import { obterDados, obterTexto, regravarDados } from "@/lib/dados-store";
import { lerPlanilha, resumoDeDados, type TiposForcados } from "@/lib/planilha";

const TIPOS = ["numero", "data", "texto"] as const;

export async function PATCH(req: Request, { params }: RouteContext<"/api/dados/[id]">) {
  const { id } = await params;
  const dados = obterDados(id);
  const texto = obterTexto(id);
  if (!dados || !texto) {
    return Response.json({ error: "Não encontrei essa planilha. Envie o arquivo de novo." }, { status: 404 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { tipos?: unknown };
  const pedido = corpo.tipos && typeof corpo.tipos === "object" && !Array.isArray(corpo.tipos) ? (corpo.tipos as Record<string, unknown>) : null;
  if (!pedido) return Response.json({ error: "Diga quais colunas mudar." }, { status: 400 });

  const forcados: TiposForcados = {};
  for (const [chave, tipo] of Object.entries(pedido)) {
    if (!dados.colunas.some((c) => c.chave === chave)) {
      return Response.json({ error: `A coluna "${chave}" não existe neste arquivo.` }, { status: 400 });
    }
    const escolhido = TIPOS.find((t) => t === tipo);
    if (!escolhido) return Response.json({ error: `Tipo desconhecido para "${chave}".` }, { status: 400 });
    forcados[chave] = escolhido;
  }

  const novo = lerPlanilha(texto, dados.nome, dados.codificacao, forcados);
  regravarDados(id, novo);
  return Response.json({
    id,
    nome: novo.nome,
    linhas: novo.linhas.length,
    totalLinhas: novo.totalLinhas,
    truncado: novo.truncado,
    codificacao: novo.codificacao,
    resumo: resumoDeDados(novo),
    colunas: novo.colunas.map((c) => ({
      chave: c.chave,
      rotulo: c.rotulo,
      tipo: c.tipo,
      preenchidos: c.preenchidos,
      distintos: c.distintos,
      descartados: c.descartados,
      identificador: c.identificador ?? false,
    })),
  });
}
