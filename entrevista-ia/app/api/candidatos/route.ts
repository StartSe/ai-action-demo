// A lista de candidatos (US-008 em diante). Nasce aqui na US-007, na forma mínima de que o diálogo
// "Adicionar candidato" da vaga precisa: buscar por nome entre quem já está cadastrado.
//
// `listar()` devolve o candidato sem `cvTexto` e sem `cvArquivo` (lib/candidatos.ts): a busca de um
// diálogo não pode carregar megabytes de currículo para mostrar uma lista de nomes.
import { listar } from "@/lib/candidatos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const busca = new URL(req.url).searchParams.get("busca") ?? undefined;
  return Response.json({ itens: listar({ busca }) });
}
