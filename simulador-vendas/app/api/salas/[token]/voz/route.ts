// A voz do cliente simulado, gerada no servidor (US-015).
//
// Existe por um motivo só: a chave da ElevenLabs **não pode ir para o navegador**. O link do treino é
// público — quem abre é o vendedor, sem conta —, então uma chave entregue à tela ficaria ao alcance de
// qualquer pessoa que recebeu o endereço no grupo do time. A tela manda o texto, o servidor devolve o
// áudio pronto e a chave nunca sai daqui.
//
// Sem chave configurada esta rota não é chamada: a sala usa a voz do próprio navegador
// (`speechSynthesis`), que é o padrão do app e não exige o gestor configurar nada.
import { conversaAberta } from "@/lib/sala-do-vendedor";
import { getConfig } from "@/lib/store";

/**
 * Voz de reserva, usada enquanto a voz por tipo de cliente (US-028) não existe. O gestor pode trocar
 * por outra da conta dele guardando `ELEVENLABS_VOICE_ID`; quando a US-028 chegar, a escolha passa a
 * vir da persona da sessão e esta constante fica só como último recurso.
 */
const VOZ_PADRAO = "21m00Tcm4TlvDq8ikWAM";

/** Modelo de baixa latência: numa conversa falada, esperar o áudio é pior que uma voz menos caprichada. */
const MODELO_VOZ = "eleven_flash_v2_5";

/** Uma fala do cliente tem 1 a 3 frases; o teto é só a barreira contra um pedido torto. */
const MAX_CARACTERES = 800;

/** A ElevenLabs demorar mais que isto é o mesmo que não responder: a sala cai na voz do navegador. */
const TEMPO_MAXIMO_MS = 12_000;

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/voz">) {
  const { token } = await params;

  // Mesma conferência das outras rotas da conversa: só quem está numa conversa aberta faz o servidor
  // gastar a cota de voz da conta do gestor.
  const lido = conversaAberta(req, token);
  if (lido instanceof Response) return lido;

  const chave = getConfig("ELEVENLABS_API_KEY");
  if (!chave) {
    return Response.json({ error: "Este treino usa a voz do seu próprio navegador." }, { status: 409 });
  }

  const corpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim().slice(0, MAX_CARACTERES) : "";
  if (!texto) return Response.json({ error: "Nada para falar." }, { status: 400 });

  const vozId = getConfig("ELEVENLABS_VOICE_ID") || VOZ_PADRAO;
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: MODELO_VOZ, language_code: "pt" }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!r.ok || !r.body) {
      // 409 e não 502: para a tela isto não é falha, é "fale você mesmo" — ela troca para a voz do
      // navegador e a conversa segue sem o vendedor perceber nada.
      console.error("ElevenLabs recusou gerar a voz do cliente", r.status);
      return Response.json({ error: "A voz do cliente vai sair pelo seu navegador." }, { status: 409 });
    }
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Falha ao gerar a voz do cliente", err);
    return Response.json({ error: "A voz do cliente vai sair pelo seu navegador." }, { status: 409 });
  }
}
