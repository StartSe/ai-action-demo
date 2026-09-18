// "Começar a entrevista" (US-016 da PRD): o toque do candidato no botão das boas-vindas.
//
// Duas coisas acontecem aqui e em nenhum outro lugar: a entrevista passa a `aberta` (quem acompanha o
// processo vê "Link aberto") e este aparelho recebe o cookie assinado que o marca como o dono da
// conversa (lib/sessao-candidato.ts). É esse cookie que permite recarregar a página e continuar de
// onde parou, e que faz um segundo aparelho no mesmo link ser reconhecido como segundo aparelho.
//
// A autenticação é o próprio código do link — quem faz a entrevista não tem conta. E nenhuma frase
// daqui manda configurar coisa alguma: quem lê é o candidato.
import { NextResponse } from "next/server";
import { abrirSala, cookieDaSala } from "@/lib/sala-do-candidato";
import { ehSeguro } from "@/lib/sessao-candidato";
import { baseUrl } from "@/lib/setup-comum";

const SEM_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/abrir">) {
  const { token } = await params;
  const resultado = abrirSala(token, request.headers.get("cookie"));
  if (!resultado.ok) {
    return NextResponse.json(
      { error: `${resultado.titulo}. ${resultado.descricao}`, motivo: resultado.motivo },
      { status: resultado.status, headers: SEM_CACHE }
    );
  }

  const cabecalhos: Record<string, string> = { ...SEM_CACHE };
  const cookie = cookieDaSala(resultado, token, ehSeguro(baseUrl(request)));
  if (cookie) cabecalhos["Set-Cookie"] = cookie;
  return NextResponse.json({ ok: true }, { headers: cabecalhos });
}
