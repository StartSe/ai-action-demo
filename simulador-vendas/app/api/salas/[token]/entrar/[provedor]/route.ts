// Começo da identificação do vendedor por Google ou Microsoft (US-013): /api/salas/<código>/entrar/google
// e .../entrar/microsoft. Rota pública (proxy.ts já libera /api/salas/*) — quem treina não tem conta.
//
// Nada é decidido aqui além de "para onde mandar a pessoa": o participante só nasce na volta, em
// app/api/salas/entrar/[provedor]/callback. Qualquer recusa volta para o próprio link do treino com
// uma frase de negócio, porque o vendedor não tem como abrir Configurações nem ler um erro técnico.
import { ehProvedor, gerarVerifier, montarState, urlDeAutorizacao } from "@/lib/entrar-vendedor";
import { ehSeguro } from "@/lib/sessao-vendedor";
import { baseUrl } from "@/lib/setup-comum";
import { obter as obterSimulacao } from "@/lib/simulacoes";

/** Guarda o verificador PKCE e o trecho aleatório do `state` pelos 10 minutos que a ida e volta leva. */
const MINUTOS = 10;

export async function GET(req: Request, { params }: RouteContext<"/api/salas/[token]/entrar/[provedor]">) {
  const { token, provedor } = await params;
  const base = baseUrl(req);
  const voltar = (erro: string) => new Response(null, { status: 302, headers: { Location: `${base}/simular/${token}?erro=${encodeURIComponent(erro)}` } });

  if (!ehProvedor(provedor)) return voltar("Essa forma de entrar não existe. Informe seu nome e e-mail para começar.");

  const simulacao = obterSimulacao(token);
  if (!simulacao || simulacao.status !== "ativa") {
    return new Response(null, { status: 302, headers: { Location: `${base}/simular/${token}` } });
  }

  const verifier = gerarVerifier();
  const { state, aleatorio } = montarState(token);
  const destino = urlDeAutorizacao({ provedor, base, state, verifier });
  if (!destino) return voltar("Essa forma de entrar não está disponível neste treino. Informe seu nome e e-mail para começar.");

  const seguro = ehSeguro(base) ? "; Secure" : "";
  const headers = new Headers({ Location: destino });
  headers.append("Set-Cookie", `sv_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MINUTOS * 60}${seguro}`);
  headers.append("Set-Cookie", `sv_state=${aleatorio}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MINUTOS * 60}${seguro}`);
  return new Response(null, { status: 302, headers });
}
