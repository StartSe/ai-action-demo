// Em que pé está esta entrevista (US-019), do ponto de vista de quem acabou de conversar.
//
// Só a sala do agente conversacional precisa disto: lá a conversa acontece dentro do widget da
// ElevenLabs e a transcrição chega DEPOIS, pelo aviso de pós-conversa. Ao encerrar, a sala pergunta
// aqui de cinco em cinco segundos se a conversa já chegou, para trocar "Recebendo a sua conversa..."
// pelo agradecimento. No nível 2 nada disso é preciso: lá cada fala já passou por este servidor.
//
// Duas escolhas de propósito:
//
//  1. **Não escreve nada.** É uma sondagem repetida; escrever aqui seria escrever cinco vezes por
//     entrevista sem ninguém ter tocado em nada.
//  2. **Lê a entrevista pelo código, sem passar por `resolverConvite()`.** Um link de uso único conta
//     como "já usado" assim que a conversa é registrada — exatamente o instante que esta rota existe
//     para esperar. Quem sonda um link que acabou de cumprir o seu papel não pode receber 410.
import { NextResponse } from "next/server";
import { obterPorCodigo } from "@/lib/entrevistas";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/estado">) {
  const { token } = await params;
  const entrevista = obterPorCodigo(token);
  if (!entrevista) {
    return NextResponse.json({ error: "Este link não existe." }, { status: 404, headers: SEM_CACHE });
  }
  return NextResponse.json(
    {
      status: entrevista.status,
      /** A conversa já chegou inteira ao app — é o que a sala do agente espera para agradecer. */
      recebida: entrevista.status === "concluida" || entrevista.status === "avaliada",
    },
    { headers: SEM_CACHE }
  );
}
