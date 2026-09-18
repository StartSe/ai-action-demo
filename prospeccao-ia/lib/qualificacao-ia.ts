// Avaliação de critério INTERPRETATIVO por IA (US-024, prd.json > regras: "só usa IA para o que é
// interpretativo, sempre citando o trecho que embasou"): usada só para o texto livre do ICP que uma
// comparação de termo não decide sozinha ("outros critérios" em B2B, "contexto" em B2C) — nunca para os
// critérios objetivos (porte, localização, setor, cargo), que continuam em lib/qualificacao.ts.
// SEPARADO de lib/qualificacao.ts de propósito: este arquivo importa lib/ai.ts (que importa lib/store.ts,
// com node:sqlite) e só pode ser chamado por código de SERVIDOR (lib/execucao-prospeccao.ts) — nunca por
// um Client Component, que importaria node:sqlite para dentro do bundle do navegador.
import { aiEnabled, askJSON } from "./ai";
import { contemTermo } from "./qualificacao";
import type { Evidencia } from "./types";

const SYSTEM_QUALIFICACAO_IA = `Você decide se um critério de perfil de cliente ideal (ICP) é atendido, a partir só do texto informado (uma página institucional ou um perfil público).
Regras:
- Responda só com base no texto dado; nunca invente ou suponha o que ele não diz.
- "atende": o texto confirma o critério. "nao_atende": o texto contradiz explicitamente o critério. "nao_verificavel": o texto não fala sobre isso.
- "trecho" é uma cópia literal (até 200 caracteres) do texto que embasou a resposta; null quando o resultado é "nao_verificavel".
Formato de saída (JSON): { "resultado": "atende" | "nao_atende" | "nao_verificavel", "trecho": string | null }`;

/** Sem valor (critério não preenchido no ICP/na busca) não gera evidência nenhuma — mesma regra de
 * `avaliarCriterios`. Sem IA configurada, cai no mesmo term-match de `lib/qualificacao.ts` (a demonstração
 * precisa funcionar sem nenhuma chave), só que sem `trecho` — não há IA para citar um. */
export async function avaliarCriterioInterpretativo(conteudo: string, criterio: string, valor: string | undefined): Promise<Evidencia | null> {
  const v = (valor || "").trim();
  if (!v) return null;

  if (!aiEnabled()) {
    return { criterio, valor: v, resultado: contemTermo(conteudo, v) ? "atende" : "nao_verificavel" };
  }

  try {
    const resposta = await askJSON<{ resultado?: string; trecho?: string | null }>({
      system: SYSTEM_QUALIFICACAO_IA,
      prompt: `Critério: "${v}"\n\nTexto:\n"""\n${conteudo.slice(0, 4000)}\n"""`,
      maxTokens: 300,
    });
    const resultado: Evidencia["resultado"] =
      resposta.resultado === "atende" || resposta.resultado === "nao_atende" ? resposta.resultado : "nao_verificavel";
    return { criterio, valor: v, resultado, trecho: resultado === "nao_verificavel" ? undefined : resposta.trecho || undefined };
  } catch (err) {
    console.error("Falha ao avaliar critério interpretativo por IA:", criterio, err instanceof Error ? err.message : err);
    return { criterio, valor: v, resultado: "nao_verificavel" };
  }
}
