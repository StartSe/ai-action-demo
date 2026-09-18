// O cartão "Voz do cliente" das Configurações (US-028): estado da conexão, o interruptor da voz por
// tipo de cliente e o que a tela precisa para tocar uma amostra sozinha.
//
// Rota privada (fora da lista de `proxy.ts`), ao contrário da voz da conversa: aqui quem está do outro
// lado é o gestor, dentro das Configurações.
import { integracaoConfigurada } from "@/lib/setup-comum";
import { ELEVENLABS_AGENTE } from "@/lib/integracoes";
import { PERSONAS, rotulo } from "@/lib/personas";
import { caracteristicasEmUso, definirVozPorPersona, vozDoNavegador, vozPorPersonaLigada } from "@/lib/vozes";
import { getConfig } from "@/lib/store";

/** O que o cartão mostra e o que ele usa para falar pelo navegador quando não há voz da nuvem. */
function estado() {
  return {
    // A voz da nuvem precisa só da chave; o agente conversacional (o resto do cartão da ElevenLabs) é
    // outra coisa e pode estar pela metade sem impedir a voz de funcionar.
    conectado: Boolean(getConfig("ELEVENLABS_API_KEY")),
    agente: integracaoConfigurada(ELEVENLABS_AGENTE),
    porPersona: vozPorPersonaLigada(),
    personas: PERSONAS.map((p) => ({
      persona: p.id,
      rotulo: rotulo(p),
      frase: p.frasesTipicas[0],
      // Com o interruptor desligado, os sete vêm com os mesmos números de propósito: a amostra tem
      // de soar como o vendedor vai ouvir, não como poderia soar.
      ...vozDoNavegador(caracteristicasEmUso(p.id)),
    })),
  };
}

export async function GET() {
  return Response.json(estado());
}

export async function PUT(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { ligado?: unknown };
  if (typeof corpo.ligado !== "boolean") {
    return Response.json({ error: "Escolha se cada tipo de cliente deve ter a sua própria voz." }, { status: 400 });
  }
  definirVozPorPersona(corpo.ligado);
  return Response.json(estado());
}
