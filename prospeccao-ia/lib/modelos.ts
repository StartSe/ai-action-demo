// Lista de modelos do OpenRouter usada tanto por lib/setup-comum.ts (Server) quanto por components/ui.tsx
// (Client, em ErrorBox: "Usar um modelo gratuito"). Sem nenhum import node:*, mesmo padrão de lib/conta-comum.ts.
//
// Divergência registrada em scripts/padrao-excecoes.json (prospeccao-ia): além da rede de segurança da suíte,
// este app cura o catálogo vivo do OpenRouter (organizarModelos) para os modelos pagos mais procurados
// (GPT-5.4 Mini, Gemini, Claude, DeepSeek...) aparecerem num grupo próprio, "Mais usados", em vez de só
// os doze de maior contexto — o critério antigo escondia justamente os modelos que as pessoas conhecem.
export type Opcao = { valor: string; rotulo: string; /** Agrupamento do <select> em lib/setup-comum.ts/components/setup.tsx (só usado por MODELOS_GRATUITOS). */ grupo?: "recomendado" | "gratuito" | "destaque" | "pago" };

/** Um próximo passo sugerido (integração ainda não configurada): usado pelo popover "Faz mais com..." da
 * Topbar (components/ui.tsx) e pelo cartão "Tudo pronto" de /setup. Mora aqui (não em lib/setup-comum.ts,
 * o dono natural) porque o caminho desse módulo contém "/setup", que scripts/verificar-jargao.mjs trata
 * como jargão técnico ao ser importado por um componente varrido pelo script (ui.tsx não é isento, ao
 * contrário de setup.tsx). */
export type ProximoPasso = { id: string; titulo: string; beneficio: string; url: string };

/** Valor de "Automático" nos campos de modelo de /setup: deixa o app escolher (o modelo padrão de
 * lib/ai.ts; na tarefa de avaliação, o modelo da tarefa padrão). Precisa de um valor de verdade porque
 * app/api/setup/route.ts trata string vazia como "não mexa neste campo". */
export const MODELO_AUTOMATICO = "auto";

/** Rede de segurança do menu de modelos (sem chave salva ou catálogo fora do ar). Ids conferidos em
 * openrouter.ai/api/v1/models em 2026-09-20. O nome do array é histórico (components/ui.tsx importa
 * MODELOS_GRATUITOS e procura o primeiro ":free" diferente do atual): hoje ele mistura gratuitos e pagos. */
export const MODELOS_GRATUITOS: Opcao[] = [
  { valor: "nvidia/nemotron-3-super-120b-a12b:free", rotulo: "Nemotron 3 Super 120B (gratuito, padrão)", grupo: "recomendado" },
  { valor: "google/gemma-4-31b-it:free", rotulo: "Gemma 4 31B (gratuito)", grupo: "gratuito" },
  { valor: "nvidia/nemotron-3-ultra-550b-a55b:free", rotulo: "Nemotron 3 Ultra 550B (gratuito)", grupo: "gratuito" },
  { valor: "nvidia/nemotron-3.5-lightning:free", rotulo: "Nemotron 3.5 Lightning (gratuito)", grupo: "gratuito" },
  { valor: "openai/gpt-5.4-mini", rotulo: "GPT-5.4 Mini (pago, rápido)", grupo: "destaque" },
  { valor: "openai/gpt-5.4", rotulo: "GPT-5.4 (pago, mais qualidade)", grupo: "destaque" },
  { valor: "google/gemini-3.8-flash", rotulo: "Gemini 3.8 Flash (pago, rápido)", grupo: "destaque" },
  { valor: "google/gemini-3.1-pro-preview", rotulo: "Gemini 3.1 Pro (pago, mais qualidade)", grupo: "destaque" },
  { valor: "anthropic/claude-sonnet-5", rotulo: "Claude Sonnet 5 (pago, mais qualidade)", grupo: "destaque" },
  { valor: "deepseek/deepseek-v4.1-flash", rotulo: "DeepSeek V4.1 Flash (pago, econômico)", grupo: "destaque" },
];

