import { extractText } from "unpdf";
import { meta, respostaErro } from "@/lib/ai";
import { analisarContrato, VALORES_PAPEL } from "@/lib/contratos";
import { guardarContrato } from "@/lib/estado";
import { apagarTodos, listar, salvar, SENSIVEL } from "@/lib/historico";
import type { Analise } from "@/lib/types";

const LIMITE_PDF = 10 * 1024 * 1024; // 10 MB

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

  // Uma entrada por página do PDF; texto colado vira uma entrada só. lib/contratos.ts usa essa divisão
  // para cortar no limite do modelo e dizer, sem mentir, quantas páginas foram lidas.
  let paginas: string[];

  if (arquivo instanceof File && arquivo.size > 0) {
    const ehPdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name || "");
    if (!ehPdf) {
      return Response.json({ error: "Envie um arquivo PDF. Outros formatos não são aceitos; você pode colar o texto do contrato." }, { status: 400 });
    }
    if (arquivo.size > LIMITE_PDF) {
      return Response.json({ error: "O PDF passa de 10 MB. Reduza o arquivo ou cole o texto do contrato." }, { status: 400 });
    }
    try {
      // Sem mergePages: `text` vem como uma string por página do PDF.
      const { text } = await extractText(new Uint8Array(await arquivo.arrayBuffer()));
      paginas = text.map((p) => String(p || "").trim());
    } catch (err) {
      console.error(err);
      return Response.json({ error: "Não foi possível ler este PDF. Ele pode estar corrompido ou protegido; tente colar o texto do contrato." }, { status: 400 });
    }
    if (paginas.join("").length < 100) {
      return Response.json({ error: "Não encontramos texto legível neste PDF (pode ser um documento digitalizado como imagem). Cole o texto do contrato na outra aba." }, { status: 400 });
    }
  } else {
    const texto = String(form.get("texto") || "").trim();
    if (texto.length < 200) {
      return Response.json({ error: "Envie um PDF ou cole o texto do contrato (pelo menos algumas cláusulas)." }, { status: 400 });
    }
    paginas = [texto];
  }

  try {
    const { analise, meta: metaGerada } = await analisarContrato({ paginas, papel, preocupacao });
    const idContrato = guardarContrato({ paginas, papel, preocupacao });
    const id = idSalvo({ analise, papel, preocupacao, metaGerada, guardar });
    return Response.json({ idContrato, id, analise, meta: metaGerada });
  } catch (err) {
    // respostaErro traduz ErroIA em { error, codigo, acao } com o status certo (Fase 0): a tela
    // nunca recebe status HTTP cru nem o corpo do provedor.
    return respostaErro(err);
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
