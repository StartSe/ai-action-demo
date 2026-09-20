// Voz com ElevenLabs (transcrição, fala e ligações). Preenchido na etapa F do PLANO.md.
import type { Resultado } from "./conexoes-teste";
import { FlowError } from "./flow-store";
export async function testarElevenLabs(): Promise<Resultado> {
  return { ok: false, mensagem: "Voz ainda não está disponível nesta versão." };
}
export async function ligar(telefone: string, contexto: string): Promise<{ ok: boolean }> {
  void telefone;
  void contexto;
  throw new FlowError("Ligações ainda não estão disponíveis nesta versão.");
}