/** Modelos pagos mais procurados, na ordem em que aparecem em "Mais usados". Só entram no menu quando o
 * catálogo vivo do OpenRouter os confirma (organizarModelos): um id que sair do ar some sozinho da lista. */
export const DESTAQUES_PAGOS = [
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4",
  "openai/gpt-5.6-luna",
  "google/gemini-3.8-flash",
  "google/gemini-3.1-pro-preview",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4.5",
  "deepseek/deepseek-v4.1-flash",
  "x-ai/grok-4.6",
  "meta-llama/llama-4-maverick",
  "mistralai/mistral-medium-3-5",
  "qwen/qwen3.8-flash",
];

/** Modelos com suporte a imagem no OpenRouter. Verificado em 2026-09-14 em openrouter.ai/models (filtro "image" em input modalities); primeiro gratuito. */
export const MODELOS_VISAO: Opcao[] = [
  { valor: "inclusionai/ling-3.0-flash-vl:free", rotulo: "Ling 3.0 Flash VL (gratuito, padrão)" },
  { valor: "nex-agi/nex-n2.5-pro:free", rotulo: "Nex N2.5 Pro (gratuito)" },
  { valor: "anthropic/claude-sonnet-4.5", rotulo: "Claude Sonnet 4.5 (pago, mais qualidade)" },
];

/** Uma entrada do catálogo GET /api/v1/models do OpenRouter, só com o que o menu usa. */
export type ModeloCatalogo = { id: string; name?: string; context_length?: number };

/** Quantos modelos de cada grupo aberto (gratuitos, outros pagos) entram no menu: o catálogo tem centenas,
 * e uma lista que ninguém consegue percorrer é tão inútil quanto uma lista fixa. Os maiores de contexto primeiro. */
const MODELOS_POR_GRUPO = 12;

/** Variantes que não servem a uma conversa de texto e só poluem o menu: lote (":batch"), imagem, áudio,
 * voz, moderação e segurança, código e embeddings. */
const FORA_DO_CHAT = /(:batch$|image|audio|tts|transcribe|realtime|embed|guard|safety|moderation|codex|-code\b|coder|devstral|codestral|vision-exp)/i;

/** Monta as opções do menu de modelo a partir do catálogo vivo: o padrão do app ("Recomendado"), os
 * gratuitos de maior contexto, os pagos mais procurados (DESTAQUES_PAGOS, na ordem, só os que existem no
 * catálogo) e, por fim, os demais pagos de maior contexto. Pura e sem node:*, para ser testável. */
export function organizarModelos(catalogo: ModeloCatalogo[], padrao: string): Opcao[] {
  const uteis = catalogo.filter((m) => typeof m.id === "string" && m.id.includes("/") && !FORA_DO_CHAT.test(m.id));
  const porContexto = (a: ModeloCatalogo, b: ModeloCatalogo) => (b.context_length ?? 0) - (a.context_length ?? 0);
  const opcao = (m: ModeloCatalogo, grupo: Opcao["grupo"]): Opcao => ({ valor: m.id, rotulo: m.name || m.id, grupo });
  const gratuito = (m: ModeloCatalogo) => m.id.endsWith(":free");
  const recomendado = catalogo.find((m) => m.id === padrao);
  const destaques = DESTAQUES_PAGOS.map((id) => uteis.find((m) => m.id === id)).filter((m): m is ModeloCatalogo => Boolean(m));
  const idsDestaque = new Set(destaques.map((m) => m.id));
  return [
    ...(recomendado ? [opcao(recomendado, "recomendado")] : []),
    ...uteis.filter((m) => gratuito(m) && m.id !== padrao).sort(porContexto).slice(0, MODELOS_POR_GRUPO).map((m) => opcao(m, "gratuito")),
    ...destaques.map((m) => opcao(m, "destaque")),
    ...uteis.filter((m) => !gratuito(m) && !idsDestaque.has(m.id)).sort(porContexto).slice(0, MODELOS_POR_GRUPO).map((m) => opcao(m, "pago")),
  ];
}
