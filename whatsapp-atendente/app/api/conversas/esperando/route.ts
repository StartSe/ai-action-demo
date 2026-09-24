// Quantas conversas estão esperando uma pessoa e quantas já passaram do limite da operação (US-017).
// É a consulta mais leve do app: o cabeçalho de TODA tela a faz de minuto em minuto (e a cada aviso do
// servidor), então ela devolve três números e nada mais — nenhuma mensagem, nenhuma etiqueta.
import { esperasAbertas } from "@/lib/conversas";
import { getConfig } from "@/lib/estado";
import { passouDoLimite } from "@/lib/espera";

export const dynamic = "force-dynamic";

export async function GET() {
  const limiteMin = getConfig().avisoEsperaMin;
  const abertas = esperasAbertas();
  return Response.json({
    // O contador do cabeçalho continua sendo o de quem a IA passou para uma pessoa e ninguém assumiu.
    atencao: abertas.filter((e) => e.status === "atencao").length,
    esperando: abertas.length,
    atrasadas: abertas.filter((e) => passouDoLimite(e.esperandoDesde, limiteMin)).length,
    limiteMin,
  });
}
