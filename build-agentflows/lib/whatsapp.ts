// Canal WhatsApp (Z-API, Meta oficial e ZapperHub). Preenchido na etapa E do PLANO.md.
import type { Resultado } from "./conexoes-teste";
import { FlowError } from "./flow-store";
export async function testarWhatsApp(): Promise<Resultado> {
  return { ok: false, mensagem: "Envio pelo WhatsApp ainda não está disponível nesta versão." };
}
export async function enviarMensagem(para: string, texto: string): Promise<void> {
  void para;
  void texto;
  throw new FlowError("Envio pelo WhatsApp ainda não está disponível nesta versão.");
}
