import { extractText } from "unpdf";
import { aiEnabled, askJSON, meta } from "@/lib/ai";
import { analiseDemo, esperar } from "@/lib/demo";
import { guardarContrato } from "@/lib/estado";
import { apagarTodos, listar, salvar, SENSIVEL } from "@/lib/historico";
import { PAPEIS, type Analise } from "@/lib/types";

const LIMITE_PDF = 10 * 1024 * 1024; // 10 MB
const VALORES_PAPEL = PAPEIS.map((p) => p.valor);

const SYSTEM_ANALISE = `Você é um advogado experiente em contratos empresariais brasileiros que apoia executivos não juristas.
Sua tarefa é ler um contrato e apontar, do ponto de vista do papel informado pelo usuário, os riscos, os prazos e o que está faltando, para que ele decida o que negociar antes de enviar ao departamento jurídico.
Regras:
- Escreva em português do Brasil, direto, sem juridiquês. Explique o impacto prático de cada risco.
- Avalie tudo pela ótica do papel informado (quem está do outro lado se beneficia do que pesa contra ele).
- Cite trechos curtos e literais do contrato (até 200 caracteres) em "trecho". Não invente cláusulas: se algo não estiver no contrato, registre em "pontos_ausentes".
- nota_risco vai de 0 a 10, onde 10 é o mais arriscado para o papel informado. Seja calibrado: 3 a 4 para contratos equilibrados, 7 ou mais quando há cláusulas claramente desfavoráveis.
- Se o usuário indicou uma preocupação, trate-a explicitamente em pelo menos um item.
- Máximo de 8 cláusulas de risco, 8 prazos, 8 obrigações, 8 pontos ausentes e 6 perguntas.
- Se o documento não for um contrato ou não tiver texto legível, explique isso no resumo_executivo e devolva as listas vazias.
Formato de saída (JSON):
{
  "tipo_contrato": "ex.: Contrato de prestação de serviços de tecnologia",
  "resumo_executivo": "3 frases: o que é, o que mais pesa contra o papel informado e o que fazer antes de assinar",
  "partes": [{"nome": "", "papel": ""}],
  "objeto": "1 a 2 frases",
  "valor_e_pagamento": "valores, periodicidade, reajuste e penalidades por atraso",
  "vigencia_e_rescisao": "prazo, renovação, aviso prévio e multas",
  "nota_risco": 0,
  "prazos_criticos": [{"evento": "", "prazo": ""}],
  "clausulas_risco": [{"clausula": "", "trecho": "", "risco": "", "severidade": "alta|média|baixa", "sugestao_negociacao": ""}],
  "obrigacoes_principais": ["obrigação do papel informado"],
  "pontos_ausentes": ["o que um contrato deste tipo costuma ter e este não tem"],
  "perguntas_para_o_juridico": ["pergunta objetiva"]
}`;

/** Quando o app é sensível, só salva com opt-in explícito e por 30 dias. */
function idSalvo({ analise, papel, preocupacao, metaGerada, guardar }: { analise: Analise; papel: string; preocupacao: string; metaGerada: ReturnType<typeof meta>; guardar: boolean }) {
  if (SENSIVEL && !guardar) return undefined;
  return salvar({
    tipo: "contrato",
    titulo: `Análise: ${analise.tipo_contrato || "Contrato"}`,
    entrada: { papel, preocupacao },
    saida: analise,
    meta: metaGerada,
    expiraEmDias: SENSIVEL ? 30 : undefined,
  });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Envie um PDF ou cole o texto do contrato." }, { status: 400 });
  }

  const arquivo = form.get("arquivo");
  const papelInformado = String(form.get("papel") || "").trim().toLowerCase();
  const papel = VALORES_PAPEL.includes(papelInformado) ? papelInformado : "outro";
  const preocupacao = String(form.get("preocupacao") || "").trim();
  const guardar = String(form.get("guardar") || "") === "true";

  let texto: string;

  if (arquivo instanceof File && arquivo.size > 0) {
    const ehPdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name || "");
    if (!ehPdf) {
      return Response.json({ error: "Envie um arquivo PDF. Outros formatos não são aceitos; você pode colar o texto do contrato." }, { status: 400 });
    }
    if (arquivo.size > LIMITE_PDF) {
      return Response.json({ error: "O PDF passa de 10 MB. Reduza o arquivo ou cole o texto do contrato." }, { status: 400 });
    }
    try {
      const { text } = await extractText(new Uint8Array(await arquivo.arrayBuffer()), { mergePages: true });
      texto = String(text || "").trim();
    } catch (err) {
      console.error(err);
      return Response.json({ error: "Não foi possível ler este PDF. Ele pode estar corrompido ou protegido; tente colar o texto do contrato." }, { status: 400 });
    }
    if (texto.length < 100) {
      return Response.json({ error: "Não encontramos texto legível neste PDF (pode ser um documento digitalizado como imagem). Cole o texto do contrato na outra aba." }, { status: 400 });
    }
  } else {
    texto = String(form.get("texto") || "").trim();
    if (texto.length < 200) {
      return Response.json({ error: "Envie um PDF ou cole o texto do contrato (pelo menos algumas cláusulas)." }, { status: 400 });
    }
  }

  try {
    const insumo = "todo o contrato enviado e o papel informado";
    if (!aiEnabled()) {
      await esperar(1400);
      const idContrato = guardarContrato({ texto, papel, preocupacao });
      const analise = analiseDemo({ papel, preocupacao });
      const metaGerada = meta({ demo: true, insumo });
      const id = idSalvo({ analise, papel, preocupacao, metaGerada, guardar });
      return Response.json({ idContrato, id, analise, meta: metaGerada });
    }
    const prompt = `Papel do usuário neste contrato: ${papel}.\nO que mais preocupa o usuário: ${preocupacao || "não informado"}.\n\nContrato (texto integral):\n"""\n${texto}\n"""\n\nAnalise o contrato acima e devolva o JSON pedido.`;
    const analise = await askJSON<Analise>({ system: SYSTEM_ANALISE, prompt, maxTokens: 8000 });
    const idContrato = guardarContrato({ texto, papel, preocupacao });
    const metaGerada = meta({ demo: false, insumo });
    const id = idSalvo({ analise, papel, preocupacao, metaGerada, guardar });
    return Response.json({ idContrato, id, analise, meta: metaGerada });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível analisar o contrato agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
