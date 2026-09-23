// A conversa. Sem estado no servidor: a tela manda o histórico inteiro a cada volta, que é o
// suficiente para uma conversa curta e evita mais uma tabela.
//
// Dois modos, decididos pelo que já existe no banco:
//
//  - **abertura**: ainda não há item cadastrado. A IA pergunta sobre o negócio e devolve um
//    rascunho de preenchimento (lib/conversa.ts).
//  - **assistente**: já há itens. A IA responde sobre eles, chamando as ferramentas do app
//    (lib/assistente.ts). É a mesma conta que a tela mostra, não uma foto colada no prompt.
import { respostaErro } from "@/lib/ai";
import { perguntarAoAssistente } from "@/lib/assistente";
import { montarCarteira } from "@/lib/carteira";
import { conversar, type Fala } from "@/lib/conversa";

export const dynamic = "force-dynamic";

const LIMITE_FALAS = 40;
const LIMITE_TEXTO = 4000;

/** O modo em que a conversa abre, para a tela dizer a coisa certa antes da primeira pergunta. */
export async function GET() {
  const { linhas } = montarCarteira();
  return Response.json({ modo: linhas.length > 0 ? "assistente" : "abertura", itens: linhas.length });
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { falas?: Fala[]; modo?: string } | null;
  if (!Array.isArray(corpo?.falas) || corpo.falas.length === 0) {
    return Response.json({ error: "Escreva alguma coisa para começar a conversa." }, { status: 400 });
  }

  const falas: Fala[] = corpo.falas
    .slice(-LIMITE_FALAS)
    .filter((f) => f && typeof f.texto === "string" && f.texto.trim())
    .map((f) => ({ de: f.de === "assistente" ? "assistente" : "pessoa", texto: f.texto.slice(0, LIMITE_TEXTO) }));

  if (falas.length === 0) {
    return Response.json({ error: "Escreva alguma coisa para começar a conversa." }, { status: 400 });
  }

  // A tela pede explicitamente o modo de abertura quando a pessoa quer refazer o preenchimento
  // mesmo já tendo itens; fora isso, quem decide é o que existe no banco.
  const temItens = montarCarteira().linhas.length > 0;
  const modo = corpo.modo === "abertura" || !temItens ? "abertura" : "assistente";

  try {
    if (modo === "assistente") {
      const { resposta, fontes, meta } = await perguntarAoAssistente(falas);
      return Response.json({ resposta, proposta: null, fontes, meta, modo });
    }
    return Response.json({ ...(await conversar(falas)), modo });
  } catch (err) {
    return respostaErro(err);
  }
}
