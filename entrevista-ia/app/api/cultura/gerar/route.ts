// "Gerar a partir de um texto": o gestor cola a página "Sobre nós" ou o código de cultura da empresa
// e a IA propõe os valores e os dois textos (US-003). A resposta NÃO é salva — ela só preenche o
// formulário, e quem salva é o gestor depois de revisar. Cultura escrita por um modelo e gravada sem
// alguém ler vira critério de avaliação de gente sem dono, que é exatamente o que não pode acontecer.
import { responderErro } from "@/app/api/erros";
import { aiEnabled, askJSON } from "@/lib/ai";
import { LIMITE_DESCRICAO, LIMITE_NOME, LIMITE_TEXTO, MAX_VALORES, normalizarCultura } from "@/lib/cultura";
import { culturaDemo, esperar } from "@/lib/demo";

/** Corte do texto colado que vai no prompt. */
const LIMITE_ENTRADA = 8_000;

const SYSTEM = `Você lê um texto institucional de uma empresa (página "Sobre nós", código de cultura, manifesto, carta de valores) e resume o que essa empresa valoriza, para que uma entrevista de seleção avalie cultura com critérios claros.
Regras:
- Escreva em português do Brasil, curto e concreto, com as palavras do próprio texto.
- **Nunca invente.** Só escreva o que está no texto. O que não estiver lá volta como lista vazia ou texto vazio — uma lista vazia é uma resposta correta, um palpite não é.
- "nome" é um rótulo curto (no máximo 4 palavras, até ${LIMITE_NOME} caracteres). "descricao" é UMA frase dizendo o que aquilo significa na prática, em até ${LIMITE_DESCRICAO} caracteres.
- No máximo ${MAX_VALORES} valores, os mais presentes no texto. Valor repetido com outro nome conta uma vez só.
- "comportamentos" descreve o que se espera de uma pessoa no dia a dia; "naoCombina" descreve o que não funciona nessa empresa. Cada um em até ${LIMITE_TEXTO} caracteres, sem repetir a lista de valores palavra por palavra.
- Nada de linguagem de propaganda ("ambiente inovador", "time de alta performance") a não ser que o texto use essas palavras.
Formato de saída (JSON, sem nenhum texto fora dele):
{
  "valores": [{ "nome": "rótulo curto", "descricao": "uma frase sobre o que isso significa na prática" }],
  "comportamentos": "o que se espera no dia a dia",
  "naoCombina": "o que não funciona aqui"
}`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const texto = String((body as { texto?: unknown }).texto ?? "").trim();
  if (texto.length < 80) {
    return Response.json({ error: "Cole um texto um pouco maior sobre a empresa: com poucas linhas não dá para entender o que ela valoriza." }, { status: 400 });
  }
  const demo = !aiEnabled();
  try {
    if (demo) {
      await esperar(1200);
      return Response.json({ cultura: culturaDemo(), demo });
    }
    const bruto = await askJSON({ system: SYSTEM, prompt: texto.slice(0, LIMITE_ENTRADA), maxTokens: 1600 });
    return Response.json({ cultura: normalizarCultura(bruto), demo });
  } catch (err) {
    return responderErro(err, "Não foi possível ler este texto agora. Tente de novo ou preencha os campos à mão.");
  }
}
