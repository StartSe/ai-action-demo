import { createHash } from "node:crypto";
import { getConfig, setConfig } from "./store";
import { provider, generate } from "./motor";
import { chatGPT } from "./chatgpt";
import { notes } from "./brain";
import { verifiedReadToolCount } from "./capture-permissions";
import type { SetupState } from "./capture-types";
import { BrainError } from "./api";

async function identity() {
  const p = provider();
  const credential =
    p === "openrouter"
      ? getConfig("OPENROUTER_API_KEY")
      : (await chatGPT().account()).account;
  return {
    connected: !!credential,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          p,
          credential,
          getConfig(
            p === "openrouter" ? "OPENROUTER_MODEL" : "CHATGPT_MODEL",
          ) || "",
        ]),
      )
      .digest("hex"),
  };
}
export async function setupState(): Promise<SetupState> {
  const hasMemory = notes().some((n) => !n.demo);
  const status = getConfig("ONBOARDING_STATUS");
  const ai = await identity();
  return {
    status:
      status === "complete" || status === "deferred"
        ? status
        : hasMemory
          ? "deferred"
          : "new",
    step: Math.min(4, Math.max(1, Number(getConfig("ONBOARDING_STEP")) || 1)),
    aiConnected: ai.connected,
    aiVerified:
      ai.connected && getConfig("ONBOARDING_AI_CHECK") === ai.fingerprint,
    zapier: !!getConfig("ZAPIER_MCP_URL"),
    readTools: verifiedReadToolCount(),
    hasMemory,
  };
}
export async function verifySetupAI(signal?: AbortSignal) {
  const before = await identity();
  if (!before.connected)
    throw new BrainError(
      "Conecte sua assinatura ChatGPT ou salve a chave do OpenRouter.",
    );
  await generate(
    "Responda apenas OK. Esta é uma verificação de conexão solicitada pelo usuário.",
    "Verificar conexão.",
    [],
    signal,
  );
  if ((await identity()).fingerprint !== before.fingerprint)
    throw new BrainError(
      "A conexão mudou durante o teste. Verifique novamente.",
    );
  setConfig("ONBOARDING_AI_CHECK", before.fingerprint);
  return setupState();
}
