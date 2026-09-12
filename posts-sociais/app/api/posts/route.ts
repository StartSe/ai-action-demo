import { aiEnabled, askJSON, meta } from "@/lib/ai";
import { esperar, postsDemo } from "@/lib/demo";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import type { DadosPosts, Post, Rede, ResultadoPosts } from "@/lib/types";

const REDES: Record<Rede, string> = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" };

const SYSTEM = `Você é um redator sênior de conteúdo para redes sociais que atende empresas brasileiras.
Sua tarefa é transformar um briefing curto em posts prontos para publicar, um por rede solicitada, com uma sugestão de imagem para cada um.
Regras:
- Escreva em português do Brasil, com naturalidade, sem clichês de marketing e sem promessas vazias.
- Respeite o tom pedido e fale com o público-alvo indicado.
- LinkedIn: até 1300 caracteres, parágrafos curtos separados por linha em branco, abertura forte na primeira linha, pode usar lista com hífen, sem hashtags dentro do texto (vão no campo próprio), no máximo 5 hashtags.
- Instagram: legenda de 400 a 900 caracteres, mais próxima e visual, pode usar até 3 emojis, entre 6 e 10 hashtags no campo próprio.
- X: até 280 caracteres no total (texto), direto e memorável, até 2 hashtags no campo próprio.
- Cada post deve ter um chamado para ação coerente com o objetivo.
- prompt_imagem: em inglês, descritivo (cena, estilo, luz, paleta, enquadramento), sem pedir texto, letras ou logotipos na imagem. Instagram é quadrado; LinkedIn e X são horizontais.
- melhor_horario: sugestão curta em português, por exemplo "terça ou quarta, entre 8h e 9h".
Formato de saída (JSON):
{
  "ideia_central": "1 a 2 frases com a mensagem única que todos os posts compartilham",
  "posts": [
    { "rede": "linkedin|instagram|x", "texto": "", "hashtags": ["#exemplo"], "melhor_horario": "", "prompt_imagem": "" }
  ]
}`;

export async function POST(req: Request) {
  const dados = (await req.json().catch(() => ({}))) as Partial<DadosPosts>;
  const { empresa, tema, objetivo, tom, redes, publico } = dados;
  const lista = (Array.isArray(redes) ? redes : []).filter((r) => REDES[r as Rede]) as Rede[];
  if (!empresa || !tema) {
    return Response.json({ error: "Preencha a empresa ou marca e o tema do post." }, { status: 400 });
  }
  if (!lista.length) {
    return Response.json({ error: "Escolha pelo menos uma rede social." }, { status: 400 });
  }
  try {
    const insumo = "dados da empresa, o tema e o público-alvo informados";
    if (!aiEnabled()) {
      await esperar(1300);
      const resultado = postsDemo({ empresa, tema, redes: lista });
      const metaGerada = meta({ demo: true, insumo });
      const id = salvar({ tipo: "posts", titulo: `Posts de ${empresa}`, entrada: dados, saida: resultado, meta: metaGerada });
      return Response.json({ resultado, meta: metaGerada, id });
    }
    const prompt = `Empresa ou marca: ${empresa}\nTema ou novidade:\n${tema}\n\nObjetivo: ${objetivo || "fortalecer marca"}\nTom: ${tom || "executivo"}\nPúblico-alvo: ${publico || "não informado"}\nRedes solicitadas (gere exatamente um post para cada, nesta ordem): ${lista.map((r) => REDES[r]).join(", ")}`;
    const resultado = await askJSON<ResultadoPosts>({ system: SYSTEM, prompt });
    resultado.posts = (resultado.posts || []).map((p: Post) => ({ ...p, rede: String(p.rede || "").toLowerCase() as Rede, hashtags: Array.isArray(p.hashtags) ? p.hashtags : [] }));
    const metaGerada = meta({ demo: false, insumo });
    const id = salvar({ tipo: "posts", titulo: `Posts de ${empresa}`, entrada: dados, saida: resultado, meta: metaGerada });
    return Response.json({ resultado, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar os posts agora. Tente novamente.";
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
