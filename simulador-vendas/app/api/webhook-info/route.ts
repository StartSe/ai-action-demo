// Endereço público do aviso automático da ElevenLabs e quando a última conversa chegou por lá,
// para a tela mostrar o passo a passo em "Dados para a equipe técnica".
import { getConfig } from "@/lib/store";
import { baseUrl } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json({
    url: `${baseUrl(req)}/webhook/elevenlabs`,
    ultimaConversaEm: getConfig("ELEVENLABS_ULTIMA_CONVERSA_EM") ?? null,
  });
}
