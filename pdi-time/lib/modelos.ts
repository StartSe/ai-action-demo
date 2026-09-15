// Lista de modelos do OpenRouter usada tanto por lib/setup-comum.ts (Server) quanto por components/ui.tsx
// (Client, em ErrorBox: "Usar um modelo gratuito"). Sem nenhum import node:*, mesmo padrão de lib/conta-comum.ts.
export type Opcao = { valor: string; rotulo: string };

export const MODELOS_GRATUITOS: Opcao[] = [
  { valor: "nvidia/nemotron-3-super-120b-a12b:free", rotulo: "Nemotron 3 Super 120B (gratuito, padrão)" },
  { valor: "google/gemma-4-31b-it:free", rotulo: "Gemma 4 31B (gratuito)" },
  { valor: "nvidia/nemotron-3-ultra-550b-a55b:free", rotulo: "Nemotron 3 Ultra 550B (gratuito)" },
  { valor: "anthropic/claude-sonnet-4.5", rotulo: "Claude Sonnet 4.5 (pago, mais qualidade)" },
  { valor: "openai/gpt-5-mini", rotulo: "GPT-5 mini (pago)" },
];

/** Modelos com suporte a imagem no OpenRouter. Verificado em 2026-09-14 em openrouter.ai/models (filtro "image" em input modalities); primeiro gratuito. */
export const MODELOS_VISAO: Opcao[] = [
  { valor: "inclusionai/ling-3.0-flash-vl:free", rotulo: "Ling 3.0 Flash VL (gratuito, padrão)" },
  { valor: "nex-agi/nex-n2.5-pro:free", rotulo: "Nex N2.5 Pro (gratuito)" },
  { valor: "anthropic/claude-sonnet-4.5", rotulo: "Claude Sonnet 4.5 (pago, mais qualidade)" },
];
