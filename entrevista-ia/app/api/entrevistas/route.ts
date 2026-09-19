// A lista de entrevistas (US-015) e a atribuição de um candidato a uma vaga com o convite junto
// (US-007 e US-014).
//
// Atribuir e convidar são um passo só: uma entrevista sem link é uma linha que não faz nada, e a
// pessoa de RH teria de lembrar de um segundo clique para o candidato existir do lado de fora.
// Convidar duas vezes o mesmo par não cria dois históricos: `criar()` devolve a entrevista que já
// vale (lib/entrevistas.ts) e o convite mantém o mesmo link enquanto ele não foi usado.
import { sessaoAtual } from "@/lib/conta";
import { atribuirEConvidar } from "@/lib/convite";
import { FAIXAS, painelDeEntrevistas, type FaixaEntrevista } from "@/lib/painel";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/** Os períodos que a tela oferece; qualquer outro valor (inclusive "tudo") não filtra nada. */
const DIAS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };

/**
 * A tela Entrevistas: uma aba, os filtros e a contagem de todas as abas.
 *
 * `expirarVencidas()` roda dentro da leitura (lib/entrevistas.ts), então abrir esta lista é o que faz
 * um convite vencido aparecer como vencido — o app não tem agendador próprio.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const pedida = params.get("faixa");
  const faixa = FAIXAS.includes(pedida as FaixaEntrevista) ? (pedida as FaixaEntrevista) : undefined;

  return Response.json(
    painelDeEntrevistas({
      faixa,
      vagaId: params.get("vagaId") || undefined,
      busca: params.get("busca") || undefined,
      dias: DIAS[params.get("dias") ?? ""],
    }),
  );
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  registrarEnderecoPublico(req);
  // As regras de "esta vaga aceita mais alguém?" moram em lib/convite.ts, não aqui: a ferramenta
  // criar_convite do MCP (US-027) entra pela mesma porta e tem de recusar exatamente o mesmo.
  const resultado = await atribuirEConvidar({
    vagaId: typeof corpo?.vagaId === "string" ? corpo.vagaId : "",
    candidatoId: typeof corpo?.candidatoId === "string" ? corpo.candidatoId : "",
    expiraEmDias: corpo?.expiraEmDias,
    origem: baseUrl(req),
    remetente: sessaoAtual(req)?.nome,
  });
  if (!resultado.ok) return Response.json({ error: resultado.erro }, { status: resultado.status });
  return Response.json({ entrevista: resultado.entrevista, convite: resultado.convite });
}
