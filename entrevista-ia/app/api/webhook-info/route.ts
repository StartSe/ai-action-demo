// Endereço público do aviso automático da ElevenLabs, quando a última conversa chegou por lá e o que
// travou na última tentativa recusada — o cartão "Dados para a equipe técnica" em Configurações.
//
// É a única forma de saber, de dentro do app, que uma entrevista feita pelo agente não voltou: quem
// olha a lista de entrevistas só vê o candidato parado em "Link aberto".
import { ultimaConversaEm, ultimaRecusa } from "@/lib/aviso-pos-conversa";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  registrarEnderecoPublico(req);
  return Response.json({
    url: `${baseUrl(req)}/webhook/elevenlabs`,
    ultimaConversaEm: ultimaConversaEm(),
    ultimaRecusa: ultimaRecusa(),
  });
}
