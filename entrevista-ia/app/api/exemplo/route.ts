// Os dados de exemplo do modo demonstração (US-004). Privada: fica fora da lista de rotas públicas de
// proxy.ts, como toda rota do painel.
//
// `GET` diz se ainda existe exemplo no banco (é o que faz o cartão de Configurações aparecer só quando
// há o que apagar) e `DELETE` apaga o conjunto, devolvendo o app ao estado inicial vazio. Apagar não
// semeia de novo: a marca `DEMO_SEMEADA_V1` de lib/semear-demo.ts fica onde está.
//
// `POST` é o atalho `?exemplo=1` da suíte (US-025 da PRD): o botão "Testar com um exemplo" de
// Configurações e a captura do catálogo. Ele semeia mesmo com a marca gravada ou com a IA conectada,
// porque quem pediu foi uma pessoa — só não entra em instalação que já tem dado de verdade. Devolve o
// id da vaga a abrir, que é onde a demonstração se explica sozinha (a vaga com os candidatos).
import { contarExemplos, removerTudoDeExemplo } from "@/lib/exemplos";
import { ID_VAGA_EXEMPLO, semearDemonstracao } from "@/lib/semear-demo";
import { listar as listarVagas } from "@/lib/vagas";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ exemplos: contarExemplos() });
}

export async function POST() {
  semearDemonstracao(true);
  const exemplos = contarExemplos();
  // A vaga de exemplo tem id fixo, mas quem apagou só as vagas de exemplo (e manteve o resto) não a
  // tem mais: vale a primeira vaga marcada como exemplo que existir, e `null` quando não há nenhuma.
  const vagas = listarVagas({});
  const vaga = vagas.find((v) => v.id === ID_VAGA_EXEMPLO) ?? vagas.find((v) => v.exemplo) ?? null;
  return Response.json({ exemplos, vagaId: vaga?.id ?? null });
}

export async function DELETE() {
  const removidos = removerTudoDeExemplo();
  return Response.json({ removidos, exemplos: contarExemplos() });
}
