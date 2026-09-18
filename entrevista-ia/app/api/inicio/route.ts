// O que o Início mostra (US-022 da PRD), numa chamada só.
//
// Rota privada por não estar na lista de `rotaPublica()` do `proxy.ts`: é o processo seletivo inteiro,
// e quem o lê é a pessoa de RH. Nenhuma chamada de IA nasce aqui — ver `lib/inicio.ts`.
import { montarInicio } from "@/lib/inicio";

export async function GET() {
  return Response.json(montarInicio());
}
