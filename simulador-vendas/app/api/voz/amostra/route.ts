// "Ouvir uma amostra" do cartão "Voz do cliente" (US-028).
//
// O gestor clica e ouve o tipo de cliente falando uma frase típica dele, com a mesma voz e os mesmos
// ajustes que o vendedor vai ouvir no treino — o áudio sai de `falaDoCliente`, a mesma função da sala.
// Sem a ElevenLabs conectada a resposta é 409 e a tela fala pelo próprio navegador: é o caminho padrão
// do app, não um erro.
import { persona } from "@/lib/personas";
import { falaDoCliente, MAX_CARACTERES } from "@/lib/vozes";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { persona?: unknown } | null;
  const escolhida = typeof corpo?.persona === "string" ? persona(corpo.persona) : undefined;
  if (!escolhida) return Response.json({ error: "Escolha um tipo de cliente para ouvir." }, { status: 400 });

  const texto = (escolhida.frasesTipicas[0] ?? escolhida.comportamento).slice(0, MAX_CARACTERES);
  const audio = await falaDoCliente({ texto, personaId: escolhida.id });
  if (!audio) return Response.json({ error: "A amostra vai sair pela voz do seu navegador." }, { status: 409 });
  return audio;
}
