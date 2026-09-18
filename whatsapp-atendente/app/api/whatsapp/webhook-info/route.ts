// Valores técnicos da conexão do número, mostrados só dentro de "Para a equipe técnica" no cartão
// "Conectar o WhatsApp" de /setup: o endereço e o valor de verificação da Meta (caminho avançado),
// o endereço por onde a z-api avisa este app (com a chave, para cadastro à mão quando o cadastro
// automático do PUT /api/setup falhou) e o diagnóstico da conexão — última mensagem recebida do
// número real e última falha de envio.
import { verifyTokenWhatsApp } from "@/lib/integracoes";
import { baseUrl } from "@/lib/setup-comum";
import { ultimaFalhaEnvio, ultimaRecebida } from "@/lib/whatsapp";
import { enderecoAvisos } from "@/lib/zapi";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json({
    url: `${baseUrl(req)}/webhook`,
    verifyToken: verifyTokenWhatsApp(),
    urlAvisos: enderecoAvisos(baseUrl(req)),
    ultimaRecebida: ultimaRecebida(),
    ultimaFalha: ultimaFalhaEnvio(),
  });
}
