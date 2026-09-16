// Endereço público do webhook, valor de verificação gerado e diagnóstico da conexão com o número
// real (última mensagem recebida, última falha de envio), para o cartão "Ligar o número na Meta" de /setup.
import { verifyTokenWhatsApp } from "@/lib/integracoes";
import { baseUrl } from "@/lib/setup-comum";
import { ultimaFalhaEnvio, ultimaRecebida } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json({
    url: `${baseUrl(req)}/webhook`,
    verifyToken: verifyTokenWhatsApp(),
    ultimaRecebida: ultimaRecebida(),
    ultimaFalha: ultimaFalhaEnvio(),
  });
}
