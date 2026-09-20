// Voz com ElevenLabs (transcrição, fala e ligações). Preenchido na etapa F do PLANO.md.
import type { Resultado } from "./conexoes-teste";
export async function testarElevenLabs(): Promise<Resultado> {
  return { ok: false, mensagem: "Voz ainda não está disponível nesta versão." };
}
