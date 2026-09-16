import { aiEnabled, askText, respostaErro } from "@/lib/ai";
import { limitarTexto } from "@/lib/contratos";
import { esperar, respostaDemo } from "@/lib/demo";
import { obterContrato } from "@/lib/estado";

const SYSTEM_PERGUNTA = `Você é um advogado experiente em contratos empresariais brasileiros que apoia executivos não juristas.
Responda à pergunta do usuário com base exclusivamente no contrato fornecido, do ponto de vista do papel informado.
Regras:
- Português do Brasil, direto, no máximo 2 parágrafos curtos. Cite a cláusula ou o trecho que sustenta a resposta.
- Se o contrato não trata do assunto, diga isso claramente e sugira o que deveria constar.
- Não dê parecer jurídico definitivo: indique quando o ponto deve ser confirmado com o departamento jurídico.
- Responda em texto simples, sem markdown.`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; pergunta?: string };
  const { id } = body;
  const pergunta = String(body.pergunta || "").trim();
  if (!id || !pergunta) {
    return Response.json({ error: "Informe a pergunta sobre o contrato." }, { status: 400 });
  }
  const contrato = obterContrato(id);
  if (!contrato) {
    return Response.json(
      { error: "Este contrato não está mais disponível (ele fica guardado por 1 hora). Analise o contrato novamente." },
      { status: 404 }
    );
  }
  try {
    if (!aiEnabled()) {
      await esperar(1000);
      return Response.json({ demo: true, resposta: respostaDemo(pergunta) });
    }
    // Mesmo corte da análise: um contrato longo não pode estourar a janela do modelo aqui tampouco.
    const { texto, aviso } = limitarTexto(contrato.paginas);
    const cabecalho = aviso ? "Contrato (trecho inicial; o documento continua além do que foi enviado)" : "Contrato (texto integral)";
    const prompt = `${cabecalho}:\n"""\n${texto}\n"""\n\nPapel do usuário neste contrato: ${contrato.papel}.\n\nPergunta: ${pergunta}`;
    const resposta = await askText({ system: SYSTEM_PERGUNTA, prompt, maxTokens: 1500 });
    return Response.json({ demo: false, resposta: resposta.trim() });
  } catch (err) {
    return respostaErro(err);
  }
}
