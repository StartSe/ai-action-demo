// A lista de vagas e a abertura de uma vaga nova (US-005). Privada: fica fora da lista de rotas
// públicas de proxy.ts, como toda rota do painel.
//
// A validação não mora aqui: `validarVaga` (lib/vagas.ts) é quem sabe o que é um cargo grande demais
// ou uma faixa salarial invertida, porque a mesma regra precisa valer para esta rota, para o
// assistente (MCP) e para qualquer porta que venha depois.
import { CONTAGEM_VAZIA, contarPorVaga } from "@/lib/entrevistas";
import { criar, listar, validarVaga, type StatusVaga } from "@/lib/vagas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pedido = new URL(req.url).searchParams.get("status");
  const status: StatusVaga | undefined = pedido === "aberta" || pedido === "encerrada" ? pedido : undefined;

  // Uma consulta agregada para a lista inteira, nunca uma por cartão.
  const contagens = contarPorVaga();
  const itens = listar({ status }).map((vaga) => ({ ...vaga, candidatos: contagens[vaga.id] ?? CONTAGEM_VAZIA }));
  return Response.json({ itens });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const validacao = validarVaga(corpo);
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });
  return Response.json({ vaga: criar(validacao.campos) });
}
