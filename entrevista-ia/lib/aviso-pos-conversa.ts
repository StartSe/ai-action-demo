// Estado do aviso automático de pós-conversa da ElevenLabs (app/webhook/elevenlabs): quando a última
// conversa chegou e o que travou na última tentativa recusada. Fica num arquivo próprio porque um
// route.ts do Next só aceita exports de handler — a rota do aviso e GET /api/webhook-info leem daqui.
//
// Sem isto, uma entrevista feita pelo agente que nunca volta fica sem explicação nenhuma: a pessoa de
// RH vê o candidato parado em "Link aberto" e não tem como saber que o segredo não foi colado.
import { getConfig, setConfig } from "./store";

const CHAVE_ULTIMA_CONVERSA = "ELEVENLABS_ULTIMA_CONVERSA_EM";
const CHAVE_ULTIMO_ERRO = "ELEVENLABS_ULTIMO_ERRO_WEBHOOK";

export type Recusa = { em: string; motivo: string };

/** Guarda a última tentativa recusada, com o motivo em linguagem de negócio. */
export function registrarRecusa(motivo: string): void {
  setConfig(CHAVE_ULTIMO_ERRO, JSON.stringify({ em: new Date().toISOString(), motivo }));
}

/** Marca uma conversa recebida com sucesso e limpa a recusa anterior. */
export function registrarConversaRecebida(quando: string): void {
  setConfig(CHAVE_ULTIMA_CONVERSA, quando);
  setConfig(CHAVE_ULTIMO_ERRO, "");
}

export function ultimaConversaEm(): string | null {
  return getConfig(CHAVE_ULTIMA_CONVERSA) ?? null;
}

export function ultimaRecusa(): Recusa | null {
  const bruto = getConfig(CHAVE_ULTIMO_ERRO);
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as Partial<Recusa>;
    return lido.em && lido.motivo ? { em: lido.em, motivo: lido.motivo } : null;
  } catch {
    return null;
  }
}
