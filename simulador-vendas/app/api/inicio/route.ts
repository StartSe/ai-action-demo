// O que o Início mostra (US-027), numa chamada só.
//
// Rota privada por não estar na lista de `rotaPublica()` do `proxy.ts`: são os números do time inteiro,
// e quem os lê é o gestor. Nenhuma chamada de IA nasce aqui — ver `lib/inicio.ts`.
import { montarInicio } from "@/lib/inicio";

export async function GET() {
  return Response.json(montarInicio());
}
