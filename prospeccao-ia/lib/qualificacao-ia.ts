// Avaliação de critério INTERPRETATIVO por IA (US-024, prd.json > regras: "só usa IA para o que é
// interpretativo, sempre citando o trecho que embasou"): usada só para o texto livre do ICP que uma
// comparação de termo não decide sozinha ("outros critérios" em B2B, "contexto" em B2C) — nunca para os
// critérios objetivos (porte, localização, setor, cargo), que continuam em lib/qualificacao.ts.
// SEPARADO de lib/qualificacao.ts de propósito: este arquivo importa lib/ai.ts (que importa lib/store.ts,
// com node:sqlite) e só pode ser chamado por código de SERVIDOR (lib/execucao-prospeccao.ts) — nunca por
// um Client Component, que importaria node:sqlite para dentro do bundle do navegador.
import { aiEnabled, askJSON } from "./ai";
import { data } from "./formato";
import { contemTermo } from "./qualificacao";
import { termoSensivel } from "./sensivel";
import type { Evidencia, Jornada, SinalProspeccao } from "./types";

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

const SYSTEM_HIPOTESE_DOR = `Você é um vendedor B2B experiente escrevendo uma hipótese de dor sobre UM lead, a partir só dos sinais públicos informados e das dores típicas do perfil de cliente ideal (ICP).
Regras:
- Baseie-se SÓ nos sinais informados; nunca afirme como fato algo que eles não sustentam. Não invente cargo, contexto ou problema que não esteja nos sinais.
- A frase é sempre condicional: use "pode estar", "provavelmente", "talvez" ou construção equivalente — nunca uma afirmação categórica.
- Cite ao menos um dos sinais informados dentro da frase (pode citar a data dele).
- 1 a 2 frases curtas, português do Brasil, sem clichê de vendas.
Formato de saída (JSON): { "hipotese": string }`;

// US-028: em B2C a hipótese fala de NECESSIDADE ou MOMENTO de vida (nunca de característica pessoal
// protegida — raça, religião, orientação sexual, saúde, opinião política, sindicalização), regra que o
// SYSTEM abaixo reforça para a IA; sinais/dores que batem em lib/sensivel.ts:termoSensivel nem chegam a
// entrar no prompt nem na frase-modelo sem IA (gerarHipoteseDor filtra antes), então a proibição vale nos
// dois caminhos, não só quando há IA configurada.
const SYSTEM_HIPOTESE_DOR_B2C = `Você escreve uma hipótese de dor sobre UMA PESSOA FÍSICA (não uma empresa), a partir só dos sinais públicos informados e das dores típicas do perfil de cliente ideal (ICP).
Regras:
- Baseie-se SÓ nos sinais informados; nunca afirme como fato algo que eles não sustentam. Não invente contexto ou problema que não esteja nos sinais.
- Fale de NECESSIDADE ou MOMENTO de vida (ex.: mudança recente, novo projeto, busca por algo) — NUNCA de característica pessoal protegida (raça, religião, orientação sexual, saúde, opinião política ou sindicalização).
- A frase é sempre condicional: use "pode estar", "provavelmente", "talvez" ou construção equivalente — nunca uma afirmação categórica.
- Cite ao menos um dos sinais informados dentro da frase (pode citar a data dele).
- 1 a 2 frases curtas, português do Brasil, sem clichê de vendas.
Formato de saída (JSON): { "hipotese": string }`;

/** Hipótese de dor de um lead (US-025), gerada a partir dos SINAIS que ele já tem (nunca das evidências,
 * que ficam num bloco separado — "a ficha nunca mistura hipótese e evidência no mesmo bloco") e das dores
 * do ICP. Sem nenhum sinal, não há do que partir: devolve `null` direto, sem chamar a IA (a tela mostra
 * "Ainda sem sinais públicos suficientes para uma hipótese" nesse caso). Sem IA configurada, cai numa
 * frase-modelo determinística que já respeita as mesmas regras (condicional, cita o sinal mais recente com
 * data) — é o que mantém a demonstração funcionando sem nenhuma chave.
 * `jornada` (US-028, padrão "b2b" — todo call-site anterior continua igual): em "b2c", sinais e dores que
 * contêm um termo de categoria sensível são descartados ANTES de virar sinal principal/entrar no prompt
 * (nunca chegam nem à frase-modelo sem IA, nem ao texto enviado à IA), e o SYSTEM usado passa a exigir
 * "necessidade ou momento", nunca característica pessoal protegida. */
export async function gerarHipoteseDor(sinais: SinalProspeccao[], dores: string[], jornada: Jornada = "b2b"): Promise<string | null> {
  const sinaisSeguros = jornada === "b2c" ? sinais.filter((s) => !termoSensivel(s.descricao)) : sinais;
  if (sinaisSeguros.length === 0) return null;
  const sinalPrincipal = [...sinaisSeguros].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
  const dataSinal = data(sinalPrincipal.data, { comAno: true });
  const doresSeguras = jornada === "b2c" ? dores.filter((d) => !termoSensivel(d)) : dores;

  if (!aiEnabled()) {
    const dor = doresSeguras[0];
    return dor
      ? `Pode estar enfrentando ${dor.charAt(0).toLowerCase()}${dor.slice(1)}, a julgar por “${sinalPrincipal.descricao}” (${dataSinal}).`
      : `“${sinalPrincipal.descricao}” (${dataSinal}) talvez seja um bom momento para essa conversa.`;
  }

  try {
    const sinaisTexto = sinaisSeguros.map((s) => `- ${s.descricao} (${data(s.data, { comAno: true })})`).join("\n");
    const doresTexto = doresSeguras.length > 0 ? doresSeguras.join("; ") : "não informadas";
    const resposta = await askJSON<{ hipotese?: string }>({
      system: jornada === "b2c" ? SYSTEM_HIPOTESE_DOR_B2C : SYSTEM_HIPOTESE_DOR,
      prompt: `Sinais públicos encontrados sobre o lead:\n${sinaisTexto}\n\nDores típicas do perfil de cliente ideal: ${doresTexto}`,
      maxTokens: 200,
    });
    return resposta.hipotese?.trim() || null;
  } catch (err) {
    console.error("Falha ao gerar hipótese de dor:", err instanceof Error ? err.message : err);
    return null;
  }
}
