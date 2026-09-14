// Gravação de faturas de ferramentas de IA em lib/faturas.ts. Aceita dois formatos de corpo:
// - uma fatura (campos soltos), do "Lançar manualmente" em Mais detalhes do painel — origem "manual";
// - { faturas: [...] } com várias, do "Confirmar tudo" da prévia de upload (US-020) — origem "upload".
// Leituras automáticas de e-mail (US-021) gravam direto pela lib, sem passar por aqui.
// A deduplicação (fornecedor + valor + data) é feita por lib/faturas.ts: enviar a mesma nota duas vezes
// não cria fatura nova, só devolve a existente.
import { converterParaBRL } from "@/lib/integracoes";
import { salvar } from "@/lib/faturas";
import { dataValida, interpretarValor } from "@/lib/leitor";
import type { Fatura, Moeda } from "@/lib/types";

export const dynamic = "force-dynamic";

const MOEDAS_VALIDAS: Moeda[] = ["BRL", "USD", "EUR"];
const PERIODICIDADES: Fatura["periodicidade"][] = ["mensal", "anual", "unica"];
const ORIGENS: Fatura["origem"][] = ["manual", "upload"];
const MAXIMO_POR_CHAMADA = 50;

type Entrada = Record<string, unknown>;

/** Valida uma fatura vinda do cliente; devolve a mensagem de erro (português) ou o registro pronto para salvar. */
function validar(body: Entrada, origemPadrao: Fatura["origem"]): { erro: string } | { fatura: Omit<Fatura, "id" | "criadoEm"> } {
  const fornecedor = String(body.fornecedor || "").trim();
  const ferramenta = String(body.ferramenta || "").trim();
  const valor = Math.round(interpretarValor(body.valor) * 100) / 100;
  const moeda: Moeda = MOEDAS_VALIDAS.includes(body.moeda as Moeda) ? (body.moeda as Moeda) : "BRL";
  const data = String(body.data || "").trim();
  const periodicidade = PERIODICIDADES.includes(body.periodicidade as Fatura["periodicidade"]) ? (body.periodicidade as Fatura["periodicidade"]) : "mensal";
  const origem = ORIGENS.includes(body.origem as Fatura["origem"]) ? (body.origem as Fatura["origem"]) : origemPadrao;
  const categoria = String(body.categoria || "").trim() || (origem === "manual" ? "Lançamento manual" : "Outra");
  const referencia = String(body.referencia || "").trim() || undefined;

  if (!fornecedor) return { erro: "Informe o fornecedor." };
  if (!ferramenta) return { erro: "Informe a ferramenta." };
  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe um valor maior que zero." };
  if (!dataValida(data)) return { erro: "Informe uma data válida." };

  return {
    fatura: {
      fornecedor,
      ferramenta,
      categoria,
      valor,
      moeda,
      valorBRL: converterParaBRL(valor, moeda),
      data,
      periodicidade,
      origem,
      referencia,
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Entrada | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Envie os dados da fatura." }, { status: 400 });

  // Várias de uma vez (prévia do upload).
  if (Array.isArray(body.faturas)) {
    const lista = body.faturas as Entrada[];
    if (lista.length === 0) return Response.json({ error: "Nenhuma fatura para confirmar." }, { status: 400 });
    if (lista.length > MAXIMO_POR_CHAMADA) return Response.json({ error: `Confirme até ${MAXIMO_POR_CHAMADA} faturas por vez.` }, { status: 400 });

    const validadas: Omit<Fatura, "id" | "criadoEm">[] = [];
    for (let i = 0; i < lista.length; i++) {
      const r = validar(lista[i] || {}, "upload");
      if ("erro" in r) return Response.json({ error: `Fatura ${i + 1}: ${r.erro}` }, { status: 400 });
      validadas.push(r.fatura);
    }
    // Só grava depois de validar todas: ou entra tudo, ou nada.
    const faturas = validadas.map((f) => salvar(f));
    return Response.json({ faturas, gravadas: faturas.length });
  }

  const r = validar(body, "manual");
  if ("erro" in r) return Response.json({ error: r.erro }, { status: 400 });
  const fatura = salvar(r.fatura);
  return Response.json({ fatura });
}
