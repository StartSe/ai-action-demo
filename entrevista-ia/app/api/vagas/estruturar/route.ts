// "Colar uma descrição pronta": o gestor cola o anúncio que já escreveu e a IA separa os campos da
// vaga (US-006). A resposta NÃO é salva — ela só preenche o formulário de `/vagas/nova`, e quem abre
// a vaga é o gestor depois de revisar. Mesmo desenho de `/api/cultura/gerar`, e pela mesma razão: o
// que a entrevistadora vai perguntar a um candidato de verdade não pode nascer sem alguém ler.
//
// O prompt manda deixar `null` no que a descrição não diz. É a regra que mais importa aqui: um campo
// em branco o gestor preenche; um campo inventado que parece certo ninguém revisa.
import { responderErro } from "@/app/api/erros";
import { aiEnabled, askJSON } from "@/lib/ai";
import { obterCultura } from "@/lib/cultura";
import { esperar, vagaEstruturadaDemo } from "@/lib/demo";
import {
  LIMITE_CARGO,
  LIMITE_DESCRICAO_COMPETENCIA,
  LIMITE_NOME_COMPETENCIA,
  MAX_COMPETENCIAS,
  normalizarVagaEstruturada,
} from "@/lib/vagas";

/** Corte do texto colado que vai no prompt — o mesmo teto do textarea da tela. */
const LIMITE_ENTRADA = 8_000;

/** Abaixo disso não é uma descrição de vaga, é um título: preencher a partir daí seria adivinhar. */
const MINIMO_ENTRADA = 80;

function instrucoes(valores: { id: string; nome: string; descricao: string }[]): string {
  const cultura = valores.length
    ? valores.map((v) => `- ${v.id}: ${v.nome}${v.descricao ? ` — ${v.descricao}` : ""}`).join("\n")
    : "(a empresa ainda não cadastrou o que valoriza)";
  return `Você lê a descrição de uma vaga escrita por uma empresa e separa os campos de um cadastro de vaga, para que uma entrevista de seleção saiba o que avaliar.
Regras:
- Escreva em português do Brasil, com as palavras da própria descrição.
- **Nunca invente.** Todo campo que a descrição não disser volta como null. Um campo null é uma resposta correta; um palpite não é.
- "cargo": o nome do cargo, em até ${LIMITE_CARGO} caracteres, sem senioridade repetida no fim quando ela já está em "senioridade".
- "senioridade": um de "estagio", "junior", "pleno", "senior", "lideranca", ou null.
- "modelo": um de "presencial", "hibrido", "remoto", ou null.
- "local": a cidade (e o estado) do trabalho, ou null.
- "salarioMin"/"salarioMax": números inteiros em reais, sem centavos e sem pontuação. Se a descrição disser que o salário é a combinar, devolva "salarioACombinar": true e os dois em null. Se ela não falar de salário, devolva os três em null/false.
- "requisitos": a lista do que é exigido da pessoa, um item por elemento, cada um em uma frase curta. Só o que a descrição pede.
- "desafios": o que essa pessoa precisa resolver nos primeiros meses, em uma a três frases. Null quando a descrição só lista requisitos.
- "competenciasCulturais": o que a entrevista deve avaliar além do técnico. Escolha entre os valores da empresa abaixo os que ESTA descrição realmente cobra, devolvendo o "id" exato de cada um; a que a descrição cobra e não está na lista da empresa entra com "nome" (até ${LIMITE_NOME_COMPETENCIA} caracteres) e "descricao" (uma frase, até ${LIMITE_DESCRICAO_COMPETENCIA} caracteres). No máximo ${MAX_COMPETENCIAS}, e nenhuma quando a descrição não cobra nada disso.
- Nada de linguagem de propaganda ("ambiente inovador", "time de alta performance") a não ser que a descrição use essas palavras.
Valores da empresa (use o id exato):
${cultura}
Formato de saída (JSON, sem nenhum texto fora dele):
{
  "cargo": "texto ou null",
  "area": "texto ou null",
  "senioridade": "pleno ou null",
  "modelo": "hibrido ou null",
  "local": "texto ou null",
  "salarioMin": 5500,
  "salarioMax": 7000,
  "salarioACombinar": false,
  "desafios": "texto ou null",
  "requisitos": ["um requisito por item"],
  "competenciasCulturais": [{ "id": "id-do-valor-da-empresa" }, { "nome": "competência só desta vaga", "descricao": "uma frase" }]
}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const texto = String((body as { texto?: unknown }).texto ?? "").trim();
  if (texto.length < MINIMO_ENTRADA) {
    return Response.json(
      { error: "Cole a descrição inteira da vaga: com poucas linhas não dá para separar requisitos e desafios." },
      { status: 400 },
    );
  }

  const cultura = obterCultura();
  const demo = !aiEnabled();
  try {
    if (demo) {
      await esperar(1200);
      return Response.json({ vaga: vagaEstruturadaDemo(cultura.valores), demo });
    }
    const bruto = await askJSON({ system: instrucoes(cultura.valores), prompt: texto.slice(0, LIMITE_ENTRADA), maxTokens: 2000 });
    return Response.json({ vaga: normalizarVagaEstruturada(bruto, cultura.valores), demo });
  } catch (err) {
    return responderErro(err, "Não foi possível ler esta descrição agora. Tente de novo ou preencha os campos à mão.");
  }
}

