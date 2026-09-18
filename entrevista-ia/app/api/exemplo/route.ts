// Os dados de exemplo do modo demonstração (US-004). Privada: fica fora da lista de rotas públicas de
// proxy.ts, como toda rota do painel.
//
// `GET` diz se ainda existe exemplo no banco (é o que faz o cartão de Configurações aparecer só quando
// há o que apagar) e `DELETE` apaga o conjunto, devolvendo o app ao estado inicial vazio. Apagar não
// semeia de novo: a marca `DEMO_SEMEADA_V1` de lib/semear-demo.ts fica onde está.
import { contarExemplos, removerTudoDeExemplo } from "@/lib/exemplos";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ exemplos: contarExemplos() });
}

export async function DELETE() {
  const removidos = removerTudoDeExemplo();
  return Response.json({ removidos, exemplos: contarExemplos() });
}
