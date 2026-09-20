// Canal WhatsApp (Z-API, Meta oficial e ZapperHub). Preenchido na etapa E do PLANO.md.
import type { Resultado } from "./conexoes-teste";
export async function testarWhatsApp(): Promise<Resultado> {
  return { ok: false, mensagem: "Envio pelo WhatsApp ainda não está disponível nesta versão." };
}
