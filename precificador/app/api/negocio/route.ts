// O negócio inteiro numa chamada: dados, custos fixos e canais. A tela Negócio edita tudo junto e
// salva de uma vez, então não faz sentido três rotas e três round-trips.
import { definirCanais, listarCanais, type DadosCanal } from "@/lib/canais";
import { definirCustosFixos, garantirNegocio, listarCustosFixos, obterNegocio, salvarNegocio, type DadosCustoFixo, type DadosNegocio } from "@/lib/negocio";

export const dynamic = "force-dynamic";

export async function GET() {
  const negocio = obterNegocio();
  if (!negocio) return Response.json({ negocio: null, custosFixos: [], canais: [] });
  return Response.json({ negocio, custosFixos: listarCustosFixos(negocio.id), canais: listarCanais(negocio.id) });
}

type Corpo = { negocio?: Partial<DadosNegocio>; custosFixos?: DadosCustoFixo[]; canais?: DadosCanal[] };

export async function PUT(req: Request) {
  const corpo = (await req.json().catch(() => null)) as Corpo | null;
  if (!corpo || typeof corpo !== "object") {
    return Response.json({ error: "Não foi possível ler os dados enviados." }, { status: 400 });
  }
  if (corpo.custosFixos && !Array.isArray(corpo.custosFixos)) {
    return Response.json({ error: "A lista de custos fixos veio em um formato inesperado." }, { status: 400 });
  }
  if (corpo.canais && !Array.isArray(corpo.canais)) {
    return Response.json({ error: "A lista de canais veio em um formato inesperado." }, { status: 400 });
  }
  if (corpo.canais && corpo.canais.filter((c) => String(c?.nome || "").trim()).length === 0) {
    return Response.json({ error: "Deixe pelo menos um canal de venda cadastrado." }, { status: 400 });
  }

  try {
    const negocio = corpo.negocio ? salvarNegocio(corpo.negocio) : garantirNegocio();
    const custosFixos = corpo.custosFixos ? definirCustosFixos(negocio.id, corpo.custosFixos) : listarCustosFixos(negocio.id);
    const canais = corpo.canais ? definirCanais(negocio.id, corpo.canais) : listarCanais(negocio.id);
    return Response.json({ negocio, custosFixos, canais });
  } catch (err) {
    console.error("Falha ao salvar o negócio", err);
    return Response.json({ error: "Não foi possível salvar o negócio agora. Tente de novo." }, { status: 500 });
  }
}
