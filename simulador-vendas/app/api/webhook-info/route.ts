// Endereço público do aviso automático da ElevenLabs, quando a última conversa chegou por lá e o que
// travou na última tentativa recusada, para a tela mostrar o passo a passo em "Dados para a equipe
// técnica" e explicar por que uma análise não chegou.
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { ligacoesSemAnalise } from "@/lib/salas";
import { conversasSemAvaliacao } from "@/lib/sessoes";
import { ultimaConversaEm, ultimaRecusa } from "@/lib/aviso-pos-conversa";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  registrarEnderecoPublico(req);
  return Response.json({
    url: `${baseUrl(req)}/webhook/elevenlabs`,
    ultimaConversaEm: ultimaConversaEm(),
    ultimaRecusa: ultimaRecusa(),
    // As duas contagens somam porque a pergunta do gestor é uma só ("alguma conversa por voz ficou
    // sem avaliação?"): `sessoes_treino` responde pelos treinos de hoje e `salas` pelos links antigos.
    conversasSemAvaliacao: conversasSemAvaliacao() + ligacoesSemAnalise(),
  });
}
